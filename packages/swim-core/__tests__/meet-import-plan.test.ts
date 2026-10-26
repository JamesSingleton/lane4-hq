import { describe, expect, it } from "vitest";
import {
  decideImportedAthlete,
  importedEventSlot,
  isImportedNoSwim,
  meetImportSummaryWarning,
  planImportedEventWrites,
  planImportedIndividualEntries,
  planImportedIndividualResult,
  planImportedTime,
  planResultAttachmentEvents,
  planResultRelayLineup,
} from "../src/meet-import-plan";

const event = {
  eventNumber: 1 as number | null,
  eventSuffix: null as string | null,
  ageGroup: null as string | null,
  eventKey: "200_free_scy_f",
  stroke: "free",
  distance: 200,
  gender: "female",
  qualifyingTimeMs: null as number | null,
  importedFromFile: false,
};

describe("decideImportedAthlete", () => {
  const roster = [{ membershipId: "m1", swimmerId: "s1" }];
  const matched = {
    status: "matched" as const,
    matched: {
      membershipId: "m1",
      swimmerId: "s1",
      displayName: "A B",
      reason: "name" as const,
    },
  };

  it("skips, resolves a coach map, and ignores a map to someone off the roster", () => {
    expect(
      decideImportedAthlete({
        athlete: { status: "unmatched", matched: undefined },
        mapAction: "skip",
        roster,
        addNewAthletes: true,
      }),
    ).toEqual({ kind: "skip" });
    expect(
      decideImportedAthlete({
        athlete: { status: "unmatched", matched: undefined },
        mapAction: "m1",
        roster,
        addNewAthletes: false,
      }),
    ).toEqual({ kind: "resolved", membershipId: "m1", swimmerId: "s1" });
    expect(
      decideImportedAthlete({
        athlete: { status: "unmatched", matched: undefined },
        mapAction: "missing",
        roster,
        addNewAthletes: true,
      }),
    ).toEqual({ kind: "skip" });
  });

  it("keeps an automatic match even when the coach also said create", () => {
    expect(
      decideImportedAthlete({
        athlete: matched,
        mapAction: "create",
        roster,
        addNewAthletes: false,
      }),
    ).toEqual({ kind: "resolved", membershipId: "m1", swimmerId: "s1" });
  });

  it("creates only unmatched athletes the coach asked for", () => {
    expect(
      decideImportedAthlete({
        athlete: { status: "unmatched", matched: undefined },
        mapAction: "create",
        roster,
        addNewAthletes: false,
      }),
    ).toEqual({ kind: "create" });
    expect(
      decideImportedAthlete({
        athlete: { status: "unmatched", matched: undefined },
        mapAction: undefined,
        roster,
        addNewAthletes: true,
      }),
    ).toEqual({ kind: "create" });
    expect(
      decideImportedAthlete({
        athlete: { status: "ambiguous", matched: undefined },
        mapAction: undefined,
        roster,
        addNewAthletes: true,
      }),
    ).toEqual({ kind: "skip" });
  });
});

