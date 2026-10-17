import type { ParsedMeet } from "@lane4hq/swim-formats";
import {
  decodeRace,
  encodeRace,
  type TimerRace,
} from "@lane4hq/timing-cts/race";
import { describe, expect, it } from "vitest";
import {
  addCapture,
  assignCapture,
  backupTime,
  findCapture,
  ignoreCapture,
  manualReview,
  nextHeat,
  reviewCapture,
  suggestAssignment,
  verifyHeat,
} from "../src/adjudicate";
import {
  addEvent,
  createMeet,
  removeEvent,
  scoringPreset,
  setScoring,
  updateMeetDetails,
} from "../src/create";
import {
  addIndividualEntry,
  detectTeam,
  mergeTeamEntries,
  parsePersonName,
  scratchEntry,
  setSeedTime,
} from "../src/entries";
import {
  athleteNameLastFirst,
  displayTime,
  eventTitle,
  indexMeet,
  toHundredths,
} from "../src/labels";
import { heatKey, type LaneResult, type Meet } from "../src/model";
import {
  markPublished,
  markPublishFailed,
  publishQueue,
  retryDelayMs,
} from "../src/publish";
import {
  heatSizes,
  laneOrder,
  moveEntry,
  seedEntries,
  seedEvent,
} from "../src/seeding";
import { eventProgress, eventStandings, teamScores } from "../src/standings";
import { counterIds, NOW } from "./helpers";

function baseMeet(): Meet {
  const newId = counterIds("m");
  let meet = createMeet(
    {
      name: "Test Invite",
      course: "SCY",
      poolLanes: 6,
      startDate: "2026-10-25",
    },
    { newId, now: NOW },
  );
  meet = addEvent(
    meet,
    { number: 1, distance: 50, stroke: "free", gender: "female" },
    { newId: () => "ev1", now: NOW },
  );
  meet = addEvent(
    meet,
    { number: 2, distance: 200, stroke: "free_relay", gender: "male" },
    { newId: () => "ev2", now: NOW },
  );
  return meet;
}

function parsed(partial: Partial<ParsedMeet>): ParsedMeet {
  return {
    name: "x",
    course: "SCY",
    events: [],
    entries: [],
    results: [],
    ...partial,
  };
}

function withEntries(count: number, team = "AAA"): Meet {
  const newId = counterIds(team);
  let meet = baseMeet();
  meet = mergeTeamEntries(
    meet,
    parsed({
      entries: Array.from({ length: count }, (_, i) => ({
        eventNumber: 1,
        swimmerName: `Swimmer ${team}${i}`,
        seedTime: i === count - 1 ? "NT" : `${30 + i}.00`,
      })),
    }),
    { code: team, name: `${team} Aquatics` },
    { newId, now: NOW },
  ).meet;
  return meet;
}

function race(
  lanes: Array<{
    place: number;
    final: number | null;
    backup?: number | null;
    exchanges?: number[];
  }>,
  extra: Partial<Parameters<typeof encodeRace>[0]> = {},
): { race: TimerRace; raw: Uint8Array } {
  const raw = encodeRace({
    event: 1,
    heat: 1,
    raceNumber: 1,
    date: {
      year: 2026,
      month: 10,
      day: 25,
      hours: 9,
      minutes: 0,
      seconds: 0,
      weekday: 0,
    },
    raceLengths: 2,
    numberOfButtons: 3,
    includes: {
      backup: true,
      splits: true,
      individualButtons: true,
      relayJudging: lanes.some((l) => l.exchanges),
    },
    lanes: lanes.map((l) => ({
      place: l.place,
      splitsMs: [l.final ? Math.round(l.final / 2) : null, l.final],
      buttonsMs: [null, null, null],
      backupMs: l.backup ?? null,
      relayExchangesMs:
        l.exchanges ?? (lanes.some((x) => x.exchanges) ? [0, 0, 0] : undefined),
    })),
    ...extra,
  });
  return { race: decodeRace(raw), raw };
}

