import { describe, expect, it } from "vitest";
import {
  addCapture,
  assignCapture,
  manualReview,
  nextHeat,
  suggestAssignment,
  verifyHeat,
} from "../src/adjudicate";
import { addEvent, createMeet, removeEvent } from "../src/create";
import { saveDiveSheet, setDiveSettings } from "../src/diving";
import { addIndividualEntry, scratchEntry, setSeedTime } from "../src/entries";
import {
  renumberEvents,
  swapGenderOrder,
  updateEvent,
} from "../src/event-edits";
import {
  exportAllTeamResults,
  exportTeamResults,
  teamResultsMeet,
} from "../src/export";
import { createFinals } from "../src/finals";
import type { Meet } from "../src/model";
import {
  assertRunsEvent,
  assignEventToPool,
  BOYS_POOL_ID,
  eventPoolId,
  GIRLS_POOL_ID,
  genderLabel,
  localPool,
  mergePoolCopy,
  poolEventIds,
  runsEvent,
  setLocalPool,
  splitByGender,
  unsplitMeet,
} from "../src/pools";
import {
  drawDiveOrder,
  moveEntry,
  seedAllEvents,
  seedEvent,
} from "../src/seeding";
import { teamScores } from "../src/standings";
import { counterIds, NOW } from "./helpers";

/** Girls 50 free (#1), boys 50 free (#2), mixed relay (#3), boys diving (#4). */
function setUp(): Meet {
  const newId = counterIds("m");
  let meet = createMeet(
    { name: "Dual", course: "SCY", poolLanes: 6, startDate: "2026-10-25" },
    { newId, now: NOW },
  );
  const events = [
    { id: "g50", number: 1, gender: "female" as const, stroke: "free" },
    { id: "b50", number: 2, gender: "male" as const, stroke: "free" },
    { id: "x200", number: 3, gender: "mixed" as const, stroke: "free_relay" },
  ];
  for (const e of events) {
    meet = addEvent(
      meet,
      {
        number: e.number,
        distance: e.stroke === "free" ? 50 : 200,
        stroke: e.stroke,
        gender: e.gender,
      },
      { newId: () => e.id, now: NOW },
    );
  }
  meet = addEvent(
    meet,
    { number: 4, distance: 1, stroke: "dive", gender: "male", diveCount: 6 },
    { newId: () => "bdive", now: NOW },
  );
  const swimmers: Array<[string, string, string, "female" | "male"]> = [
    ["g50", "AAA", "Ava Smith", "female"],
    ["g50", "BBB", "Bea Jones", "female"],
    ["b50", "AAA", "Cal Smith", "male"],
    ["b50", "BBB", "Dan Jones", "male"],
    ["bdive", "AAA", "Eli Diver", "male"],
  ];
  for (const [eventId, teamCode, name, gender] of swimmers) {
    const [firstName, lastName] = name.split(" ") as [string, string];
    meet = addIndividualEntry(
      meet,
      { eventId, teamCode, firstName, lastName, gender, seedTimeMs: 30_000 },
      { newId, now: NOW },
    );
  }
  return seedAllEvents(meet, { random: () => 0.5 }, NOW);
}

function copyOf(meet: Meet): Meet {
  return JSON.parse(JSON.stringify(meet)) as Meet;
}

function swimHeat(meet: Meet, eventId: string, base: number): Meet {
  const review = manualReview(meet, eventId, 1);
  const results = review.lanes.map((l, i) => ({
    ...l.result!,
    status: "ok" as const,
    timeMs: base + i * 100,
  }));
  return verifyHeat(meet, { eventId, heat: 1 }, results, NOW);
}

