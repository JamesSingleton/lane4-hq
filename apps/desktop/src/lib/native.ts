import type { TimerTransport } from "@lane4hq/timing-cts/client";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { basename, MEET_FILE_EXTENSIONS, type SourceFile } from "./meet-file";

export { isTauri };

export async function readMeetFile(path: string): Promise<SourceFile> {
  const buffer = await invoke<ArrayBuffer>("read_meet_file", { path });
  return { filename: basename(path), bytes: new Uint8Array(buffer) };
}

export function readMeetFiles(paths: string[]): Promise<SourceFile[]> {
  return Promise.all(paths.map(readMeetFile));
}

/** Native open dialog. Resolves to [] when the user cancels. */
export async function pickMeetFilePaths(
  title = "Open meet files",
  multiple = true,
): Promise<string[]> {
  const selected = await open({
    multiple,
    directory: false,
    title,
    filters: [{ name: "Meet files", extensions: [...MEET_FILE_EXTENSIONS] }],
  });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function pickBackupPath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Open a Lane4 meet backup",
    filters: [{ name: "Lane4 meet", extensions: ["lane4meet"] }],
  });
  return typeof selected === "string" ? selected : null;
}

/** Keep in sync with `ALLOWED` in `src-tauri/src/export_file.rs`. */
export const EXPORT_EXTENSIONS = [
  "zip",
  "hy3",
  "cl2",
  "sd3",
  "csv",
  "pdf",
  "lane4meet",
] as const;

export type ExportFile = { filename: string; bytes: Uint8Array };

/** Save dialog, then write. Resolves false when the user cancels. */
export async function saveExportFile(file: ExportFile): Promise<boolean> {
  const ext = file.filename.split(".").pop()?.toLowerCase() ?? "";
  if (!isTauri()) {
    const url = URL.createObjectURL(new Blob([file.bytes.slice().buffer]));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
  const path = await save({
    defaultPath: file.filename,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return false;
  await invoke("write_export_file", { path, bytes: Array.from(file.bytes) });
  return true;
}

/**
 * Open a PDF report in the system viewer (Preview, Edge, …) to print. In a
 * plain browser (dev), open it in a new tab instead.
 */
export async function openReport(name: string, bytes: Uint8Array) {
  if (!isTauri()) {
    const url = URL.createObjectURL(
      new Blob([bytes.slice().buffer], { type: "application/pdf" }),
    );
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  await invoke("open_report", { name, bytes: Array.from(bytes) });
}

export type DropState = "idle" | "over";

/** Subscribe to OS file drops on the window. Returns an unsubscribe function. */
export function onFileDrop(handlers: {
  onDrop: (paths: string[]) => void;
  onStateChange: (state: DropState) => void;
}): () => void {
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  getCurrentWebview()
    .onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === "enter" || type === "over") {
        handlers.onStateChange("over");
      } else if (type === "leave") {
        handlers.onStateChange("idle");
      } else if (type === "drop") {
        handlers.onStateChange("idle");
        if (event.payload.paths.length > 0) {
          handlers.onDrop(event.payload.paths);
        }
      }
    })
    .then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

// --- Timing console (Rust serial transport) --------------------------------

export type SerialPortInfo = {
  name: string;
  label: string;
  usb: boolean;
  vid: number | null;
  pid: number | null;
  manufacturer: string | null;
};

/** Errors from Rust commands arrive as `{ kind, message }`. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
    if ("kind" in error) return String((error as { kind: unknown }).kind);
  }
  return error instanceof Error ? error.message : String(error);
}

export const serial = {
  listPorts: () => invoke<SerialPortInfo[]>("timing_list_ports"),
  open: (port: string) => invoke<void>("timing_open", { port }),
  close: () => invoke<void>("timing_close"),
  connectedPort: () => invoke<string | null>("timing_connected_port"),
};

export const serialTransport: TimerTransport = {
  async request(data) {
    const reply = await invoke<ArrayBuffer>("timing_request", {
      data: Array.from(data),
    });
    return new Uint8Array(reply);
  },
};

// --- Publishing -------------------------------------------------------------

export type LaneAccount = { name: string; email: string };

/** The Lane4 server is fixed per build (`LANE4_API_URL` in Rust). */
export type PublishSettings = {
  teamId: string;
  teamName: string;
  enabled: boolean;
  /** Null when signed out. */
  account: LaneAccount | null;
  /**
   * Set when the OS keychain couldn't be read. The account panel offers
   * "Sign in again" instead of looking simply signed out.
   */
  keychainError: string | null;
};

/** `GET /v1/me` from the Lane4 API. */
export type LaneMe = {
  user: { id: string; name: string; email: string };
  teams: {
    id: string;
    name: string;
    slug: string | null;
    role: string;
    canHostMeets: boolean;
  }[];
};

export type SignInStart = {
  userCode: string;
  verificationUri: string;
  intervalSecs: number;
  expiresInSecs: number;
};

export type SignInPoll =
  | { state: "pending" | "slowDown" | "denied" | "expired" }
  | { state: "approved"; me: LaneMe };

export const publishing = {
  getSettings: () => invoke<PublishSettings>("publish_get_settings"),
  setSettings: (input: {
    teamId: string;
    teamName: string;
    enabled: boolean;
  }) => invoke<void>("publish_set_settings", input),
  probe: () => invoke<boolean>("publish_probe"),
  post: (meetId: string, idempotencyKey: string, body: string) =>
    invoke<{ status: number; body: string }>("publish_post", {
      meetId,
      idempotencyKey,
      body,
    }),
};

export const account = {
  startSignIn: () => invoke<SignInStart>("account_start_sign_in"),
  pollSignIn: () => invoke<SignInPoll>("account_poll_sign_in"),
  reopenSignIn: () => invoke<void>("account_reopen_sign_in"),
  cancelSignIn: () => invoke<void>("account_cancel_sign_in"),
  me: () => invoke<LaneMe>("account_me"),
  signOut: () => invoke<void>("account_sign_out"),
  openSignUp: () => invoke<void>("account_open_sign_up"),
};

/** Admin's `/device` page opens `lane4://sign-in/approved` after approval. */
export function onSignInReturned(handler: () => void): Promise<() => void> {
  return listen("sign-in-returned", handler);
}

// --- App updates -------------------------------------------------------------

export type AvailableUpdate = {
  version: string;
  currentVersion: string;
  notes: string | null;
};

export const appUpdate = {
  /** Null when current, or when this build doesn't update (dev builds). */
  check: () => invoke<AvailableUpdate | null>("app_update_check"),
  /** Installs the update `check` found, then restarts the app. */
  install: () => invoke<void>("app_update_install"),
};
