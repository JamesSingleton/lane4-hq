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