describe("splitting a meet into pools", () => {
  it("puts girls and mixed events in the girls pool, boys in the boys pool", () => {
    const meet = splitByGender(setUp(), NOW);
    expect(splitByGender(meet)).toBe(meet);
    expect(localPool(meet)?.id).toBe(GIRLS_POOL_ID);
    expect(eventPoolId(meet, "g50")).toBe(GIRLS_POOL_ID);
    expect(eventPoolId(meet, "x200")).toBe(GIRLS_POOL_ID);
    expect(eventPoolId(meet, "b50")).toBe(BOYS_POOL_ID);
    expect(eventPoolId(meet, "nope")).toBeNull();
    expect([...poolEventIds(meet, BOYS_POOL_ID)]).toEqual(["b50", "bdive"]);
    expect(runsEvent(meet, "g50")).toBe(true);
    expect(runsEvent(meet, "b50")).toBe(false);
  });

  it("runs everything when not split", () => {
    const meet = setUp();
    expect(eventPoolId(meet, "g50")).toBeNull();
    expect(localPool(meet)).toBeNull();
    expect(runsEvent(meet, "b50")).toBe(true);
    expect(unsplitMeet(meet)).toBe(meet);
    expect(unsplitMeet(splitByGender(meet)).split).toBeUndefined();
  });

  it("falls back to the first pool when no pool takes a gender", () => {
    const meet: Meet = {
      ...setUp(),
      split: {
        pools: [{ id: "a", name: "Pool A", genders: [] }],
        localPoolId: "a",
        assignments: { g50: "gone" },
      },
    };
    expect(eventPoolId(meet, "g50")).toBe("a");
    const empty: Meet = {
      ...meet,
      split: { pools: [], localPoolId: "a", assignments: {} },
    };
    expect(eventPoolId(empty, "g50")).toBeNull();
  });

  it("sets this computer's pool and moves events by hand", () => {
    let meet = splitByGender(setUp(), NOW);
    expect(() => setLocalPool(meet, "nope")).toThrow(/isn't part/);
    meet = setLocalPool(meet, BOYS_POOL_ID, NOW);
    expect(localPool(meet)?.name).toBe("Boys pool");
    meet = assignEventToPool(meet, "x200", BOYS_POOL_ID, NOW);
    expect(eventPoolId(meet, "x200")).toBe(BOYS_POOL_ID);
    expect(() => assignEventToPool(meet, "nope", BOYS_POOL_ID)).toThrow(
      /isn't in this meet/,
    );
    const swum = swimHeat(meet, "b50", 30_000);
    expect(() => assignEventToPool(swum, "b50", GIRLS_POOL_ID)).toThrow(
      /can't change pools/,
    );
  });

  it("sends a final to its prelim's pool", () => {
    let meet = setUp();
    meet = updateEvent(meet, "b50", { round: "prelim" }, NOW);
    meet = splitByGender(setLocalPool(splitByGender(meet), BOYS_POOL_ID), NOW);
    meet = swimHeat(meet, "b50", 30_000);
    const built = createFinals(meet, "b50", {
      finalHeats: 1,
      newId: () => "b50f",
      now: NOW,
    });
    expect(eventPoolId(built.meet, "b50f")).toBe(BOYS_POOL_ID);
    expect(() => assignEventToPool(built.meet, "b50f", GIRLS_POOL_ID)).toThrow(
      /prelim's pool/,
    );
    // A final whose prelim is gone goes by its own gender.
    const orphan: Meet = {
      ...built.meet,
      events: built.meet.events.filter((e) => e.id !== "b50"),
    };
    expect(eventPoolId(orphan, "b50f")).toBe(BOYS_POOL_ID);
    // A loop in prelim links can't hang the lookup.
    const looped: Meet = {
      ...built.meet,
      events: built.meet.events.map((e) =>
        e.id === "b50" ? { ...e, prelimEventId: "b50f" } : e,
      ),
    };
    expect(eventPoolId(looped, "b50f")).toBe(BOYS_POOL_ID);
  });
});

describe("running only this pool's events", () => {
  const girls = () => splitByGender(setUp(), NOW);

  it("refuses to change the other pool's events", () => {
    const meet = girls();
    const boysEntry = meet.entries.find((e) => e.eventId === "b50")!;
    const message = /Event 2 runs in the Boys pool/;
    expect(() => assertRunsEvent(meet, "b50")).toThrow(message);
    expect(() => assertRunsEvent(meet, "nope")).toThrow(
      /Event \? runs in the other pool/,
    );
    expect(() => seedEvent(meet, "b50")).toThrow(message);
    expect(() => drawDiveOrder(meet, "bdive")).toThrow(/Event 4/);
    expect(() => moveEntry(meet, boysEntry.id, { heat: 1, lane: 1 })).toThrow(
      message,
    );
    expect(() => scratchEntry(meet, boysEntry.id)).toThrow(message);
    expect(() => setSeedTime(meet, boysEntry.id, 1)).toThrow(message);
    expect(scratchEntry(meet, "no-such-entry").entries).toEqual(meet.entries);
    expect(() =>
      addIndividualEntry(meet, {
        eventId: "b50",
        teamCode: "AAA",
        firstName: "New",
        lastName: "Kid",
      }),
    ).toThrow(message);
    expect(() => saveDiveSheet(meet, "bdive", "x", [])).toThrow(/Event 4/);
    expect(() => setDiveSettings(meet, "bdive", { diveCount: 11 })).toThrow(
      /Event 4/,
    );
    expect(() => updateEvent(meet, "b50", { distance: 100 })).toThrow(message);
    expect(() => removeEvent(meet, "b50")).toThrow(message);
    expect(() => swapGenderOrder(meet)).toThrow(/before splitting/);
    expect(() => renumberEvents(meet)).toThrow(/before splitting/);
    expect(() => assignCapture(meet, "c", { eventId: "b50", heat: 1 })).toThrow(
      message,
    );
    expect(assignCapture(meet, "c", null).captures).toEqual([]);
    expect(() => verifyHeat(meet, { eventId: "b50", heat: 1 }, [])).toThrow(
      message,
    );
    expect(() => createFinals(meet, "b50")).toThrow(message);
  });

  it("points timer races at this pool's events", () => {
    const meet = girls();
    // The console says event 2, but that's the boys pool's.
    expect(suggestAssignment(meet, { event: 2, heat: 1 })).toEqual({
      eventId: "g50",
      heat: 1,
    });
    // Heat 1 of the boys' event is next in the meet, but not in this pool.
    expect(nextHeat(meet, { eventId: "g50", heat: 1 })).toBeNull();
    expect(nextHeat(setUp(), { eventId: "g50", heat: 1 })).toEqual({
      eventId: "b50",
      heat: 1,
    });
  });

  it("seeds only this pool's events", () => {
    const split = splitByGender({ ...setUp(), heats: [] }, NOW);
    const seeded = seedAllEvents(split, { random: () => 0.5 }, NOW);
    expect(new Set(seeded.heats.map((h) => h.eventId))).toEqual(
      new Set(["g50"]),
    );
  });
});

describe("merging the other pool", () => {
  /** Set up once, copy to the boys machine, swim both pools. */
  function twoPools() {
    let girls = splitByGender(setUp(), NOW);
    let boys = setLocalPool(copyOf(girls), BOYS_POOL_ID, NOW);
    girls = swimHeat(girls, "g50", 30_000);
    boys = swimHeat(boys, "b50", 28_000);
    // A deck entry on the boys side for someone already in the meet.
    boys = addIndividualEntry(
      boys,
      { eventId: "b50", teamCode: "AAA", firstName: "cal", lastName: "SMITH" },
      { newId: () => "deck-cal", now: NOW },
    );
    boys = { ...boys, teams: [...boys.teams, { code: "CCC", name: "C Club" }] };
    const diver = boys.entries.find((e) => e.eventId === "bdive")!;
    boys = saveDiveSheet(boys, "bdive", diver.id, [], NOW);
    boys = addCapture(
      boys,
      { race: { event: 2, heat: 1 } as never, raw: new Uint8Array([1]) },
      { newId: () => "cap-b", now: NOW },
    ).meet;
    boys = addCapture(
      boys,
      { race: { event: 9, heat: 1 } as never, raw: new Uint8Array([2]) },
      { newId: () => "cap-loose", now: NOW },
    ).meet;
    boys = {
      ...boys,
      captures: boys.captures.map((c) =>
        c.id === "cap-loose" ? { ...c, assignment: null } : c,
      ),
    };
    return { girls, boys };
  }

  it("brings in the other pool's heats, results, and deck swimmers", () => {
    const { girls, boys } = twoPools();
    const { meet, report } = mergePoolCopy(girls, boys, NOW);
    expect(report).toMatchObject({
      poolName: "Boys pool",
      events: 2,
      heats: 1,
      results: 2,
      athletesAdded: 1,
      claimedByBoth: [],
    });
    expect(report.possibleDuplicates).toHaveLength(1);
    expect(report.possibleDuplicates[0]!.name).toBe("cal SMITH");
    expect(meet.split?.localPoolId).toBe(GIRLS_POOL_ID);
    expect(meet.results.map((r) => r.eventId).sort()).toEqual([
      "b50",
      "b50",
      "g50",
      "g50",
    ]);
    expect(Object.keys(meet.heatRecords).sort()).toEqual(["b50#1", "g50#1"]);
    expect(meet.teams.map((t) => t.code)).toContain("CCC");
    expect(meet.captures.map((c) => c.id)).toEqual(["cap-b"]);
    expect(Object.keys(meet.diveSheets ?? {})).toHaveLength(1);
    // Merging again changes nothing.
    expect(mergePoolCopy(meet, boys, NOW).meet).toEqual(meet);
    // Either direction works.
    const reverse = mergePoolCopy(boys, girls, NOW);
    expect(reverse.report.poolName).toBe("Girls pool");
    expect(reverse.meet.results).toHaveLength(4);
  });

  it("scores and exports girls, boys, and combined", () => {
    const { girls, boys } = twoPools();
    const meet = mergePoolCopy(girls, boys, NOW).meet;
    const total = (scores: ReturnType<typeof teamScores>) =>
      scores.reduce((sum, s) => sum + s.points, 0);
    const girlsPoints = total(teamScores(meet, { gender: "female" }));
    const boysPoints = total(teamScores(meet, { gender: "male" }));
    expect(girlsPoints).toBeGreaterThan(0);
    expect(boysPoints).toBeGreaterThan(0);
    expect(total(teamScores(meet))).toBe(girlsPoints + boysPoints);

    expect(
      teamResultsMeet(meet, "AAA", { gender: "female" }).events.map(
        (e) => e.eventNumber,
      ),
    ).toEqual([1]);
    expect(
      teamResultsMeet(meet, "AAA").events.map((e) => e.eventNumber),
    ).toEqual([1, 2]);
    expect(exportTeamResults(meet, "AAA", { gender: "male" }).filename).toBe(
      "AAA-Results-Dual-Boys-25Oct2026-001.zip",
    );
    expect(exportAllTeamResults(meet, { gender: "female" }).filename).toBe(
      "Results-Dual-Girls-25Oct2026.zip",
    );
    expect(genderLabel("female")).toBe("Girls");
  });

  it("drops events the other pool removed, and keeps events both claim", () => {
    let { girls, boys } = twoPools();
    girls = assignEventToPool(girls, "x200", GIRLS_POOL_ID, NOW);
    boys = assignEventToPool(boys, "x200", BOYS_POOL_ID, NOW);
    boys = removeEvent(boys, "bdive", NOW);
    const { meet, report } = mergePoolCopy(girls, boys, NOW);
    expect(report.claimedByBoth).toEqual([3]);
    expect(meet.events.map((e) => e.id)).toEqual(["g50", "b50", "x200"]);
    expect(eventPoolId(meet, "x200")).toBe(GIRLS_POOL_ID);
  });

  it("takes the other pool's hand assignments for its events", () => {
    let girls = splitByGender(setUp(), NOW);
    girls = assignEventToPool(girls, "x200", BOYS_POOL_ID, NOW);
    const boys = setLocalPool(copyOf(girls), BOYS_POOL_ID, NOW);
    const { meet, report } = mergePoolCopy(girls, boys, NOW);
    expect(report.claimedByBoth).toEqual([]);
    expect(meet.split?.assignments).toEqual({ x200: BOYS_POOL_ID });
  });

  it("ignores the other copy's records for this pool's events", () => {
    // Heat 1 of the girls' event was swum before the meet was copied.
    let girls = swimHeat(splitByGender(setUp(), NOW), "g50", 30_000);
    let boys = setLocalPool(copyOf(girls), BOYS_POOL_ID, NOW);
    boys = assignEventToPool(boys, "x200", GIRLS_POOL_ID, NOW);
    boys = {
      ...boys,
      entries: [
        ...boys.entries,
        {
          id: "relay-a",
          eventId: "b50",
          teamCode: "AAA",
          seedTimeMs: null,
          exhibition: false,
          scratched: false,
          relay: { letter: "A", legAthleteIds: [] },
        },
      ],
    };
    girls = swimHeat(girls, "g50", 29_000);
    const { meet } = mergePoolCopy(girls, boys, NOW);
    expect(meet.heatRecords["g50#1"]).toEqual(girls.heatRecords["g50#1"]);
    expect(meet.split?.assignments).toEqual({});
    expect(meet.entries.some((e) => e.id === "relay-a")).toBe(true);
  });

  it("keeps this pool's dive sheets", () => {
    let girls = splitByGender(setUp(), NOW);
    girls = assignEventToPool(girls, "bdive", GIRLS_POOL_ID, NOW);
    const boys = setLocalPool(copyOf(girls), BOYS_POOL_ID, NOW);
    const diver = girls.entries.find((e) => e.eventId === "bdive")!;
    girls = saveDiveSheet(girls, "bdive", diver.id, [], NOW);
    const { meet } = mergePoolCopy(girls, boys, NOW);
    expect(Object.keys(meet.diveSheets ?? {})).toEqual([diver.id]);
    // No dive sheets anywhere: none are added.
    const plain = splitByGender(setUp(), NOW);
    expect(
      mergePoolCopy(plain, setLocalPool(copyOf(plain), BOYS_POOL_ID)).meet
        .diveSheets,
    ).toBeUndefined();
  });

  it("matches deck swimmers by member id and birthday", () => {
    const { girls, boys } = twoPools();
    const tweak = (patch: Partial<Meet["athletes"][number]>) => ({
      ...boys,
      athletes: boys.athletes.map((a) =>
        a.firstName === "cal" ? { ...a, ...patch } : a,
      ),
    });
    const cal = girls.athletes.find((a) => a.firstName === "Cal")!;
    const withIds = {
      ...girls,
      athletes: girls.athletes.map((a) =>
        a.id === cal.id
          ? { ...a, usaMemberId: "X1", dateOfBirth: "2010-01-01" }
          : a,
      ),
    };
    expect(
      mergePoolCopy(withIds, tweak({ usaMemberId: "X1" })).report
        .possibleDuplicates,
    ).toHaveLength(1);
    expect(
      mergePoolCopy(withIds, tweak({ usaMemberId: "X2" })).report
        .possibleDuplicates,
    ).toHaveLength(0);
    expect(
      mergePoolCopy(withIds, tweak({ dateOfBirth: "2011-01-01" })).report
        .possibleDuplicates,
    ).toHaveLength(0);
    expect(
      mergePoolCopy(girls, tweak({ teamCode: "BBB" })).report
        .possibleDuplicates,
    ).toHaveLength(0);
    expect(
      mergePoolCopy(girls, tweak({ lastName: "Other" })).report
        .possibleDuplicates,
    ).toHaveLength(0);
  });

  it("refuses copies that can't be merged", () => {
    const { girls, boys } = twoPools();
    expect(() => mergePoolCopy(girls, { ...boys, id: "other" })).toThrow(
      /different meet/,
    );
    expect(() => mergePoolCopy(unsplitMeet(girls), boys)).toThrow(
      /Split the meet/,
    );
    expect(() => mergePoolCopy(girls, girls)).toThrow(
      /Both copies run the Girls pool/,
    );
    const odd: Meet = {
      ...boys,
      split: { ...boys.split!, localPoolId: "deep-end" },
    };
    expect(() => mergePoolCopy(girls, odd)).toThrow(/doesn't have/);
    const sameUnknown: Meet = {
      ...girls,
      split: { ...girls.split!, localPoolId: "x" },
    };
    expect(() =>
      mergePoolCopy(sameUnknown, {
        ...odd,
        split: { ...odd.split!, localPoolId: "x" },
      }),
    ).toThrow(/same pool/);
  });
});