describe("labels", () => {
  it("formats names, times, and titles", () => {
    expect(
      athleteNameLastFirst({ firstName: "Anna", lastName: "Collins" }),
    ).toBe("Collins, Anna");
    expect(athleteNameLastFirst({ firstName: "", lastName: "Solo" })).toBe(
      "Solo",
    );
    expect(displayTime(null)).toBe("NT");
    expect(displayTime(65_432)).toBe("1:05.43");
    expect(toHundredths(26_999)).toBe(26_990);
    const meet = baseMeet();
    expect(eventTitle(meet.events[0]!)).toMatch(/50 Freestyle/);
    expect(eventTitle({ ...meet.events[0]!, ageGroup: "11-12" })).toMatch(
      /11-12 50/,
    );
    const index = indexMeet(meet);
    expect(index.teamName("ZZZ")).toBe("ZZZ");
    expect(
      index.entryLabel({
        id: "e",
        eventId: "ev1",
        teamCode: "Q",
        seedTimeMs: null,
        exhibition: false,
        scratched: false,
      }),
    ).toBe("Unknown swimmer");
  });
});

describe("meet setup", () => {
  it("validates pool lanes and events", () => {
    expect(() =>
      createMeet({ name: "x", course: "SCY", poolLanes: 7 }),
    ).toThrow(/6, 8, or 10/);
    expect(createMeet({ name: "  ", course: "LCM" }).name).toBe(
      "Untitled meet",
    );
    const meet = baseMeet();
    expect(meet.events.map((e) => e.isRelay)).toEqual([false, true]);
    expect(() =>
      addEvent(meet, {
        number: 1,
        distance: 50,
        stroke: "back",
        gender: "male",
      }),
    ).toThrow(/already exists/);
    expect(
      addEvent(meet, {
        number: 3,
        distance: 0,
        stroke: "dive",
        gender: "female",
      }).events[2]!.kind,
    ).toBe("dive");
    expect(removeEvent(meet, "ev2", NOW).events).toHaveLength(1);
    expect(() => updateMeetDetails(meet, { poolLanes: 9 })).toThrow(RangeError);
    expect(updateMeetDetails(meet, { name: "Renamed" }, NOW).name).toBe(
      "Renamed",
    );
    expect(
      setScoring(meet, scoringPreset("dual"), NOW).scoring.individual,
    ).toEqual([6, 4, 3, 2, 1]);
  });
});