describe("planImportedEventWrites", () => {
  it("refreshes a file-owned slot and links a manual one, last slot wins", () => {
    const imported = [event];
    const writes = planImportedEventWrites(
      [
        { ...event, id: "old", importedFromFile: false },
        { ...event, id: "file", importedFromFile: true },
      ],
      imported,
      undefined,
    );
    expect(writes).toEqual([
      {
        op: "refresh",
        index: 0,
        slot: importedEventSlot(event),
        eventId: "file",
      },
    ]);
    expect(
      planImportedEventWrites(
        [{ ...event, id: "manual", importedFromFile: false }],
        imported,
        {},
      )[0]?.op,
    ).toBe("link");
  });

  it("replaces, refreshes, or links a unique event number, else adds", () => {
    const manual = {
      ...event,
      id: "manual",
      eventKey: "200_back_scy_f",
      stroke: "back",
      importedFromFile: true,
    };
    const different = {
      ...event,
      eventKey: "200_breast_scy_f",
      stroke: "breast",
    };
    expect(
      planImportedEventWrites([manual], [different], { 1: "use_import" })[0]
        ?.op,
    ).toBe("replace");
    expect(
      planImportedEventWrites(
        [{ ...event, id: "file", importedFromFile: true }],
        [{ ...event, ageGroup: "15-16" }],
        undefined,
      )[0]?.op,
    ).toBe("refresh");
    expect(
      planImportedEventWrites(
        [
          {
            ...event,
            id: "manual",
            eventKey: "200_back_scy_f",
            stroke: "back",
          },
        ],
        [different],
        { 1: "keep_manual" },
      )[0]?.op,
    ).toBe("link");

    const added = planImportedEventWrites(
      [],
      [{ ...event, eventNumber: 4 }],
      undefined,
    );
    expect(added[0]).toMatchObject({ op: "add", claimEventNumber: true });

    const suffixed = planImportedEventWrites(
      [{ ...event, id: "manual" }],
      [{ ...event, eventSuffix: "A" }],
      undefined,
    );
    expect(suffixed[0]).toMatchObject({ op: "add", claimEventNumber: false });

    const duplicateNumber = planImportedEventWrites(
      [
        { ...event, id: "a", eventKey: "200_back_scy_f", stroke: "back" },
        { ...event, id: "b", eventKey: "200_breast_scy_f", stroke: "breast" },
      ],
      [{ ...event, eventKey: "200_fly_scy_f", stroke: "fly" }],
      undefined,
    );
    expect(duplicateNumber[0]).toMatchObject({
      op: "add",
      claimEventNumber: true,
    });

    const unnumbered = planImportedEventWrites(
      [],
      [{ ...event, eventNumber: null }],
      undefined,
    );
    expect(unnumbered[0]).toMatchObject({ op: "add", claimEventNumber: false });
  });
});

describe("planImportedIndividualEntries", () => {
  const limits = {
    maxIndividualEntries: 1,
    maxRelayEntries: 1,
    maxCombinedEntries: null,
    entryLimitPackages: null,
  };

  it("skips unmatched and unresolved events, warns on the limit, and still enters a slow seed", () => {
    const planned = planImportedIndividualEntries(
      [
        {
          swimmerName: "No Match",
          eventNumber: 1,
          membershipId: null,
          meetEventId: "e1",
          stroke: "free",
          eventKey: "50_free",
          qualifyingTimeMs: null,
        },
        {
          swimmerName: "No Event",
          eventNumber: 2,
          membershipId: "m1",
          meetEventId: null,
          stroke: "free",
          eventKey: "50_free",
          qualifyingTimeMs: null,
        },
        {
          swimmerName: "No Detail",
          eventNumber: 3,
          membershipId: "m1",
          meetEventId: "e1",
          stroke: null,
          eventKey: "50_free",
          qualifyingTimeMs: null,
        },
        {
          swimmerName: "No Key",
          eventNumber: 3,
          membershipId: "m1",
          meetEventId: "e1",
          stroke: "free",
          eventKey: null,
          qualifyingTimeMs: null,
        },
        {
          swimmerName: "Untimed number",
          eventNumber: null,
          membershipId: "m3",
          meetEventId: "e9",
          stroke: "free",
          eventKey: "500_free",
          qualifyingTimeMs: 1000,
          seedTime: "2.00",
        },
        {
          swimmerName: "Slow",
          eventNumber: 4,
          membershipId: "m1",
          meetEventId: "e4",
          stroke: "free",
          eventKey: "200_free",
          qualifyingTimeMs: 60000,
          seedTime: "1:05.00",
        },
        {
          swimmerName: "Second",
          eventNumber: 5,
          membershipId: "m1",
          meetEventId: "e5",
          stroke: "back",
          eventKey: "100_back",
          qualifyingTimeMs: null,
          seedTime: "",
        },
        {
          swimmerName: "Late",
          eventNumber: null,
          membershipId: "m1",
          meetEventId: "e6",
          stroke: "fly",
          eventKey: "100_fly",
          qualifyingTimeMs: 50000,
          seedTime: "55.00",
        },
      ],
      limits,
      {},
    );
    expect(planned.unmatched).toBe(1);
    expect(planned.entriesSkipped).toBe(6);
    expect(planned.accepted).toHaveLength(2);
    expect(planned.accepted.map((row) => row.membershipId)).toEqual([
      "m3",
      "m1",
    ]);
    expect(planned.accepted[1]?.seedTimeSource).toBe("personal_best");
    expect(
      planned.warnings.some((warning) => warning.includes("entered anyway")),
    ).toBe(true);
    expect(
      planned.warnings.some((warning) => warning.includes("event #5")),
    ).toBe(true);
    expect(planned.counts.m1).toEqual({ individual: 1, relay: 0 });
  });

  it("counts a relay entry and stores a zero seed as no time", () => {
    const planned = planImportedIndividualEntries(
      [
        {
          swimmerName: "Relay",
          eventNumber: null,
          membershipId: "m2",
          meetEventId: "er",
          stroke: "free_relay",
          eventKey: "200_free_relay",
          qualifyingTimeMs: null,
          seedTime: "0",
          exhibition: true,
        },
        {
          swimmerName: "Blank",
          eventNumber: 8,
          membershipId: "m4",
          meetEventId: "e8",
          stroke: "free",
          eventKey: "50_free",
          qualifyingTimeMs: null,
        },
      ],
      null,
      { m2: { individual: 0, relay: 0 } },
    );
    expect(planned.accepted[0]?.seedTimeSource).toBe("no_time");
    expect(planned.accepted[1]?.seedTimeSource).toBe("no_time");
    expect(planned.accepted[0]?.exhibition).toBe(true);
    expect(planned.counts.m2).toEqual({ individual: 0, relay: 1 });
    expect(planned.warnings).toEqual([]);
  });
});

