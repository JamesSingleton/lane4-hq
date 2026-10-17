import type { Meet } from "@lane4hq/meet-engine/model";
import { pdf } from "@react-pdf/renderer";
import { HeatSheetPdfDocument } from "../templates/pdf/heat-sheet";
import { MeetResultsPdfDocument } from "../templates/pdf/meet-results";
import {
  buildHeatSheetReport,
  buildMeetResultsReport,
  type MeetReportOptions,
} from "./build";

export type MeetReportKind = "heat-sheet" | "results";

/** Render a meet report to PDF bytes; works in a browser or webview. */
export async function renderMeetReportPdf(
  meet: Meet,
  kind: MeetReportKind,
  options: MeetReportOptions = {},
): Promise<Uint8Array> {
  const document =
    kind === "heat-sheet"
      ? HeatSheetPdfDocument({ report: buildHeatSheetReport(meet, options) })
      : MeetResultsPdfDocument({
          report: buildMeetResultsReport(meet, options),
        });
  const blob = await pdf(document).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