describe("entries", () => {
  it("parses names both ways", () => {
    expect(parsePersonName("Collins, Anna Marie")).toEqual({
      firstName: "Anna Marie",
      lastName: "Collins",
    });
    expect(parsePersonName("Anna  van Dyke")).toEqual({
      firstName: "Anna",
      lastName: "van Dyke",
    });
    expect(parsePersonName("Cher")).toEqual({
      firstName: "",
      lastName: "Cher",
    });
  });

  it("detects teams from the file or its name", () => {
    expect(
      detectTeam(
        parsed({ teamCode: "mari", lscCode: "az", teamName: "Marana" }),
      ),
    ).toEqual({ code: "MARI", name: "Marana", lsc: "AZ" });
    expect(detectTeam(parsed({}), "C:\\Packs\\CTCC-GA-Entries001.zip")).toEqual(
      { code: "CTCC", name: "CTCC", lsc: "GA" },
    );
    expect(
      detectTeam(parsed({ relays: [{ swimmerNames: [], teamCode: "RLY" }] }))
        .code,
    ).toBe("RLY");
    expect(detectTeam(parsed({})).code).toBe("");
  });

  it("merges, skips mismatches, and replaces on re-import", () => {
    let meet = baseMeet();
    const pack = parsed({
      events: [
        {
          eventNumber: 1,
          distance: 100,
          stroke: "free",
          gender: "female",
          eventKey: "x",
        },
      ],
      entries: [
        { eventNumber: 1, swimmerName: "A B" },
        { eventNumber: 9, swimmerName: "C D" },
        { eventNumber: 2, swimmerName: "E F" },
      ],
      relays: [
        { eventNumber: 1, swimmerNames: [], relayLetter: "A" },
        { eventNumber: 2, swimmerNames: ["G H", "I J"], seedTime: "1:45.00" },
      ],
    });
    expect(() => mergeTeamEntries(meet, pack, { code: " ", name: "" })).toThrow(
      /team code/,
    );
    let result = mergeTeamEntries(
      meet,
      pack,
      { code: "aaa", name: "AAA" },
      { newId: counterIds(), now: NOW },
    );
    // Event 1 in the file is a 100, not the meet's 50: skipped.
    expect(result.summary.skipped.map((s) => s.reason)).toEqual([
      "File's event 1 is a different race",
      "Event isn't in this meet",
      "Individual entry in a relay event",
      "File's event 1 is a different race",
    ]);
    expect(result.summary.added).toBe(1);
    meet = result.meet;
    expect(meet.entries[0]!.relay?.legAthleteIds).toHaveLength(2);
    expect(meet.entries[0]!.seedTimeMs).toBe(105_000);

    const good = parsed({
      athletes: [{ name: "Kay Lee", usaMemberId: "USA1", gender: "female" }],
      entries: [
        {
          eventNumber: 1,
          swimmerName: "Kay Lee",
          seedTime: "28.10Y",
          usaMemberId: "USA1",
        },
        {
          eventNumber: 1,
          swimmerName: "Mo Ray",
          seedTime: "NT",
          dateOfBirth: "2012-01-01",
        },
      ],
      relays: [{ eventNumber: 1, swimmerNames: ["Kay Lee"], relayLetter: "b" }],
    });
    result = mergeTeamEntries(
      meet,
      good,
      { code: "AAA", name: "AAA Swim" },
      { newId: counterIds("g"), now: NOW },
    );
    expect(result.summary).toMatchObject({ added: 2, replaced: 1 });
    expect(result.summary.skipped[0]!.reason).toBe(
      "Relay entry in an individual event",
    );
    meet = seedEvent(result.meet, "ev1", {}, NOW);
    expect(meet.teams[0]!.name).toBe("AAA Swim");

    // Re-import with one swimmer verified: that entry is kept, the other replaced.
    const kayEntry = meet.entries.find((e) => e.seedTimeMs === 28_100)!;
    const heat = meet.heats[0]!;
    const lane = heat.lanes.find((l) => l.entryId === kayEntry.id)!.lane;
    meet = verifyHeat(
      meet,
      { eventId: "ev1", heat: heat.number },
      [
        {
          entryId: kayEntry.id,
          eventId: "ev1",
          heat: heat.number,
          lane,
          status: "ok",
          timeMs: 28_000,
          source: "manual",
          splitsMs: [],
          backupMs: null,
          buttonsMs: [],
          relayExchangesMs: [],
        },
      ],
      NOW,
    );
    result = mergeTeamEntries(
      meet,
      good,
      { code: "AAA", name: "AAA Swim" },
      { newId: counterIds("h"), now: NOW },
    );
    expect(result.summary).toMatchObject({
      kept: 1,
      replaced: 1,
      added: 1,
      heatsNeedingReseed: ["ev1"],
    });
    // Mo Ray matched by name + DOB, Kay by USA ID: no duplicate athletes.
    expect(
      result.meet.athletes.filter((a) => a.teamCode === "AAA"),
    ).toHaveLength(meet.athletes.filter((a) => a.teamCode === "AAA").length);
  });

  it("edits entries on deck", () => {
    let meet = baseMeet();
    meet = addIndividualEntry(
      meet,
      {
        eventId: "ev1",
        teamCode: "unat",
        firstName: " Deck ",
        lastName: " Entry ",
        seedTimeMs: 31_000,
      },
      { newId: counterIds("d"), now: NOW },
    );
    expect(meet.teams).toEqual([{ code: "UNAT", name: "UNAT" }]);
    const athleteId = meet.athletes[0]!.id;
    meet = addIndividualEntry(
      meet,
      {
        eventId: "ev1",
        teamCode: "UNAT",
        firstName: "",
        lastName: "",
        athleteId,
      },
      { newId: counterIds("e"), now: NOW },
    );
    expect(meet.athletes).toHaveLength(1);
    expect(meet.entries[1]!.seedTimeMs).toBeNull();
    const id = meet.entries[0]!.id;
    expect(scratchEntry(meet, id, true, NOW).entries[0]!.scratched).toBe(true);
    expect(setSeedTime(meet, id, 29_000, NOW).entries[0]!.seedTimeMs).toBe(
      29_000,
    );
  });
});