describe("planImportedTime and results", () => {
  it("keeps a real time or a DQ and drops the rest", () => {
    expect(planImportedTime("1:02.00", false)).toEqual({
      ok: true,
      timeMs: 62000,
    });
    expect(planImportedTime("NS", false)).toEqual({ ok: true, timeMs: 0 });
    expect(planImportedTime(" ns ", true)).toEqual({ ok: true, timeMs: 0 });
    expect(isImportedNoSwim("1:00.00", true)).toBe(true);
    expect(isImportedNoSwim(undefined, false)).toBe(false);
    expect(planImportedTime("", true)).toEqual({ ok: true, timeMs: 0 });
    expect(planImportedTime("1:02.00", true).ok).toBe(true);
    expect(planImportedTime("nope", false)).toEqual({ ok: false });
    expect(planImportedTime("0", false)).toEqual({ ok: false });
    expect(planImportedTime(undefined, true)).toEqual({ ok: true, timeMs: 0 });
    expect(planImportedTime(undefined, false)).toEqual({ ok: false });
  });

  it("classifies team, roster, event, relay, and time misses", () => {
    expect(
      planImportedIndividualResult({
        isTeamAthlete: false,
        resolved: true,
        meetEventId: "e",
        isRelayEvent: false,
        time: "1:00.00",
        isDq: false,
      }),
    ).toEqual({ outcome: "skip", countSkipped: true, countUnmatched: false });
    expect(
      planImportedIndividualResult({
        isTeamAthlete: true,
        resolved: false,
        meetEventId: "e",
        isRelayEvent: false,
        time: "1:00.00",
        isDq: false,
      }).countUnmatched,
    ).toBe(true);
    expect(
      planImportedIndividualResult({
        isTeamAthlete: true,
        resolved: true,
        meetEventId: null,
        isRelayEvent: false,
        time: "1:00.00",
        isDq: false,
      }).outcome,
    ).toBe("skip");
    expect(
      planImportedIndividualResult({
        isTeamAthlete: true,
        resolved: true,
        meetEventId: "e",
        isRelayEvent: true,
        time: "1:00.00",
        isDq: false,
      }).outcome,
    ).toBe("skip");
    expect(
      planImportedIndividualResult({
        isTeamAthlete: true,
        resolved: true,
        meetEventId: "e",
        isRelayEvent: false,
        time: "",
        isDq: false,
      }),
    ).toEqual({ outcome: "ignore" });
    expect(
      planImportedIndividualResult({
        isTeamAthlete: true,
        resolved: true,
        meetEventId: "e",
        isRelayEvent: false,
        time: "59.50",
        isDq: false,
      }),
    ).toEqual({ outcome: "import", timeMs: 59500 });
    expect(
      planImportedIndividualResult({
        isTeamAthlete: true,
        resolved: true,
        meetEventId: "e",
        isRelayEvent: false,
        time: "NS",
        isDq: false,
      }),
    ).toEqual({ outcome: "import", timeMs: 0 });
  });
});

