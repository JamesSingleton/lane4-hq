import type { Meet } from "@lane4hq/meet-engine/model";

export type MeetSummary = {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  course?: string | null;
  updatedAt?: string | null;
  teams: number;
  events: number;
  /** The JSON file doesn't parse. Shown on the meets list with a way to recover. */
  corrupt?: boolean;
  /** A previous save (`.json.bak`) parses as this meet. */
  hasBackup?: boolean;
  /** Non-empty lines in the timing journal. */
  journalLines?: number;
};

/** Where meets live: the Rust store on desktop, localStorage in `dev:web`. */
export interface MeetRepository {
  list(): Promise<MeetSummary[]>;
  load(id: string): Promise<Meet>;
  save(meet: Meet): Promise<void>;
  remove(id: string): Promise<void>;
  /** Append one line to the meet's raw timing journal. */
  appendCapture(id: string, line: string): Promise<void>;
  /** Replace a damaged meet file with its `.json.bak`. Desktop only. */
  restoreBackup(id: string): Promise<void>;
  /** The raw timing journal, or "" when this meet has none. */
  readJournal(id: string): Promise<string>;
}

export function summarize(meet: Meet): MeetSummary {
  return {
    id: meet.id,
    name: meet.name,
    startDate: meet.startDate,
    endDate: meet.endDate,
    course: meet.course,
    updatedAt: meet.updatedAt,
    teams: meet.teams.length,
    events: meet.events.length,
  };
}

export function parseMeet(json: string): Meet {
  const meet = JSON.parse(json) as Meet;
  if (meet?.schemaVersion !== 1 || typeof meet.id !== "string") {
    throw new Error(
      "This isn't a Lane4 meet file (or it's from a newer version).",
    );
  }
  return meet;
}

/** In-memory/localStorage repository for the browser dev shell and tests. */
export function createBrowserRepository(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): MeetRepository {
  const memory = new Map<string, string>();
  const key = (id: string) => `lane4.meet.v1:${id}`;
  const indexKey = "lane4.meets.v1";
  const read = (k: string) => storage?.getItem(k) ?? memory.get(k) ?? null;
  const write = (k: string, v: string) => {
    memory.set(k, v);
    try {
      storage?.setItem(k, v);
    } catch {
      // Quota or private mode: memory copy still works for this session.
    }
  };
  const ids = (): string[] => JSON.parse(read(indexKey) ?? "[]");

  return {
    async list() {
      return ids()
        .flatMap((id) => {
          const json = read(key(id));
          return json ? [summarize(parseMeet(json))] : [];
        })
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    },
    async load(id) {
      const json = read(key(id));
      if (!json) throw new Error("Meet not found.");
      return parseMeet(json);
    },
    async save(meet) {
      write(key(meet.id), JSON.stringify(meet));
      if (!ids().includes(meet.id))
        write(indexKey, JSON.stringify([...ids(), meet.id]));
    },
    async remove(id) {
      write(indexKey, JSON.stringify(ids().filter((x) => x !== id)));
      memory.delete(key(id));
      storage?.removeItem(key(id));
    },
    async appendCapture(id, line) {
      const k = `lane4.captures.v1:${id}`;
      write(k, `${read(k) ?? ""}${line}\n`);
    },
    async restoreBackup() {
      throw new Error("Meet backups are kept by the desktop app.");
    },
    async readJournal(id) {
      return read(`lane4.captures.v1:${id}`) ?? "";
    },
  };
}

/**
 * Serializes saves so the newest document always wins and writes never
 * overlap: while one save runs, later changes coalesce into the next one.
 */
export function createSaveQueue(
  save: (meet: Meet) => Promise<void>,
  onState: (state: SaveState) => void,
) {
  let pending: Meet | null = null;
  let running: Promise<void> | null = null;

  async function run() {
    while (pending) {
      const next = pending;
      pending = null;
      onState({ status: "saving" });
      try {
        await save(next);
        onState({ status: pending ? "saving" : "saved", at: next.updatedAt });
      } catch (error) {
        onState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    running = null;
  }

  return {
    push(meet: Meet) {
      pending = meet;
      running ??= run();
      return running;
    },
    /** Resolves when everything pushed so far is on disk. */
    flush(): Promise<void> {
      return running ?? Promise.resolve();
    },
  };
}

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: string }
  | { status: "error"; message: string };
