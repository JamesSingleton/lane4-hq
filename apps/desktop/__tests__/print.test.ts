import { createMeet } from "@lane4hq/meet-engine/create";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { printReport } from "../src/lib/print";

const openReport = vi.hoisted(() => vi.fn(async () => {}));
const renderMeetReportPdf = vi.hoisted(() =>
  vi.fn(async () => new Uint8Array([1, 2, 3])),
);

vi.mock("../src/lib/native", () => ({
  openReport,
}));

vi.mock("@lane4hq/reports/meet-program/render", () => ({
  renderMeetReportPdf,
}));

describe("printReport", () => {
  beforeEach(() => {
    openReport.mockClear();
    renderMeetReportPdf.mockClear();
  });

  it("renders the report and opens it with the meet name", async () => {
    const meet = createMeet(
      { name: "Desert", course: "SCY" },
      { newId: () => "meet" },
    );
    await printReport(meet, {
      kind: "heat-sheet",
      eventIds: ["e1"],
      suffix: "Event 4",
    });
    expect(renderMeetReportPdf).toHaveBeenCalledWith(meet, "heat-sheet", {
      eventIds: ["e1"],
    });
    expect(openReport).toHaveBeenCalledWith(
      "Desert Heat sheet Event 4",
      new Uint8Array([1, 2, 3]),
    );

    await printReport(meet, { kind: "results", suffix: "" });
    expect(openReport).toHaveBeenLastCalledWith(
      "Desert Results",
      new Uint8Array([1, 2, 3]),
    );
  });
});