describe("seeding", () => {
  it("orders lanes center-out", () => {
    expect(laneOrder(6)).toEqual([3, 4, 2, 5, 1, 6]);
    expect(laneOrder(8)).toEqual([4, 5, 3, 6, 2, 7, 1, 8]);
    expect(laneOrder(10)).toEqual([5, 6, 4, 7, 3, 8, 2, 9, 1, 10]);
  });

  it("keeps at least three swimmers in the first heat", () => {
    expect(heatSizes(0, 6)).toEqual([]);
    expect(heatSizes(5, 6)).toEqual([5]);
    expect(heatSizes(13, 6)).toEqual([3, 4, 6]);
    expect(heatSizes(8, 6)).toEqual([3, 5]);
    expect(heatSizes(7, 6)).toEqual([3, 4]);
    expect(heatSizes(4, 2)).toEqual([2, 2]);
  });

  it("seeds fastest heat last with the fastest swimmer in the center", () => {
    const meet = seedEvent(withEntries(8), "ev1", {}, NOW);
    const heats = meet.heats;
    expect(heats.map((h) => h.lanes.length)).toEqual([3, 5]);
    const index = indexMeet(meet);
    const fastest = heats[1]!.lanes.find((l) => l.lane === 3)!;
    expect(index.entry(fastest.entryId)!.seedTimeMs).toBe(30_000);
    // NT is slowest, so it's in heat 1.
    expect(
      heats[0]!.lanes.some((l) => index.entry(l.entryId)!.seedTimeMs == null),
    ).toBe(true);
  });

  it("circle-seeds the top heats", () => {
    const entries = Array.from({ length: 18 }, (_, i) => ({
      id: `e${i}`,
      eventId: "x",
      teamCode: "T",
      seedTimeMs: 20_000 + i * 100,
      exhibition: false,
      scratched: false,
    }));
    const heats = seedEntries("x", entries, { lanes: 6, circleHeats: 3 });
    const inHeat = (n: number) =>
      heats[n - 1]!.lanes.map((l) => l.entryId).sort();
    expect(inHeat(3)).toEqual(["e0", "e12", "e15", "e3", "e6", "e9"]);
    expect(inHeat(2)).toEqual(["e1", "e10", "e13", "e16", "e4", "e7"]);
    const short = seedEntries("x", entries.slice(0, 8), {
      lanes: 6,
      circleHeats: 3,
    });
    expect(short.map((h) => h.lanes.length)).toEqual([3, 5]);
  });

  it("refuses to reseed swum events and moves entries", () => {
    let meet = seedEvent(withEntries(4), "ev1", {}, NOW);
    expect(() => seedEvent(meet, "nope")).toThrow(/Unknown event/);
    const [a, b] = meet.heats[0]!.lanes;
    meet = moveEntry(meet, a!.entryId, { heat: 1, lane: b!.lane }, NOW);
    expect(meet.heats[0]!.lanes.find((l) => l.lane === b!.lane)!.entryId).toBe(
      a!.entryId,
    );
    expect(meet.heats[0]!.lanes.find((l) => l.lane === a!.lane)!.entryId).toBe(
      b!.entryId,
    );
    meet = moveEntry(meet, a!.entryId, { heat: 2, lane: 6 }, NOW);
    expect(meet.heats.find((h) => h.number === 2)!.lanes).toEqual([
      { lane: 6, entryId: a!.entryId },
    ]);
    expect(() => moveEntry(meet, "missing", { heat: 1, lane: 1 })).toThrow(
      /isn't seeded/,
    );
    expect(() => moveEntry(meet, a!.entryId, { heat: 1, lane: 9 })).toThrow(
      RangeError,
    );
    meet = verifyHeat(meet, { eventId: "ev1", heat: 2 }, [], NOW);
    meet = {
      ...meet,
      results: [
        {
          entryId: a!.entryId,
          eventId: "ev1",
          heat: 2,
          lane: 6,
          status: "ok",
          timeMs: 1,
          source: "manual",
          splitsMs: [],
          backupMs: null,
          buttonsMs: [],
          relayExchangesMs: [],
        },
      ],
    };
    expect(() => seedEvent(meet, "ev1")).toThrow(/already has results/);
    expect(() => removeEvent(meet, "ev1")).toThrow(/has results/);
  });
});

