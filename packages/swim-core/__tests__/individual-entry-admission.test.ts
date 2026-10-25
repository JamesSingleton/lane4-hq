import { describe, expect, it } from "vitest";
import {
  admitClearExhibition,
  admitNewIndividualEntry,
  admitRestoredEntry,
  entryCountsForMember,
  scoringCountForEvent,
} from "../src/individual-entry-admission";

const event = {
  id: "e1",
  gender: "female",
  stroke: "free",
  eventKey: "200_free_scy_f",
};

const base = {
  commitments: [] as Array<{ membershipId: string; status: string }>,
  membershipId: "m1",
  eligibilityStatus: "eligible",
  swimmerGender: "female",
  event,
  limits: {
    maxIndividualEntries: 2,
    maxRelayEntries: 1,
    maxCombinedEntries: null,
    entryLimitPackages: null,
  },
  entries: [] as Array<{
    id: string;
    membershipId: string;
    meetEventId: string;
    status: string;
    stroke: string;
    eventKey: string;
    exhibition?: boolean;
  }>,
  relayLegs: [] as Array<{
    membershipId: string;
    meetEventId: string;
    relayLetter: string;
    legOrder: number;
  }>,
  scoringCap: 1 as number | null,
  exhibition: false,
};

describe("entry counts", () => {
  it("counts active individual entries and racing relay teams", () => {
    expect(
      entryCountsForMember(
        [
          {
            id: "a",
            membershipId: "m1",
            meetEventId: "e1",
            status: "approved",
            stroke: "free",
            eventKey: "50_free",
          },
          {
            id: "b",
            membershipId: "m1",
            meetEventId: "e2",
            status: "scratched",
            stroke: "free",
            eventKey: "100_free",
          },
          {
            id: "c",
            membershipId: "m2",
            meetEventId: "e1",
            status: "approved",
            stroke: "free",
            eventKey: "50_free",
          },
          {
            id: "d",
            membershipId: "m1",
            meetEventId: "er",
            status: "approved",
            stroke: "free_relay",
            eventKey: "200_free_relay",
          },
          {
            id: "e",
            membershipId: "m1",
            meetEventId: "e3",
            status: "approved",
            stroke: "back",
            eventKey: "100_back",
          },
        ],
        "m1",
        [
          {
            membershipId: "m1",
            meetEventId: "er",
            relayLetter: "A",
            legOrder: 1,
          },
          {
            membershipId: "m1",
            meetEventId: "er",
            relayLetter: "A",
            legOrder: 5,
          },
        ],
        "e",
      ),
    ).toEqual({ individual: 1, relay: 1 });
  });

  it("counts a row without a stroke as individual", () => {
    expect(
      entryCountsForMember(
        [{ membershipId: "m1", meetEventId: "e1", status: "approved" }],
        "m1",
        [],
      ),
    ).toEqual({ individual: 1, relay: 0 });
  });
});

describe("scoringCountForEvent", () => {
  it("ignores other events, scratches, exhibition, and the excluded row", () => {
    expect(
      scoringCountForEvent(
        [
          {
            id: "a",
            membershipId: "m1",
            meetEventId: "e1",
            status: "approved",
            exhibition: false,
          },
          {
            id: "b",
            membershipId: "m2",
            meetEventId: "e1",
            status: "scratched",
          },
          {
            id: "c",
            membershipId: "m3",
            meetEventId: "e1",
            status: "approved",
            exhibition: true,
          },
          {
            id: "d",
            membershipId: "m4",
            meetEventId: "e2",
            status: "approved",
          },
          {
            id: "e",
            membershipId: "m5",
            meetEventId: "e1",
            status: "approved",
          },
        ],
        "e1",
        "a",
      ),
    ).toBe(1);
  });
});

