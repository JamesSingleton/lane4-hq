import { parseMeetFilesFromBytes } from "@lane4hq/swim-formats/meet";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { addCapture, suggestAssignment, verifyHeat } from "../src/adjudicate";
import { addEvent, createMeet, removeEvent } from "../src/create";
import {
  blankDive,
  diveProblems,
  diveResult,
  diveSettings,
  diveSheet,
  isDiveScored,
  isValidAward,
  runningTotal,
  saveDiveSheet,
  scoreCard,
  scoreDive,
  setDiveSettings,
} from "../src/diving";
import { mergeTeamEntries, scratchEntry } from "../src/entries";
import { exportResultsCsv, exportTeamResults } from "../src/export";
import {
  createFinals,
  finalsEventFor,
  finalsPlan,
  seedFinals,
} from "../src/finals";
import { eventTitle, finalLabel, heatLabel, markLabel } from "../src/labels";
import type { Dive, LaneResult, Meet } from "../src/model";
import { buildHeatPublication } from "../src/publish";
import {
  drawDiveOrder,
  heatsForEvent,
  moveEntry,
  seedAllEvents,
  seedEvent,
} from "../src/seeding";
import { eventStandings, teamScores } from "../src/standings";
import { counterIds, NOW } from "./helpers";

function prelimMeet(swimmers = 14): Meet {
  let meet = createMeet(
    { name: "Champs", course: "SCY", poolLanes: 6, scoring: "championship" },
    { newId: () => "meet", now: NOW },
  );
  meet = addEvent(
    meet,
    {
      number: 1,
      distance: 50,
      stroke: "free",
      gender: "female",
      round: "prelim",
    },
    { newId: () => "p1", now: NOW },
  );
  meet = addEvent(
    meet,
    { number: 2, distance: 1, stroke: "dive", gender: "female" },
    { newId: () => "d2", now: NOW },
  );
  meet = mergeTeamEntries(
    meet,
    {
      name: "x",
      course: "SCY",
      events: [],
      results: [],
      entries: [
        ...Array.from({ length: swimmers }, (_, i) => ({
          eventNumber: 1,
          swimmerName: `Swimmer ${String(i).padStart(2, "0")}`,
          seedTime: `${25 + i}.00`,
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          eventNumber: 2,
          swimmerName: `Diver ${i}`,
        })),
      ],
    },
    { code: "AAA", name: "A Aquatics" },
    { newId: counterIds("a"), now: NOW },
  ).meet;
  return seedAllEvents(meet, { random: () => 0 }, NOW);
}

/** Verify every heat of an event; `time` picks each entry's time. */
function swimEvent(
  meet: Meet,
  eventId: string,
  time: (entryId: string, lane: number) => number | null,
): Meet {
  for (const heat of heatsForEvent(meet, eventId)) {
    const results: LaneResult[] = heat.lanes.map(({ lane, entryId }) => {
      const t = time(entryId, lane);
      return {
        entryId,
        eventId,
        heat: heat.number,
        lane,
        status: t == null ? "dq" : "ok",
        timeMs: t,
        source: "manual",
        splitsMs: [],
        backupMs: null,
        buttonsMs: [],
        relayExchangesMs: [],
      };
    });
    meet = verifyHeat(meet, { eventId, heat: heat.number }, results, NOW);
  }
  return meet;
}

/** Prelim time from the swimmer's number: Swimmer 00 is fastest. */
function prelimTime(meet: Meet) {
  return (entryId: string) => {
    const entry = meet.entries.find((e) => e.id === entryId)!;
    const athlete = meet.athletes.find((a) => a.id === entry.athleteId)!;
    return 24_000 + Number(athlete.lastName) * 100;
  };
}

function name(meet: Meet, entryId: string): string {
  const entry = meet.entries.find((e) => e.id === entryId)!;
  return meet.athletes.find((a) => a.id === entry.athleteId)!.lastName;
}