describe("adjudication", () => {
  function seeded() {
    return seedEvent(withEntries(4), "ev1", {}, NOW);
  }

  it("suggests assignments from titles, then follows on", () => {
    let meet = seeded();
    meet = addEvent(
      meet,
      { number: 3, distance: 100, stroke: "back", gender: "male" },
      { newId: () => "ev3", now: NOW },
    );
    meet = seedEvent(meet, "ev3", {}, NOW);
    expect(suggestAssignment(meet, { event: 1, heat: 0 })).toEqual({
      eventId: "ev1",
      heat: 1,
    });
    expect(suggestAssignment(meet, { event: 0, heat: 0 })).toEqual({
      eventId: "ev1",
      heat: 1,
    });
    const first = addCapture(meet, race([{ place: 1, final: 30_000 }]), {
      newId: () => "c1",
      now: NOW,
    });
    meet = first.meet;
    expect(suggestAssignment(meet, { event: 0, heat: 0 })).toBeNull();
    expect(nextHeat(meet, { eventId: "ev1", heat: 1 })).toBeNull();
    meet = assignCapture(meet, "c1", { eventId: "ev1", heat: 1 }, NOW);
    expect(findCapture(meet, first.capture.race)?.id).toBe("c1");
    meet = ignoreCapture(meet, "c1", NOW);
    expect(meet.captures[0]!.state).toBe("ignored");
    meet = assignCapture(meet, "c1", { eventId: "ev1", heat: 1 }, NOW);
    expect(meet.captures[0]!.state).toBe("new");
    const verified = verifyHeat(meet, { eventId: "ev1", heat: 1 }, [], NOW);
    expect(suggestAssignment(verified, { event: 0, heat: 0 })).toBeNull();
    // ev3 has no entries, so no heats: nothing left to swim.
    expect(
      suggestAssignment({ ...verified, captures: [] }, { event: 0, heat: 0 }),
    ).toBeNull();
  });

  it("flags pad/backup problems, empty lanes, DQs, and no-shows", () => {
    const meet = seeded();
    const heat = meet.heats[0]!;
    const lanes = heat.lanes.map((l) => l.lane);
    const timerLanes = Array.from({ length: 6 }, (_, i) => {
      const lane = i + 1;
      if (lane === lanes[0]) return { place: 1, final: 30_000, backup: 30_900 };
      if (lane === lanes[1]) return { place: 0, final: null, backup: 31_500 };
      if (lane === lanes[2]) return { place: -1, final: 32_000 };
      if (lane === lanes[3]) return { place: 0, final: null };
      return { place: 2, final: 33_000 };
    });
    const { meet: withCapture, capture } = addCapture(
      meet,
      race(timerLanes, { raceLengths: 4, event: 7 }),
      { now: NOW },
    );
    const review = reviewCapture(withCapture, {
      ...capture,
      assignment: { eventId: "ev1", heat: 1 },
    });
    const flags = (lane: number) =>
      review.lanes.find((l) => l.lane === lane)!.flags;
    expect(flags(lanes[0]!)).toEqual(["pad-backup-mismatch"]);
    expect(flags(lanes[1]!)).toEqual(["no-pad-time"]);
    expect(review.lanes.find((l) => l.lane === lanes[1])!.result).toMatchObject(
      { timeMs: 31_500, source: "backup" },
    );
    expect(flags(lanes[2]!)).toEqual(["timer-dq"]);
    expect(flags(lanes[3]!)).toEqual(["no-time"]);
    const empty = review.lanes.find((l) => l.entryId == null)!;
    expect(empty.flags).toEqual(["time-in-empty-lane"]);
    expect(review.warnings).toHaveLength(2);
    expect(() =>
      reviewCapture(withCapture, { ...capture, assignment: null }),
    ).toThrow(/Assign/);
    expect(() =>
      reviewCapture(withCapture, {
        ...capture,
        assignment: { eventId: "gone", heat: 1 },
      }),
    ).toThrow(/no longer exists/);
  });

  it("flags early relay takeoffs and uses button medians", () => {
    let meet = baseMeet();
    meet = mergeTeamEntries(
      meet,
      parsed({
        relays: [
          {
            eventNumber: 2,
            swimmerNames: ["A B", "C D", "E F", "G H"],
            relayLetter: "A",
          },
        ],
      }),
      { code: "R", name: "R" },
      { now: NOW },
    ).meet;
    meet = seedEvent(meet, "ev2", {}, NOW);
    const lane = meet.heats[0]!.lanes[0]!.lane;
    const lanes = Array.from({ length: 6 }, (_, i) =>
      i + 1 === lane
        ? { place: 1, final: 100_000, exchanges: [100, -45, 200] }
        : { place: 0, final: null },
    );
    const { meet: m2, capture } = addCapture(
      meet,
      race(lanes, { event: 2, raceLengths: 8 }),
      { now: NOW },
    );
    const review = reviewCapture(m2, capture);
    expect(review.lanes.find((l) => l.lane === lane)!.flags).toEqual([
      "early-takeoff",
    ]);
    expect(
      backupTime({
        lane: 1,
        place: 1,
        status: "finished",
        finalMs: 1,
        splitsMs: [],
        buttonsMs: [100, null, 300, 200],
        backupMs: null,
        relayExchangesMs: [],
      }),
    ).toBe(200);
    expect(
      backupTime({
        lane: 1,
        place: 1,
        status: "finished",
        finalMs: 1,
        splitsMs: [],
        buttonsMs: [100, 300],
        backupMs: null,
        relayExchangesMs: [],
      }),
    ).toBe(200);
    expect(
      backupTime({
        lane: 1,
        place: 1,
        status: "finished",
        finalMs: 1,
        splitsMs: [],
        buttonsMs: [],
        backupMs: null,
        relayExchangesMs: [],
      }),
    ).toBeNull();
  });

  it("verifies heats with validation and supports manual entry", () => {
    let meet = seeded();
    const review = manualReview(meet, "ev1", 1);
    expect(review.lanes).toHaveLength(4);
    expect(manualReview(meet, "ev1", 9).lanes).toEqual([]);
    const results = review.lanes.map((l, i) => ({
      ...l.result!,
      status: "ok" as const,
      timeMs: 30_000 + i * 10,
    }));
    expect(() =>
      verifyHeat(meet, { eventId: "ev1", heat: 1 }, [
        { ...results[0]!, heat: 2 },
      ]),
    ).toThrow(/belong/);
    expect(() =>
      verifyHeat(meet, { eventId: "ev1", heat: 1 }, [
        { ...results[0]!, timeMs: null },
      ]),
    ).toThrow(/no time/);
    meet = verifyHeat(meet, { eventId: "ev1", heat: 1 }, results, NOW);
    meet = verifyHeat(meet, { eventId: "ev1", heat: 1 }, results, NOW);
    expect(meet.heatRecords[heatKey("ev1", 1)]!.revision).toBe(2);
    expect(meet.results).toHaveLength(4);
    expect(manualReview(meet, "ev1", 1).lanes[0]!.result!.status).toBe("ok");
  });
});

