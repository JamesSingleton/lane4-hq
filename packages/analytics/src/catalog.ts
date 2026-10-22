/** Product events. Properties not listed here are dropped before send. */
export const EVENT_FIELDS = {
  signed_up: [],
  team_created: [],
  meet_created: [],
  roster_imported: ["format"],
  entries_exported: ["format"],
  results_imported: ["format"],
  export_failed: ["format", "error_code"],
  import_failed: ["format", "error_code"],
  docs_search: ["query"],
} as const;

export type EventName = keyof typeof EVENT_FIELDS;

export type EventProperties = {
  signed_up: Record<string, never>;
  team_created: Record<string, never>;
  meet_created: Record<string, never>;
  roster_imported: { format?: string };
  entries_exported: { format?: string };
  results_imported: { format?: string };
  export_failed: { format?: string; error_code?: string };
  import_failed: { format?: string; error_code?: string };
  docs_search: { query?: string };
};

export const ANALYTICS_APPS = [
  "web",
  "admin",
  "api",
  "desktop",
  "docs",
] as const;

export type AnalyticsApp = (typeof ANALYTICS_APPS)[number];

export const FILE_FORMATS = [
  "hy3",
  "cl2",
  "sd3",
  "sdif",
  "csv",
  "zip",
  "ev3",
  "hyv",
  "xls",
  "xlsx",
  "pdf",
] as const;

export type FileFormat = (typeof FILE_FORMATS)[number];

export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  "unsupported",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
