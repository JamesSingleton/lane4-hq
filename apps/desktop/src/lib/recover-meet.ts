import { addCapture, findCapture } from "@lane4hq/meet-engine/adjudicate";
import type { IdFactory, Meet } from "@lane4hq/meet-engine/model";
import { fromHex } from "@lane4hq/timing-cts/frame";
import { decodeRace } from "@lane4hq/timing-cts/race";

export type JournalReplay = {
  meet: Meet;
  added: number;
  alreadyRecorded: number;
  unreadable: number;
};

type JournalLine = {
  captureId?: string;
  at?: string;
  timer?: string;
  raw: string;
};

function parseJournalLine(line: string): JournalLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as {
    captureId?: unknown;
    at?: unknown;
    timer?: unknown;
    raw?: unknown;
  };
  if (typeof record.raw !== "string" || record.raw.length === 0) return null;
  const at = typeof record.at === "string" ? record.at : undefined;
  if (at && Number.isNaN(Date.parse(at))) return null;
  return {
    captureId:
      typeof record.captureId === "string" && record.captureId
        ? record.captureId
        : undefined,
    at,
    timer: typeof record.timer === "string" ? record.timer : undefined,
    raw: record.raw,
  };
}

/**
 * Add races from the timing journal onto a meet document. The journal is raw
 * timer DATA, so it can refill captures on a restored meet. It cannot rebuild
 * events, teams, or entries by itself.
 *
 * Lines are applied in order. A race already in the meet (same race number and
 * timer date) is left as it is.
 */
export function replayCaptureJournal(
  meet: Meet,
  journal: string,
  options: { newId?: IdFactory; now?: Date } = {},
): JournalReplay {
  let current = meet;
  let added = 0;
  let alreadyRecorded = 0;
  let unreadable = 0;

  for (const line of journal.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseJournalLine(line);
    if (!parsed) {
      unreadable += 1;
      continue;
    }
    let raw: Uint8Array;
    try {
      raw = fromHex(parsed.raw);
      const race = decodeRace(raw);
      if (findCapture(current, race)) {
        alreadyRecorded += 1;
        continue;
      }
      const captureId = parsed.captureId;
      const captured = addCapture(
        current,
        { race, raw, timerVersion: parsed.timer },
        {
          newId: captureId ? () => captureId : options.newId,
          now: parsed.at ? new Date(parsed.at) : options.now,
        },
      );
      current = captured.meet;
      added += 1;
    } catch {
      unreadable += 1;
    }
  }

  return { meet: current, added, alreadyRecorded, unreadable };
}

/** What to show after a backup restore, including any journal replay. */
export function recoverySummary(result: {
  added: number;
  unreadable: number;
}): string {
  const parts = ["Restored the previous save of this meet."];
  if (result.added === 1) {
    parts.push("1 race from the timing journal was added back.");
  } else if (result.added > 1) {
    parts.push(
      `${result.added} races from the timing journal were added back.`,
    );
  }
  if (result.unreadable === 1) {
    parts.push("1 journal line couldn't be read.");
  } else if (result.unreadable > 1) {
    parts.push(`${result.unreadable} journal lines couldn't be read.`);
  }
  return parts.join(" ");
}

function raceCount(lines: number): string {
  return lines === 1 ? "1 race" : `${lines} races`;
}

/** Plain-language explanation of a meet file that doesn't parse. */
export function damagedMeetMessage(meet: {
  hasBackup?: boolean;
  journalLines?: number;
}): string {
  const lines = meet.journalLines ?? 0;
  if (!meet.hasBackup) {
    if (lines > 0) {
      return `This meet file is damaged and there's no backup. The timing journal has ${raceCount(lines)}, but it only has raw timer data, so the meet can't be rebuilt from it. Open a .lane4meet backup if you have one.`;
    }
    return "This meet file is damaged and there's no backup. Open a .lane4meet backup if you have one.";
  }
  const base = "This meet file is damaged. The previous save can be restored.";
  if (lines > 0) {
    return `${base} The timing journal has ${raceCount(lines)} that will be added back if they aren't already in that save.`;
  }
  return base;
}
