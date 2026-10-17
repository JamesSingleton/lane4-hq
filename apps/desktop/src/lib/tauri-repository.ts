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

export function importBackup(path: string): Promise<string> {
  return invoke<string>("store_import_backup", { path });
}
