/** Parse swim time string (e.g. "2:39", "1:23.45", "58.11") to milliseconds */
export function parseTime(time: string): number {
  const trimmed = time.trim();
  if (!trimmed) return 0;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    // split(":") on a string containing ":" always yields ≥2 elements
    const secondsPart = parts.pop()!;
    const seconds = Number.parseFloat(secondsPart);
    let totalMs = Math.round(seconds * 1000);

    const minutes = Number.parseInt(parts.pop()!, 10);
    totalMs += minutes * 60 * 1000;

    if (parts.length > 0) {
      const hours = Number.parseInt(parts.pop()!, 10);
      totalMs += hours * 3600 * 1000;
    }
    return totalMs;
  }

  return Math.round(Number.parseFloat(trimmed) * 1000);
}

/**
 * Fill a time from the right as hundredths while the coach types.
 * `23752` becomes `2:37.52`. `5234` becomes `52.34`.
 * At most seven digits: hours, minutes, seconds, and hundredths.
 */
export function formatTypedSwimTime(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 2) return digits;

  const hundredths = digits.slice(-2);
  const head = digits.slice(0, -2);
  if (head.length <= 2) return `${head}.${hundredths}`;

  const seconds = head.slice(-2);
  const minutes = head.slice(0, -2);
  if (minutes.length <= 2) return `${minutes}:${seconds}.${hundredths}`;

  const mm = minutes.slice(-2);
  const hours = minutes.slice(0, -2);
  return `${hours}:${mm}:${seconds}.${hundredths}`;
}

/**
 * Result cell. A no-swim is `NS`. A DQ keeps its time, or `NT` when the
 * file recorded none. `dqCode` `NS` with `isDq` false is the stored no-swim.
 */
export function formatResultMark(
  timeMs: number,
  isDq: boolean,
  dqCode?: string | null,
): string {
  if (!isDq && dqCode === "NS") return "NS";
  if (isDq) return `DQ ${formatTime(timeMs)}`;
  return formatTime(timeMs);
}

/** A no-swim is its own mark. A DQ stays a DQ. Everything else is a time. */
export function resultMarkKind(
  isDq: boolean,
  dqCode?: string | null,
): "dq" | "ns" | "time" {
  if (isDq) return "dq";
  if (dqCode === "NS") return "ns";
  return "time";
}

/** Place cell. NS and DQ are unplaced, even when the file stored 0. */
export function formatResultPlace(
  place: number | null | undefined,
  isDq: boolean,
  dqCode?: string | null,
): string {
  if (resultMarkKind(isDq, dqCode) !== "time") return "—";
  if (place == null) return "—";
  return String(place);
}

/** Format milliseconds to swim time string */
export function formatTime(ms: number): string {
  if (ms <= 0) return "NT";

  const totalSeconds = ms / 1000;
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
  }

  return totalSeconds.toFixed(2);
}

export function isFasterTime(a: number, b: number): boolean {
  if (a <= 0) return false;
  if (b <= 0) return true;
  return a < b;
}
