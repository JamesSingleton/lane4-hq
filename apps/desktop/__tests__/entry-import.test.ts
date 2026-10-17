import { describe, expect, it } from "vitest";
import { missingMeetEventsMessage } from "../src/lib/entry-import";

const missing = (eventNumber: number | undefined) => ({
  eventNumber,
  reason: "Event isn't in this meet" as const,
});

describe("missing meet events", () => {
  it("says nothing when every entry matched an event", () => {
    expect(
      missingMeetEventsMessage([
        {
          eventNumber: 1,
          reason: "File's event 1 is a different race",
        },
      ]),
    ).toBeNull();
    expect(missingMeetEventsMessage([])).toBeNull();
  });

  it("names the events the meet doesn't have", () => {
    expect(
      missingMeetEventsMessage([missing(9), missing(12), missing(9)]),
    ).toBe(
      "This entry file has swimmers in event 9 and event 12, which aren't in this meet. Those entries were not imported.",
    );
    expect(missingMeetEventsMessage([missing(4)])).toBe(
      "This entry file has swimmers in event 4, which isn't in this meet. Those entries were not imported.",
    );
    expect(missingMeetEventsMessage([missing(1), missing(2), missing(8)])).toBe(
      "This entry file has swimmers in event 1, event 2, and event 8, which aren't in this meet. Those entries were not imported.",
    );
    expect(missingMeetEventsMessage([missing(undefined)])).toBe(
      "This entry file has swimmers in events that aren't in this meet. Those entries were not imported.",
    );
    expect(
      missingMeetEventsMessage([missing(3), missing(undefined)]),
    ).toContain("event 3 and other events");
  });
});