describe("admitNewIndividualEntry", () => {
  it("admits a scoring entry under the cap", () => {
    expect(admitNewIndividualEntry(base)).toEqual({ ok: true });
  });

  it("refuses not-going and not-eligible attendance", () => {
    expect(
      admitNewIndividualEntry({
        ...base,
        commitments: [{ membershipId: "m1", status: "not_going" }],
      }).ok,
    ).toBe(false);
    expect(
      admitNewIndividualEntry({
        ...base,
        commitments: [
          { membershipId: "m2", status: "not_going" },
          { membershipId: "m1", status: "pending" },
        ],
      }),
    ).toEqual({ ok: true });
  });

  it("refuses an ineligible profile, the wrong gender, and a relay event", () => {
    expect(
      admitNewIndividualEntry({ ...base, eligibilityStatus: "ineligible" }).ok,
    ).toBe(false);
    expect(admitNewIndividualEntry({ ...base, swimmerGender: "male" }).ok).toBe(
      false,
    );
    expect(
      admitNewIndividualEntry({
        ...base,
        event: {
          ...event,
          stroke: "medley_relay",
          eventKey: "200_medley_relay_scy_f",
        },
      }).ok,
    ).toBe(false);
  });

  it("refuses a full entry limit and a full scoring cap", () => {
    const full = admitNewIndividualEntry({
      ...base,
      entries: [
        {
          id: "a",
          membershipId: "m1",
          meetEventId: "other",
          status: "approved",
          stroke: "free",
          eventKey: "50_free",
        },
        {
          id: "b",
          membershipId: "m1",
          meetEventId: "other2",
          status: "approved",
          stroke: "back",
          eventKey: "100_back",
        },
      ],
    });
    expect(full.ok).toBe(false);
    const cap = admitNewIndividualEntry({
      ...base,
      entries: [
        {
          id: "a",
          membershipId: "m9",
          meetEventId: "e1",
          status: "approved",
          stroke: "free",
          eventKey: "200_free",
        },
      ],
    });
    expect(cap).toEqual({
      ok: false,
      reason: "This event already has 1 scoring entry for your team.",
    });
  });

  it("admits exhibition when scoring is full and never marks exhibition itself", () => {
    const result = admitNewIndividualEntry({
      ...base,
      exhibition: true,
      entries: [
        {
          id: "a",
          membershipId: "m9",
          meetEventId: "e1",
          status: "approved",
          stroke: "free",
          eventKey: "200_free",
        },
      ],
    });
    expect(result).toEqual({ ok: true });
  });

  it("admits when there is no scoring cap", () => {
    expect(admitNewIndividualEntry({ ...base, scoringCap: null })).toEqual({
      ok: true,
    });
  });
});

describe("admitClearExhibition", () => {
  it("refuses when the event is already at the cap", () => {
    expect(
      admitClearExhibition({
        entries: [
          {
            id: "self",
            membershipId: "m1",
            meetEventId: "e1",
            status: "approved",
            exhibition: true,
          },
          {
            id: "other",
            membershipId: "m2",
            meetEventId: "e1",
            status: "approved",
          },
        ],
        meetEventId: "e1",
        entryId: "self",
        scoringCap: 1,
      }).ok,
    ).toBe(false);
  });

  it("admits when clearing exhibition frees no extra scoring name", () => {
    expect(
      admitClearExhibition({
        entries: [
          {
            id: "self",
            membershipId: "m1",
            meetEventId: "e1",
            status: "approved",
            exhibition: true,
          },
        ],
        meetEventId: "e1",
        entryId: "self",
        scoringCap: 1,
      }),
    ).toEqual({ ok: true });
  });
});

describe("admitRestoredEntry", () => {
  it("refuses a limit, skips the cap for exhibition, and enforces the cap otherwise", () => {
    const entries = [
      {
        id: "self",
        membershipId: "m1",
        meetEventId: "e1",
        status: "scratched",
        stroke: "free",
        eventKey: "200_free",
      },
      {
        id: "a",
        membershipId: "m1",
        meetEventId: "o1",
        status: "approved",
        stroke: "free",
        eventKey: "50_free",
      },
      {
        id: "b",
        membershipId: "m1",
        meetEventId: "o2",
        status: "approved",
        stroke: "back",
        eventKey: "100_back",
      },
    ];
    expect(
      admitRestoredEntry({
        entries,
        relayLegs: [],
        membershipId: "m1",
        entryId: "self",
        meetEventId: "e1",
        event: { stroke: "free", eventKey: "200_free" },
        limits: base.limits,
        exhibition: false,
        scoringCap: 4,
      }).ok,
    ).toBe(false);

    const scored = [
      {
        id: "self",
        membershipId: "m1",
        meetEventId: "e1",
        status: "scratched",
        stroke: "free",
        eventKey: "200_free",
      },
      {
        id: "other",
        membershipId: "m2",
        meetEventId: "e1",
        status: "approved",
        stroke: "free",
        eventKey: "200_free",
      },
    ];
    expect(
      admitRestoredEntry({
        entries: scored,
        relayLegs: [],
        membershipId: "m1",
        entryId: "self",
        meetEventId: "e1",
        event: { stroke: "free", eventKey: "200_free" },
        limits: null,
        exhibition: true,
        scoringCap: 1,
      }),
    ).toEqual({ ok: true });
    expect(
      admitRestoredEntry({
        entries: scored,
        relayLegs: [],
        membershipId: "m1",
        entryId: "self",
        meetEventId: "e1",
        event: { stroke: "free_relay", eventKey: "200_free_relay" },
        limits: null,
        exhibition: false,
        scoringCap: 1,
      }).ok,
    ).toBe(false);
  });
});
