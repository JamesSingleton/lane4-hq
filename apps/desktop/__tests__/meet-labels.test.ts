import type { ParsedEvent } from "@lane4hq/swim-formats";
import { describe, expect, it } from "vitest";
import {
  eventLabel,
  eventLabelsByNumber,
  formatDateRange,
} from "../src/lib/meet-labels";

const event = (overrides: Partial<ParsedEvent> = {}): ParsedEvent => ({
  eventNumber: 1,
  stroke: "free",
  distance: 50,
  gender: "female",
  eventKey: "50_free_scy_f",
  ...overrides,
});

describe("eventLabel", () => {
  it("formats gender, age group, distance, and stroke", () => {
    expect(eventLabel(event({ ageGroup: "11-12" }))).toBe(
      "Girls 11-12 50 Free",
    );
    expect(
      eventLabel(
        event({ gender: "mixed", stroke: "medley_relay", distance: 200 }),
      ),
    ).toBe("Mixed 200 Medley Relay");
  });

  it("falls back to raw values it doesn't know", () => {
    expect(eventLabel(event({ stroke: "kick", gender: "x" as never }))).toBe(
      "x 50 kick",
    );
  });
});

describe("eventLabelsByNumber", () => {
  it("indexes numbered events only", () => {
    const labels = eventLabelsByNumber([
      event({ eventNumber: 3, stroke: "im", distance: 100, gender: "male" }),
      event({ eventNumber: undefined }),
    ]);
    expect([...labels]).toEqual([[3, "Boys 100 IM"]]);
  });
});

describe("formatDateRange", () => {
  it("collapses single-day and missing dates", () => {
    expect(formatDateRange()).toBeNull();
    expect(formatDateRange("2026-01-10")).toBe("Jan 10, 2026");
    expect(formatDateRange("2026-01-10", "2026-01-10")).toBe("Jan 10, 2026");
    expect(formatDateRange("2026-01-10", "2026-01-11")).toBe("Jan 10–11, 2026");
    expect(formatDateRange("2026-01-30", "2026-02-01")).toBe(
      "Jan 30 – Feb 1, 2026",
    );
    expect(formatDateRange("2026-12-31", "2027-01-02")).toBe(
      "Dec 31, 2026 – Jan 2, 2027",
    );
    expect(formatDateRange("TBD")).toBe("TBD");
  });
});
