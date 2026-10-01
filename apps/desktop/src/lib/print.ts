import type { Meet } from "@lane4hq/meet-engine/model";
import type { MeetReportKind } from "@lane4hq/reports/meet-program/render";
import { openReport } from "./native";

const TITLES: Record<MeetReportKind, string> = {
  "heat-sheet": "Heat sheet",
  results: "Results",
};

export type PrintRequest = {
  kind: MeetReportKind;
  /** Limit to these events; all events when omitted. */
  eventIds?: string[];
  /** Added to the file name, e.g. "Event 4". */
  suffix?: string;
};

/** Render a report (react-pdf loads on first use) and open it to print. */
export async function printReport(
  meet: Meet,
  request: PrintRequest,
): Promise<void> {
  const { renderMeetReportPdf } = await import(
    "@lane4hq/reports/meet-program/render"
  );
  const bytes = await renderMeetReportPdf(meet, request.kind, {
    eventIds: request.eventIds,
  });
  const name = [meet.name, TITLES[request.kind], request.suffix]
    .filter(Boolean)
    .join(" ");
  await openReport(name, bytes);
}