describe("prelims to finals", () => {
  it("refuses until every prelim heat is verified", () => {
    const meet = prelimMeet();
    expect(() => createFinals(meet, "p1")).toThrow(/Verify every prelim/);
    expect(() => createFinals(meet, "d2")).toThrow(/isn't a prelim/);
    expect(() => finalsPlan(meet, "p1", { finalHeats: 4 })).toThrow(
      /1, 2, or 3/,
    );
  });

  it("builds A and B finals, A last, placing by final", () => {
    let meet = prelimMeet();
    meet = swimEvent(meet, "p1", prelimTime(meet));
    const prelims = eventStandings(meet, "p1");
    expect(prelims.every((r) => r.points === 0)).toBe(true);
    expect(prelims[0]!.place).toBe(1);

    const built = createFinals(meet, "p1", {
      finalHeats: 2,
      newId: counterIds("f"),
      now: NOW,
    });
    meet = built.meet;
    const finals = finalsEventFor(meet, "p1")!;
    expect(finals).toMatchObject({
      number: 1,
      round: "final",
      finalHeats: 2,
      prelimEventId: "p1",
    });
    expect(eventTitle(finals)).toBe("Female 50 Freestyle Finals");
    expect(meet.events.map((e) => e.id)).toEqual(["p1", "d2", finals.id]);
    expect(built.plan.alternates.map((r) => name(meet, r.entry.id))).toEqual([
      "12",
      "13",
    ]);

    const heats = heatsForEvent(meet, finals.id);
    expect(heats.map((h) => h.number)).toEqual([1, 2]);
    expect(finalLabel(finals, 2)).toBe("A Final");
    expect(finalLabel(finals, 1)).toBe("B Final");
    expect(finalLabel(finals, 3)).toBeNull();
    expect(finalLabel(meet.events[0]!, 1)).toBeNull();
    expect(heatLabel(finals, 1, { short: true })).toBe("B Final");
    expect(heatLabel(meet.events[0]!, 3)).toBe("Heat 3");
    expect(heatLabel(meet.events[0]!, 3, { short: true })).toBe("H3");
    // Fastest prelim swimmer in the center lane of the A final.
    const a = heats[1]!;
    expect(name(meet, a.lanes.find((l) => l.lane === 3)!.entryId)).toBe("00");
    expect(a.lanes.map((l) => name(meet, l.entryId)).sort()).toEqual([
      "00",
      "01",
      "02",
      "03",
      "04",
      "05",
    ]);
    const seeds = meet.entries.filter((e) => e.eventId === finals.id);
    expect(seeds.every((e) => e.sourceEntryId && e.seedTimeMs)).toBe(true);

    // The B final winner swims faster than the A final, but still places 7th.
    meet = swimEvent(meet, finals.id, (entryId) => {
      const n = Number(name(meet, entryId));
      if (n === 1) return null;
      return n >= 6 ? 20_000 + n * 10 : 23_000 + n * 10;
    });
    const standings = eventStandings(meet, finals.id);
    const placeOf = (n: string) =>
      standings.find((r) => name(meet, r.entry.id) === n)!;
    expect(placeOf("00").place).toBe(1);
    expect(placeOf("05").place).toBe(5);
    expect(placeOf("01").place).toBeNull();
    expect(placeOf("06").place).toBe(7);
    expect(placeOf("06").points).toBe(12);
    expect(placeOf("11").place).toBe(12);
    expect(teamScores(meet)[0]!.points).toBeGreaterThan(0);

    expect(() => createFinals(meet, "p1")).toThrow(/already have results/);
    expect(() => seedEvent(built.meet, finals.id)).toThrow(/prelim results/);
    expect(() => removeEvent(meet, "p1")).toThrow(/results/);
  });

  it("refills a scratched finalist from the alternates", () => {
    let meet = prelimMeet();
    meet = swimEvent(meet, "p1", prelimTime(meet));
    meet = createFinals(meet, "p1", { newId: counterIds("f") }).meet;
    const finals = finalsEventFor(meet, "p1")!;
    const top = meet.entries.find(
      (e) => e.eventId === finals.id && name(meet, e.id) === "00",
    )!;
    const keptId = meet.entries.find(
      (e) => e.eventId === finals.id && name(meet, e.id) === "01",
    )!.id;
    meet = scratchEntry(meet, top.id, true, NOW);
    meet = createFinals(meet, "p1", { newId: counterIds("g") }).meet;
    const lineup = heatsForEvent(meet, finals.id)[0]!.lanes.map((l) =>
      name(meet, l.entryId),
    );
    expect(lineup.sort()).toEqual(["01", "02", "03", "04", "05", "06"]);
    expect(meet.entries.some((e) => e.id === keptId)).toBe(true);
    expect(meet.entries.find((e) => e.id === top.id)?.scratched).toBe(true);
    expect(() => removeEvent({ ...meet, results: [] }, "p1")).toThrow(
      /finals first/,
    );
  });

  it("stops for a swim-off at the last spot", () => {
    let meet = prelimMeet();
    const time = prelimTime(meet);
    meet = swimEvent(meet, "p1", (id) => {
      const n = Number(name(meet, id));
      return n === 5 || n === 6 ? 24_555 : time(id);
    });
    const plan = finalsPlan(meet, "p1");
    expect(plan.qualifiers).toHaveLength(5);
    expect(plan.swimOff.map((r) => name(meet, r.entry.id)).sort()).toEqual([
      "05",
      "06",
    ]);
    expect(() => createFinals(meet, "p1")).toThrow(/swim-off/);
    const loser = plan.swimOff.find((r) => name(meet, r.entry.id) === "06")!;
    const resolved = createFinals(meet, "p1", { exclude: [loser.entry.id] });
    expect(resolved.plan.qualifiers).toHaveLength(6);
  });

  it("refuses a final no one finished", () => {
    let meet = prelimMeet(3);
    meet = swimEvent(meet, "p1", () => null);
    expect(() => createFinals(meet, "p1")).toThrow(/No one finished/);
  });

  it("routes a titled race to the round still being swum", () => {
    let meet = prelimMeet();
    meet = swimEvent(meet, "p1", prelimTime(meet));
    meet = createFinals(meet, "p1", { finalHeats: 2 }).meet;
    const finals = finalsEventFor(meet, "p1")!;
    expect(suggestAssignment(meet, { event: 1, heat: 2 })).toEqual({
      eventId: finals.id,
      heat: 2,
    });
    expect(suggestAssignment(meet, { event: 1, heat: 9 })).toEqual({
      eventId: "p1",
      heat: 9,
    });
  });

  it("exports prelim and finals results under one HY3 event", () => {
    let meet = prelimMeet();
    meet = swimEvent(meet, "p1", prelimTime(meet));
    meet = createFinals(meet, "p1").meet;
    const finals = finalsEventFor(meet, "p1")!;
    meet = swimEvent(meet, finals.id, (id) => 23_000 + Number(name(meet, id)));
    const zip = unzipSync(exportTeamResults(meet, "AAA").bytes);
    const [filename, bytes] = Object.entries(zip)[0]!;
    const reparsed = parseMeetFilesFromBytes([{ filename, bytes }]);
    expect(reparsed.events.filter((e) => e.eventNumber === 1)).toHaveLength(1);
    const swimmer = reparsed.results.filter((r) =>
      r.swimmerName.includes("00"),
    );
    expect(swimmer.map((r) => r.resultType).sort()).toEqual([
      "finals",
      "prelim",
    ]);
    const pub = buildHeatPublication(meet, finals.id, 1);
    expect(pub.idempotencyKey).toBe("meet:1F:1:r1");
    expect(pub.event.round).toBe("final");
    expect(buildHeatPublication(meet, "p1", 1).idempotencyKey).toBe(
      "meet:1P:1:r1",
    );
  });

  it("merges relay finals into the prelim relay", () => {
    let meet = createMeet(
      { name: "Relays", course: "SCY", poolLanes: 6 },
      { newId: () => "meet", now: NOW },
    );
    meet = addEvent(
      meet,
      {
        number: 1,
        distance: 200,
        stroke: "free_relay",
        gender: "female",
        round: "prelim",
      },
      { newId: () => "r1" },
    );
    meet = mergeTeamEntries(
      meet,
      {
        name: "x",
        course: "SCY",
        events: [],
        entries: [],
        results: [],
        relays: ["A", "B"].map((letter, i) => ({
          eventNumber: 1,
          teamCode: "AAA",
          relayLetter: letter,
          seedTime: `1:4${i}.00`,
          swimmerNames: ["Ann One", "Bea Two", "Cat Three", "Dee Four"],
        })),
      },
      { code: "AAA", name: "A Aquatics" },
      { newId: counterIds("x") },
    ).meet;
    meet = seedAllEvents(meet);
    meet = swimEvent(meet, "r1", (_, lane) => 100_000 + lane * 100);
    meet = createFinals(meet, "r1").meet;
    const finals = finalsEventFor(meet, "r1")!;
    meet = swimEvent(meet, finals.id, (_, lane) => 99_000 + lane * 100);
    const parsed = exportTeamResults(meet, "AAA");
    const zip = unzipSync(parsed.bytes);
    const [filename, bytes] = Object.entries(zip)[0]!;
    const reparsed = parseMeetFilesFromBytes([{ filename, bytes }]);
    expect(reparsed.relays).toHaveLength(2);
    expect(reparsed.relays![0]!.results).toHaveLength(2);
  });
});

describe("diving", () => {
  const dive = (awards: number[], dd = 1.5, extra: Partial<Dive> = {}) => ({
    code: "103",
    position: "B" as const,
    dd,
    awards,
    ...extra,
  });

  it("scores three, five, and seven judge panels", () => {
    expect(scoreDive(dive([6, 6.5, 7]), 3)).toBe(29.25);
    // Five judges: drop the 8 and the 4.
    expect(scoreDive(dive([4, 6, 6.5, 7, 8], 2.0), 5)).toBe(39);
    // Seven judges: drop two high, two low.
    expect(scoreDive(dive([3, 4, 6, 6, 6, 9, 10], 2.2), 7)).toBe(39.6);
    expect(scoreDive(dive([6, 6, 6], 1.5, { failed: true }), 3)).toBe(0);
    // Balk: two off each award.
    expect(scoreDive(dive([6, 1, 7], 1.0, { balk: true }), 3)).toBe(9);
    expect(() => scoreDive(dive([6, 6]), 3)).toThrow(/3 awards/);
    expect(() => scoreDive(dive([6, 6, 6.3]), 3)).toThrow(/half points/);
    expect(isValidAward(10.5)).toBe(false);
    expect(diveProblems(dive([6, 6, 6], 0, { code: " " }), 3)).toHaveLength(2);
    expect(scoreCard([dive([5, 5, 5]), dive([6, 6, 6])], 3).total).toBe(49.5);
    expect(blankDive(5).awards).toHaveLength(5);
  });

  it("draws an order, scores cards, and ranks by total", () => {
    let meet = prelimMeet();
    expect(diveSettings(meet, "d2")).toEqual({ diveCount: 6, diveJudges: 3 });
    expect(() => diveSettings(meet, "p1")).toThrow(/diving/);
    meet = setDiveSettings(meet, "d2", { diveCount: 2, diveJudges: 3 }, NOW);
    expect(() => setDiveSettings(meet, "d2", { diveJudges: 4 as 3 })).toThrow(
      /3, 5, or 7/,
    );
    expect(() => setDiveSettings(meet, "d2", { diveCount: 12 })).toThrow(
      /1–11/,
    );

    meet = drawDiveOrder(meet, "d2", () => 0.5, NOW);
    const flight = heatsForEvent(meet, "d2");
    expect(flight).toHaveLength(1);
    expect(flight[0]!.lanes.map((l) => l.lane)).toEqual([1, 2, 3, 4]);
    expect(() => drawDiveOrder(meet, "p1")).toThrow(/diving/);
    const moved = moveEntry(meet, flight[0]!.lanes[0]!.entryId, {
      heat: 1,
      lane: 4,
    });
    expect(heatsForEvent(moved, "d2")[0]!.lanes).toHaveLength(4);
    expect(() =>
      moveEntry(meet, flight[0]!.lanes[0]!.entryId, { heat: 1, lane: 5 }),
    ).toThrow(/Dive order/);

    const cards = [
      [dive([5, 5, 5]), dive([5, 5, 5])],
      [dive([7, 7, 7]), dive([7, 7, 7])],
      [dive([5, 5, 5]), dive([5, 5, 5])],
    ];
    const results = flight[0]!.lanes.map(({ lane, entryId }, i) =>
      diveResult(
        meet,
        { eventId: "d2", heat: 1, lane, entryId },
        cards[i] ?? [],
        i < 3 ? "ok" : "ns",
      ),
    );
    expect(() =>
      diveResult(meet, { eventId: "d2", heat: 1, lane: 1, entryId: "x" }, [
        dive([5, 5, 5]),
      ]),
    ).toThrow(/all 2 dives/);
    meet = verifyHeat(meet, { eventId: "d2", heat: 1 }, results, NOW);
    const standings = eventStandings(meet, "d2");
    expect(standings.map((r) => r.place)).toEqual([1, 2, 2, null]);
    expect(standings[0]!.result.dive!.total).toBe(63);
    expect(markLabel(standings[0]!.result)).toBe("63.00");
    expect(standings[1]!.points).toBe((17 + 16) / 2);
    expect(() => setDiveSettings(meet, "d2", { diveCount: 3 })).toThrow(
      /scores/,
    );
    expect(() => drawDiveOrder(meet, "d2")).toThrow(/order is fixed/);
    expect(seedEvent(prelimMeet(), "d2").heats.length).toBeGreaterThan(0);

    const csv = strFromU8(exportResultsCsv(meet).bytes);
    expect(csv).toContain("63.00");
    expect(csv).toContain("Female Diving (2 dives)");
    expect(buildHeatPublication(meet, "d2", 1).lanes[0]!.dive).toBeDefined();
  });

  it("keeps dive sheets and running totals between rounds", () => {
    let meet = prelimMeet();
    const diver = meet.entries.find((e) => e.eventId === "d2")!.id;
    expect(diveSheet(meet, "d2", diver)).toHaveLength(6);
    meet = saveDiveSheet(
      meet,
      "d2",
      diver,
      [dive([6, 6, 6]), dive([0, 0, 0]), dive([0, 0, 0], 2, { failed: true })],
      NOW,
    );
    const sheet = diveSheet(meet, "d2", diver);
    expect(sheet[0]!.awards).toEqual([6, 6, 6]);
    expect(sheet[3]!.code).toBe("");
    expect(isDiveScored(sheet[1]!, 3)).toBe(false);
    expect(isDiveScored(sheet[2]!, 3)).toBe(true);
    expect(runningTotal(sheet, 3)).toBe(27);
    meet = setDiveSettings(meet, "d2", { diveJudges: 5 });
    expect(diveSheet(meet, "d2", diver)[0]!.awards).toEqual([6, 6, 6, 0, 0]);
    expect(() =>
      saveDiveSheet(meet, "d2", diver, new Array(7).fill(dive([1, 1, 1]))),
    ).toThrow(/6 dives/);
  });

  it("keeps auto-follow on swim events", () => {
    const meet = prelimMeet();
    const { capture } = addCapture(meet, {
      race: {
        event: 0,
        heat: 0,
      } as never,
      raw: new Uint8Array([1]),
    });
    expect(capture.assignment?.eventId).toBe("p1");
    expect(seedFinals("x", [], 6)).toEqual([]);
  });
});