describe("meetImportSummaryWarning", () => {
  const base = {
    looksLikeResults: false,
    resultRows: 0,
    resultsAdded: 0,
    shouldImportEntries: false,
    entryRows: 0,
    entriesAdded: 0,
    entriesSkipped: 0,
    entryWarnings: [] as string[],
  };

  it("warns when nothing matched, and appends limit samples", () => {
    expect(
      meetImportSummaryWarning({
        ...base,
        looksLikeResults: true,
        resultRows: 2,
        shouldImportEntries: true,
        entryRows: 2,
      }),
    ).toContain("Parsed 2 results");
    expect(
      meetImportSummaryWarning({
        ...base,
        shouldImportEntries: true,
        entryRows: 3,
      }),
    ).toContain("Parsed 3 entries");
    expect(meetImportSummaryWarning(base)).toBeUndefined();

    const warnings = ["a", "a", "b", "c", "d"];
    const withLimits = meetImportSummaryWarning({
      ...base,
      looksLikeResults: true,
      resultRows: 1,
      entriesSkipped: 2,
      entryWarnings: warnings,
    });
    expect(withLimits).toContain("Parsed 1 results");
    expect(withLimits).toContain("2 entries skipped. a; b; c (+2 more)");

    expect(
      meetImportSummaryWarning({
        ...base,
        entriesSkipped: 0,
        entryWarnings: ["only"],
      }),
    ).toBe("only");
  });
});

describe("planResultAttachmentEvents", () => {
  const existing = [
    {
      id: "other",
      eventNumber: 2,
      eventSuffix: null,
      eventKey: "100_breast_scy_f",
    },
    {
      id: "free",
      eventNumber: 1,
      eventSuffix: null,
      eventKey: "200_free_scy_f",
    },
    { id: "age", eventNumber: 1, eventSuffix: "A", eventKey: "50_fly_scy_f" },
  ];

  it("links the same identity, skips a clash, and adds what is missing", () => {
    const writes = planResultAttachmentEvents(existing, [
      {
        eventNumber: 1,
        eventSuffix: null,
        ageGroup: "11-12",
        eventKey: "200_free_scy_f",
      },
      { eventNumber: 1, eventSuffix: "A", eventKey: "200_free_scy_f" },
      { eventNumber: null, eventKey: "100_back_scy_m" },
      { eventNumber: 9, eventSuffix: "", eventKey: "100_back_scy_m" },
      { eventNumber: 8, eventSuffix: "B", eventKey: "200_medley_relay_scy_x" },
    ]);

    expect(writes.map((write) => write.op)).toEqual([
      "link",
      "skip",
      "add",
      "add",
      "add",
    ]);
    expect(writes[0]).toMatchObject({ eventId: "free" });
    expect(writes[1]).toMatchObject({
      reason: "Event #1A on this meet does not match the results file.",
    });
    expect(writes[2]).toMatchObject({ claimEventNumber: false });
    expect(writes[3]).toMatchObject({ claimEventNumber: true });
    expect(writes[4]).toMatchObject({ claimEventNumber: false });
  });
});

describe("planResultRelayLineup", () => {
  it("keeps a full racing four, writes when none exist, and skips a partial", () => {
    expect(planResultRelayLineup([1, 2, 3, 4, 5])).toEqual({ action: "keep" });
    expect(planResultRelayLineup([1, 1, 2, 3, 4])).toEqual({ action: "keep" });
    expect(planResultRelayLineup([])).toEqual({ action: "write" });
    expect(planResultRelayLineup([0, 5, 8])).toEqual({ action: "write" });
    expect(planResultRelayLineup([1, 2, 3])).toEqual({ action: "skip" });
    expect(planResultRelayLineup([1, 1, 2, 3])).toEqual({ action: "skip" });
  });
});
