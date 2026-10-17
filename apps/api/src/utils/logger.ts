export type LogFields = Record<string, unknown>;

export type Logger = {
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

/** One JSON object per line, which Railway's log search can filter on. */
export function jsonLogger(
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  function log(level: string, message: string, fields: LogFields = {}) {
    const entry: LogFields = { level, time: new Date().toISOString(), message };
    for (const [key, value] of Object.entries(fields)) {
      entry[key] = serialize(value);
    }
    write(JSON.stringify(entry));
  }
  return {
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}