describe("standings", () => {
  function result(
    entryId: string,
    lane: number,
    status: LaneResult["status"],
    timeMs: number | null,
  ): LaneResult {
    return {
      entryId,
      eventId: "ev1",
      heat: 1,
      lane,
      status,
      timeMs,
      source: "manual",
      splitsMs: [],
      backupMs: null,
      buttonsMs: [],
      relayExchangesMs: [],
    };
  }

  it("ties at the hundredth, splits points, and skips exhibition", () => {
    let meet = seedEvent(withEntries(5), "ev1", {}, NOW);
    const ids = meet.entries.map((e) => e.id);
    meet = {
      ...meet,
      entries: meet.entries.map((e, i) =>
        i === 3 ? { ...e, exhibition: true } : e,
      ),
    };
    meet = verifyHeat(
      meet,
      { eventId: "ev1", heat: 1 },
      [
        result(ids[0]!, 1, "ok", 30_001),
        result(ids[1]!, 2, "ok", 30_009),
        result(ids[2]!, 3, "ok", 31_000),
        result(ids[3]!, 4, "ok", 29_000),
        result(ids[4]!, 5, "dq", 28_000),
      ],
      NOW,
    );
    const rows = eventStandings(meet, "ev1");
    expect(rows.map((r) => r.place)).toEqual([1, 1, 3, null, null]);
    expect(rows.map((r) => r.points)).toEqual([8, 8, 6, 0, 0]);
    expect(rows[4]!.result.status).toBe("dq");
    expect(teamScores(meet)).toEqual([{ teamCode: "AAA", points: 22 }]);
    expect(eventProgress(meet, "ev1")).toEqual({
      heats: 1,
      verified: 1,
      state: "complete",
    });
    expect(eventProgress(meet, "ev2").state).toBe("unseeded");
  });

  it("orders non-finishers by heat and lane", () => {
    let meet = seedEvent(withEntries(7), "ev1", {}, NOW);
    const ids = meet.entries.map((e) => e.id);
    meet = verifyHeat(
      meet,
      { eventId: "ev1", heat: 1 },
      [result(ids[0]!, 3, "ns", null), result(ids[1]!, 2, "ns", null)],
      NOW,
    );
    expect(eventStandings(meet, "ev1").map((r) => r.result.lane)).toEqual([
      2, 3,
    ]);
    expect(eventProgress(meet, "ev1").state).toBe("in-progress");
    expect(eventProgress(seedEvent(withEntries(3), "ev1"), "ev1").state).toBe(
      "seeded",
    );
  });
});

describe("publish queue", () => {
  it("ignores stale revisions and backs off failures", () => {
    let meet = seedEvent(withEntries(3), "ev1", {}, NOW);
    meet = verifyHeat(meet, { eventId: "ev1", heat: 1 }, [], NOW);
    const key = heatKey("ev1", 1);
    expect(markPublished(meet, key, 99, NOW)).toBe(meet);
    expect(markPublished(meet, "nope", 1, NOW)).toBe(meet);
    expect(markPublishFailed(meet, "nope", "x", NOW)).toBe(meet);
    meet = markPublishFailed(meet, key, "offline", NOW);
    expect(meet.heatRecords[key]!.publish).toMatchObject({
      state: "failed",
      attempts: 1,
      lastError: "offline",
    });
    expect(publishQueue(meet)).toHaveLength(1);
    expect(publishQueue({ ...meet, events: [] })).toHaveLength(0);
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(3)).toBe(20_000);
    expect(retryDelayMs(30)).toBe(300_000);
  });
});
