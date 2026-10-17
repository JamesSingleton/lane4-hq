/** Entries the file had for events this meet doesn't list. */
const MISSING_EVENT = "Event isn't in this meet";

function eventList(numbers: number[]): string {
  const labels = numbers.map((n) => `event ${n}`);
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * A sentence for the operator when an entry file names events this meet
 * doesn't have. Null when nothing was skipped for that reason.
 */
export function missingMeetEventsMessage(
  skipped: Array<{ eventNumber: number | undefined; reason: string }>,
): string | null {
  const missing = skipped.filter((row) => row.reason === MISSING_EVENT);
  if (missing.length === 0) return null;
  const numbers = [
    ...new Set(
      missing.flatMap((row) =>
        typeof row.eventNumber === "number" ? [row.eventNumber] : [],
      ),
    ),
  ].sort((a, b) => a - b);
  const unnumbered = missing.some((row) => row.eventNumber == null);
  if (numbers.length === 0) {
    return "This entry file has swimmers in events that aren't in this meet. Those entries were not imported.";
  }
  const listed = eventList(numbers);
  const which = unnumbered ? `${listed} and other events` : listed;
  const verb = numbers.length + (unnumbered ? 1 : 0) === 1 ? "isn't" : "aren't";
  return `This entry file has swimmers in ${which}, which ${verb} in this meet. Those entries were not imported.`;
}
