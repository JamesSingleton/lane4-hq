import type { Meet } from "@lane4hq/meet-engine/model";
import { invoke } from "@tauri-apps/api/core";
import {
  type MeetRepository,
  type MeetSummary,
  parseMeet,
} from "./meet-repository";

export const tauriRepository: MeetRepository = {
  list: () => invoke<MeetSummary[]>("store_list_meets"),
  load: async (id) =>
    parseMeet(await invoke<string>("store_load_meet", { id })),
  save: (meet: Meet) =>
    invoke<void>("store_save_meet", {
      id: meet.id,
      json: JSON.stringify(meet),
    }),
  remove: (id) => invoke<void>("store_delete_meet", { id }),
  appendCapture: (id, line) =>
    invoke<void>("store_append_capture", { id, line }),
  restoreBackup: (id) => invoke<void>("store_restore_backup", { id }),
  readJournal: (id) => invoke<string>("store_read_journal", { id }),
};

/**
 * Import a `.lane4meet` backup. Rejects with `{ kind: "alreadyExists" }` when
 * that meet is already on this computer, unless `replace` (the current copy
 * is then kept in the trash).
 */
export function importBackup(path: string, replace = false): Promise<string> {
  return invoke<string>("store_import_backup", { path, replace });
}

export function isAlreadyExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { kind?: unknown }).kind === "alreadyExists"
  );
}
