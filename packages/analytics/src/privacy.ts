import {
  ERROR_CODES,
  type ErrorCode,
  EVENT_FIELDS,
  type EventName,
  FILE_FORMATS,
} from "./catalog";

const FORMAT_SET = new Set<string>(FILE_FORMATS);
const ERROR_SET = new Set<string>(ERROR_CODES);

/** Keys that must never leave the browser or server, in any event. */
const FORBIDDEN = new Set([
  "email",
  "name",
  "firstname",
  "lastname",
  "fullname",
  "swimmername",
  "displayname",
  "dateofbirth",
  "birthdate",
  "birthday",
  "dob",
  "usaswimmingid",
  "usasid",
  "usasmemberid",
  "memberid",
  "seedtime",
  "time",
  "phone",
  "address",
]);

const EXCEPTION_FIELDS = new Set([
  "route",
  "status",
  "source",
  "file",
  "line",
  "code",
]);

const EXCEPTION_SOURCES = new Set(["panic", "command", "client", "server"]);

const COMMAND_CODES = new Set(["export_write_failed", "panic", "command"]);

function normKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN.has(normKey(key));
}

function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

function lastPart(value: string, separator: string | RegExp): string {
  const parts = value.split(separator);
  return parts[parts.length - 1] || "";
}

/** Extension or format token. Anything else becomes `unknown`. */
export function formatCode(value: string | undefined | null): string {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  const leaf = lastPart(raw, /[/\\]/);
  if (!leaf) return "unknown";
  const ext = leaf.includes(".") ? lastPart(leaf, ".") : leaf;
  const cleaned = ext.replace(/^\./, "");
  return cleaned && FORMAT_SET.has(cleaned) ? cleaned : "unknown";
}

/**
 * A short code. The error message is never returned: import errors quote
 * swimmer names.
 */
export function errorCode(error: unknown): ErrorCode {
  if (typeof error === "string") {
    return ERROR_SET.has(error) ? (error as ErrorCode) : "internal";
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (ERROR_SET.has(code)) return code as ErrorCode;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("unauthorized")) return "unauthorized";
    if (msg.includes("forbidden") || msg.includes("not permitted")) {
      return "forbidden";
    }
    if (msg.includes("not found")) return "not_found";
    if (msg.includes("unsupported")) return "unsupported";
    if (
      msg.includes("valid") ||
      msg.includes("required") ||
      msg.includes("select")
    ) {
      return "validation";
    }
  }
  return "internal";
}

export function sanitizeProperties(
  event: EventName,
  properties: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> {
  const allowed = EVENT_FIELDS[event];
  const out: Record<string, string | number | boolean> = {};
  if (!properties) return out;
  for (let i = 0; i < allowed.length; i++) {
    const key = allowed[i]!;
    const value = properties[key];
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value !== "string") continue;
    if (looksLikeEmail(value)) continue;
    if (key === "format") out[key] = formatCode(value);
    if (key === "error_code") out[key] = errorCode(value);
  }
  return out;
}

/** Path only. Query strings and hashes can carry names. */
export function pagePath(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "/";
  try {
    return new URL(trimmed, "https://lane4.local").pathname;
  } catch {
    return "/";
  }
}

export function sanitizeException(
  properties: Record<string, unknown> | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!properties) return out;
  for (const key of Object.keys(properties)) {
    if (!EXCEPTION_FIELDS.has(key)) continue;
    const value = properties[key];
    if (key === "status" || key === "line") {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
      continue;
    }
    if (typeof value !== "string") continue;
    if (looksLikeEmail(value)) continue;
    if (key === "route") {
      out[key] = pagePath(value);
      continue;
    }
    if (key === "file") {
      const leaf = lastPart(value, /[/\\]/);
      if (leaf && !looksLikeEmail(leaf)) out[key] = leaf.slice(0, 80);
      continue;
    }
    if (key === "code") {
      if (COMMAND_CODES.has(value)) out[key] = value;
      continue;
    }
    if (key === "source" && EXCEPTION_SOURCES.has(value)) {
      out[key] = value;
    }
  }
  return out;
}

function exceptionType(error: unknown): string {
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return "Error";
}

/**
 * PostHog Error Tracking needs the stack. The message is replaced with the
 * error name because import failures quote swimmer names.
 */
export function redactException(error: unknown): Error {
  const name = exceptionType(error);
  const reported = new Error(name);
  reported.name = name;
  if (error instanceof Error && error.stack) {
    const lines = error.stack.split("\n");
    lines[0] = `${name}: ${name}`;
    reported.stack = lines.join("\n");
  }
  return reported;
}

function redactExceptionList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const items: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!item || typeof item !== "object") {
      items.push(item);
      continue;
    }
    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "Error";
    items.push({ ...record, value: type });
  }
  return items;
}

/** Drop autocapture text so a button labeled with a swimmer name is not sent. */
export function prepareCapture(event: {
  properties?: Record<string, unknown>;
}): { properties?: Record<string, unknown> } {
  if (!event.properties) return event;
  const properties: Record<string, unknown> = {};
  for (const key of Object.keys(event.properties)) {
    if (
      key === "$el_text" ||
      key === "$elements" ||
      key === "$elements_chain" ||
      isForbiddenKey(key)
    ) {
      continue;
    }
    const value = event.properties[key];
    if (key === "$exception_list") {
      properties[key] = redactExceptionList(value);
      continue;
    }
    if (typeof value === "string" && looksLikeEmail(value)) continue;
    properties[key] = value;
  }
  return { ...event, properties };
}

export function safeDistinctId(id: string | undefined | null): string | null {
  const trimmed = (id ?? "").trim();
  if (!trimmed || trimmed.includes("@") || trimmed.includes(" ")) return null;
  return trimmed.slice(0, 128);
}
