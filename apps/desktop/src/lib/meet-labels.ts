import { parseLocalDateOnly } from "@lane4hq/swim-core/calendar-date";
import type { ParsedEvent } from "@lane4hq/swim-formats";

const GENDER_LABEL: Record<string, string> = {
  male: "Boys",
  female: "Girls",
  mixed: "Mixed",
};

const STROKE_LABEL: Record<string, string> = {
  free: "Free",
  back: "Back",
  breast: "Breast",
  fly: "Fly",
  im: "IM",
  free_relay: "Free Relay",
  medley_relay: "Medley Relay",
};

export function eventLabel(event: ParsedEvent): string {
  const gender = GENDER_LABEL[event.gender] ?? event.gender;
  const age = event.ageGroup ? `${event.ageGroup} ` : "";
  const stroke = STROKE_LABEL[event.stroke] ?? event.stroke;
  return `${gender} ${age}${event.distance} ${stroke}`;
}

export function eventLabelsByNumber(
  events: ParsedEvent[],
): Map<number, string> {
  const labels = new Map<number, string>();
  for (const event of events) {
    if (event.eventNumber != null) {
      labels.set(event.eventNumber, eventLabel(event));
    }
  }
  return labels;
}

/** "Jan 10, 2026", "Jan 10–11, 2026", or "Jan 30 – Feb 1, 2026". */
export function formatDateRange(start?: string, end?: string): string | null {
  if (!start) return null;
  const from = parseLocalDateOnly(start);
  const to = end && end !== start ? parseLocalDateOnly(end) : undefined;
  if (!from) return end && end !== start ? `${start} – ${end}` : start;
  const day = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-US", opts);
  if (!to)
    return day(from, { month: "short", day: "numeric", year: "numeric" });
  const sameYear = from.getFullYear() === to.getFullYear();
  if (sameYear && from.getMonth() === to.getMonth()) {
    return `${day(from, { month: "short", day: "numeric" })}–${to.getDate()}, ${to.getFullYear()}`;
  }
  return `${day(from, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" })} – ${day(to, { month: "short", day: "numeric", year: "numeric" })}`;
}
