import type { ParsedMeet } from "@lane4hq/swim-formats";
import type { TimerRace } from "@lane4hq/timing-cts/race";
import { describe, expect, it } from "vitest";
import {
  addCapture,
  assignCapture,
  ignoreCapture,
  nextHeat,
  reviewCapture,
  suggestAssignment,
  verifyHeat,
} from "../src/adjudicate";
import {
  addEvent,
  createMeet,
  createMeetFromEventFile,
  removeEvent,
} from "../src/create";
import { diveProblems, diveSettings } from "../src/diving";
import {
  addIndividualEntry,
  detectTeam,
  mergeTeamEntries,
} from "../src/entries";
import { genderPairs, swapGenderOrder } from "../src/event-edits";
import { teamResultsMeet } from "../src/export";
import { finalLabel, indexMeet } from "../src/labels";
import type { Entry, LaneResult, Meet, MeetEvent } from "../src/model";
import { publishQueue } from "../src/publish";
import {
  compareSeeds,
  laneOrder,
  seedAllEvents,
  seedEntries,
  seedEvent,
} from "../src/seeding";
import { eventStandings, teamScores } from "../src/standings";
import { nextEventNumber, removeEvents } from "../src/templates";
import { counterIds, NOW } from "./helpers";

function parsed(partial: Partial<ParsedMeet> = {}): ParsedMeet {
  return {
    name: "x",
    course: "SCY",
    events: [],
    entries: [],
    results: [],
    ...partial,
  };
}

function meet(): Meet {
  return createMeet(
    { name: "Edges", course: "SCY", poolLanes: 6, startDate: "2026-10-25" },
    { newId: counterIds("edge"), now: NOW },
  );
}

function result(
  entryId: string,
  eventId: string,
  patch: Partial<LaneResult> = {},
): LaneResult {
  return {
    entryId,
    eventId,
    heat: 1,
    lane: 1,
    status: "ok",
    timeMs: 30_000,
    source: "manual",
    splitsMs: [],
    backupMs: null,
    buttonsMs: [],
    relayExchangesMs: [],
    ...patch,
  };
}

const DATE = {
  year: 2026,
  month: 10,
  day: 25,
  hours: 9,
  minutes: 0,
  seconds: 0,
  weekday: 0,
};

function timerRace(patch: Partial<TimerRace> = {}): TimerRace {
  return {
    event: 0,
    heat: 0,
    raceNumber: 1,
    date: DATE,
    raceLengths: 2,
    lanesInPool: 6,
    numTimesPerLane: 2,
    numberOfButtons: 1,
    includes: {
      backup: false,
      splits: false,
      individualButtons: false,
      relayJudging: false,
    },
    lanes: [],
    ...patch,
  };
}

describe("meet-engine edges", () => {
  it("builds a meet from an event file, skipping blanks and duplicates", () => {
    const built = createMeetFromEventFile(
      parsed({
        name: "From file",
        events: [
          {
            stroke: "free",
            distance: 50,
            gender: "female",
            eventKey: "blank",
          },
          {
            eventNumber: 1,
            stroke: "free",
            distance: 50,
            gender: "female",
            eventKey: "prelim",
            roundType: "prelim",
          },
          {
            eventNumber: 1,
            stroke: "back",
            distance: 100,
            gender: "male",
            eventKey: "dup",
          },
          {
            eventNumber: 2,
            stroke: "dive",
            distance: 1,
            gender: "female",
            eventKey: "dive",
            eventKind: "dive",
          },
        ],
      }),
    );
    expect(built.events.map((e) => [e.number, e.round, e.kind])).toEqual([
      [1, "prelim", "swim"],
      [2, "timed_final", "dive"],
    ]);
    expect(built.events[1]).toMatchObject({ diveCount: 6, diveJudges: 3 });
    expect(built.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("removes an event's entries and heats with it", () => {
    let next = addEvent(
      meet(),
      { number: 1, distance: 50, stroke: "free", gender: "female" },
      { newId: () => "ev", now: NOW },
    );
    next = addIndividualEntry(
      next,
      {
        eventId: "ev",
        teamCode: "AAA",
        firstName: "Ann",
        lastName: "Lee",
      },
      { now: NOW },
    );
    next = seedEvent(next, "ev", {}, NOW);
    expect(next.heats).toHaveLength(1);
    next = removeEvent(next, "ev", NOW);
    expect(next.events).toEqual([]);
    expect(next.entries).toEqual([]);
    expect(next.heats).toEqual([]);
  });

  it("fills missing dive settings and ignores awards on a failed dive", () => {
    let next = addEvent(
      meet(),
      { number: 1, distance: 1, stroke: "dive", gender: "female" },
      { newId: () => "d", now: NOW },
    );
    const event = next.events[0]!;
    next = {
      ...next,
      events: [{ ...event, diveCount: undefined, diveJudges: undefined }],
    };
    expect(diveSettings(next, "d")).toEqual({ diveCount: 6, diveJudges: 3 });
    expect(
      diveProblems(
        { code: "101", position: "A", dd: 1.4, awards: [], failed: true },
        3,
      ),
    ).toEqual([]);
  });

  it("detects a team from results and merges around other teams", () => {
    expect(
      detectTeam(
        parsed({
          results: [
            { swimmerName: "No code", time: "30.00" },
            { swimmerName: "Ada", time: "31.00", teamCode: "cros" },
          ],
        }),
        "notes.txt",
      ).code,
    ).toBe("CROS");

    let next = addEvent(
      meet(),
      { number: 1, distance: 50, stroke: "free", gender: "female" },
      { newId: () => "ev", now: NOW },
    );
    const bbb = mergeTeamEntries(
      next,
      parsed({
        entries: [
          { eventNumber: 1, swimmerName: "Bea Bee", seedTime: "31.00" },
        ],
      }),
      { code: "BBB", name: "Bees" },
      { newId: counterIds("b"), now: NOW },
    ).meet;
    const bee = bbb.entries[0]!;
    next = {
      ...bbb,
      heats: [
        { eventId: "ev", number: 1, lanes: [{ lane: 3, entryId: bee.id }] },
      ],
    };
    const first = mergeTeamEntries(
      next,
      parsed({
        entries: [
          { swimmerName: "No event", seedTime: "30.00" },
          { eventNumber: 1, swimmerName: "Ann Lee", seedTime: "0.00" },
        ],
      }),
      { code: "AAA", name: "Ants" },
      { newId: counterIds("a"), now: NOW },
    );
    expect(first.summary.skipped.map((s) => s.name)).toContain("No event");
    expect(
      first.meet.entries.find((e) => e.teamCode === "AAA")!.seedTimeMs,
    ).toBeNull();
    expect(first.meet.heats[0]!.lanes).toEqual([{ lane: 3, entryId: bee.id }]);
    expect(first.meet.teams.map((t) => t.code)).toEqual(["AAA", "BBB"]);

    const ant = first.meet.entries.find((e) => e.teamCode === "AAA")!;
    const seeded = {
      ...first.meet,
      heats: [
        ...first.meet.heats,
        { eventId: "ev", number: 2, lanes: [{ lane: 4, entryId: ant.id }] },
      ],
    };
    const again = mergeTeamEntries(
      seeded,
      parsed({
        entries: [
          { eventNumber: 1, swimmerName: "Cara Cole", seedTime: "32.00" },
        ],
      }),
      { code: "AAA", name: "Ants Updated" },
      { newId: counterIds("c"), now: NOW },
    );
    expect(again.meet.heats.find((h) => h.number === 2)!.lanes).toEqual([]);
    expect(again.meet.teams.find((t) => t.code === "AAA")!.name).toBe(
      "Ants Updated",
    );
  });

  it("follows heats across a dive and leaves unknown captures alone", () => {
    let next = meet();
    next = addEvent(
      next,
      { number: 1, distance: 1, stroke: "dive", gender: "female" },
      { newId: () => "dive", now: NOW },
    );
    next = addEvent(
      next,
      { number: 2, distance: 50, stroke: "free", gender: "female" },
      { newId: () => "swim", now: NOW },
    );
    next = mergeTeamEntries(
      next,
      parsed({
        entries: Array.from({ length: 8 }, (_, i) => ({
          eventNumber: 2,
          swimmerName: `Swimmer ${i}`,
          seedTime: `${30 + i}.00`,
        })),
      }),
      { code: "AAA", name: "Ants" },
      { newId: counterIds("s"), now: NOW },
    ).meet;
    next = seedEvent(next, "swim", {}, NOW);
    expect(suggestAssignment(next, { event: 0, heat: 0 })).toEqual({
      eventId: "swim",
      heat: 1,
    });
    expect(nextHeat(next, { eventId: "swim", heat: 1 })).toEqual({
      eventId: "swim",
      heat: 2,
    });
    const kept = next.entries.filter((e) => e.eventId === "swim").slice(0, 2);

    next = addEvent(
      next,
      { number: 3, distance: 1, stroke: "dive", gender: "male" },
      { newId: () => "between", now: NOW },
    );
    next = addEvent(
      next,
      { number: 4, distance: 100, stroke: "fly", gender: "female" },
      { newId: () => "later", now: NOW },
    );
    next = mergeTeamEntries(
      next,
      parsed({
        entries: Array.from({ length: 8 }, (_, i) => ({
          eventNumber: 4,
          swimmerName: `Fay ${i}`,
          seedTime: `${50 + i}.00`,
        })),
      }),
      { code: "AAA", name: "Ants" },
      { newId: counterIds("f"), now: NOW },
    ).meet;
    next = seedEvent(next, "later", {}, NOW);
    expect(nextHeat(next, { eventId: "swim", heat: 2 })).toEqual({
      eventId: "later",
      heat: 1,
    });

    const bare = addCapture(
      {
        ...next,
        entries: [...next.entries, ...kept],
        heats: [
          ...next.heats.filter((h) => h.eventId !== "swim"),
          {
            eventId: "swim",
            number: 1,
            lanes: kept.map((e, i) => ({ lane: i + 1, entryId: e.id })),
          },
        ],
      },
      { race: timerRace(), raw: Uint8Array.of(1) },
      { newId: () => "c1", now: NOW },
    );
    const second = addCapture(
      bare.meet,
      { race: timerRace({ raceNumber: 2 }), raw: Uint8Array.of(2) },
      { newId: () => "c2", now: NOW },
    );
    let reviewed = assignCapture(
      second.meet,
      "c1",
      { eventId: "swim", heat: 9 },
      NOW,
    );
    reviewed = ignoreCapture(reviewed, "missing", NOW);
    const capture = reviewed.captures.find((c) => c.id === "c1")!;
    capture.race = timerRace({
      layoutWarning: "short record",
      lanes: [
        {
          lane: 1,
          place: 1,
          status: "finished",
          finalMs: 30_000,
          splitsMs: [15_000, 30_000],
          buttonsMs: [30_100],
          backupMs: 30_100,
          relayExchangesMs: [10],
        },
      ],
    });
    const review = reviewCapture(reviewed, {
      ...capture,
      assignment: { eventId: "swim", heat: 1 },
    });
    expect(review.warnings).toContain("short record");
    expect(review.lanes.find((l) => l.lane === 2)!.timer).toBeNull();
    expect(review.lanes.find((l) => l.lane === 3)!.flags).toEqual([]);
    const unseeded = reviewCapture(reviewed, {
      ...capture,
      assignment: { eventId: "swim", heat: 99 },
    });
    expect(unseeded.lanes.every((l) => l.entryId == null)).toBe(true);
  });

  it("exports a finals relay with no place and an entry with no athlete", () => {
    let next = meet();
    next = addEvent(
      next,
      {
        number: 1,
        distance: 200,
        stroke: "free_relay",
        gender: "female",
        round: "prelim",
      },
      { newId: () => "pre", now: NOW },
    );
    next = addEvent(
      next,
      {
        number: 1,
        distance: 200,
        stroke: "free_relay",
        gender: "female",
        round: "final",
      },
      { newId: () => "fin", now: NOW },
    );
    next = addEvent(
      next,
      { number: 2, distance: 50, stroke: "free", gender: "female" },
      { newId: () => "ind", now: NOW },
    );
    next = {
      ...next,
      teams: [{ code: "AAA", name: "Ants" }],
      entries: [
        {
          id: "relay-pre",
          eventId: "pre",
          teamCode: "AAA",
          seedTimeMs: null,
          exhibition: false,
          scratched: false,
          relay: { letter: "A", legAthleteIds: [] },
        },
        {
          id: "relay-ns",
          eventId: "fin",
          teamCode: "AAA",
          seedTimeMs: null,
          exhibition: false,
          scratched: false,
          sourceEntryId: "relay-pre",
          relay: { letter: "A", legAthleteIds: [] },
        },
        {
          id: "relay-dq",
          eventId: "fin",
          teamCode: "AAA",
          seedTimeMs: null,
          exhibition: false,
          scratched: false,
          sourceEntryId: "relay-pre",
          relay: { letter: "B", legAthleteIds: [] },
        },
        {
          id: "ghost",
          eventId: "ind",
          teamCode: "AAA",
          seedTimeMs: null,
          exhibition: false,
          scratched: false,
        },
      ],
      results: [
        result("relay-dq", "fin", { status: "dq", timeMs: null, lane: 4 }),
      ],
    };
    const exported = teamResultsMeet(next, "AAA");
    const relay = exported.relays?.find((r) => r.relayLetter === "A");
    expect(relay?.results).toHaveLength(1);
    expect(relay?.results?.[0]?.place).toBeUndefined();
    expect(exported.entries).toEqual([]);
  });

  it("labels a final with the default heat count and an unknown relay team", () => {
    const event = {
      id: "f",
      number: 1,
      distance: 50,
      stroke: "free",
      gender: "female",
      isRelay: false,
      kind: "swim",
      round: "final",
    } satisfies MeetEvent;
    expect(finalLabel(event, 1)).toBe("A Final");
    const labeled = indexMeet(meet()).entryLabel({
      id: "r",
      eventId: "f",
      teamCode: "NOPE",
      seedTimeMs: null,
      exhibition: false,
      scratched: false,
      relay: { letter: "C", legAthleteIds: [] },
    });
    expect(labeled).toBe("NOPE C");
  });

  it("queues heats in meet order and by heat within an event", () => {
    let next = meet();
    next = addEvent(
      next,
      { number: 1, distance: 50, stroke: "free", gender: "female" },
      { newId: () => "a", now: NOW },
    );
    next = addEvent(
      next,
      { number: 2, distance: 100, stroke: "back", gender: "male" },
      { newId: () => "b", now: NOW },
    );
    next = mergeTeamEntries(
      next,
      parsed({
        entries: Array.from({ length: 8 }, (_, i) => ({
          eventNumber: 1,
          swimmerName: `A ${i}`,
          seedTime: `${30 + i}.00`,
        })),
      }),
      { code: "AAA", name: "Ants" },
      { newId: counterIds("qa"), now: NOW },
    ).meet;
    next = mergeTeamEntries(
      next,
      parsed({
        entries: [{ eventNumber: 2, swimmerName: "Bo", seedTime: "60.00" }],
      }),
      { code: "BBB", name: "Bees" },
      { newId: counterIds("qb"), now: NOW },
    ).meet;
    next = seedEvent(next, "a", {}, NOW);
    next = seedEvent(next, "b", {}, NOW);
    next = verifyHeat(next, { eventId: "a", heat: 2 }, [], NOW);
    next = verifyHeat(next, { eventId: "a", heat: 1 }, [], NOW);
    next = verifyHeat(next, { eventId: "b", heat: 1 }, [], NOW);
    expect(publishQueue(next).map((q) => `${q.eventId}#${q.heat}`)).toEqual([
      "a#1",
      "a#2",
      "b#1",
    ]);
  });

  it("seeds straight through when circle seeding is omitted", () => {
    const entry = {
      id: "e",
      eventId: "ev",
      teamCode: "AAA",
      seedTimeMs: 30_000,
      exhibition: false,
      scratched: false,
    } satisfies Entry;
    const open = { ...entry, id: "nt", seedTimeMs: null };
    expect(compareSeeds(entry, open)).toBe(-1);
    expect(laneOrder(2)).toEqual([1, 2]);
    expect(seedEntries("ev", [entry, open], { lanes: 6 })).toHaveLength(1);
  });

  it("skips finals and events that already have results", () => {
    let next = meet();
    next = addEvent(
      next,
      { number: 1, distance: 50, stroke: "free", gender: "female" },
      { newId: () => "open", now: NOW },
    );
    next = addEvent(
      next,
      {
        number: 1,
        distance: 50,
        stroke: "free",
        gender: "female",
        round: "final",
      },
      { newId: () => "final", now: NOW },
    );
    next = addEvent(
      next,
      { number: 2, distance: 100, stroke: "back", gender: "male" },
      { newId: () => "done", now: NOW },
    );
    next = addIndividualEntry(
      next,
      { eventId: "open", teamCode: "AAA", firstName: "Ann", lastName: "Lee" },
      { newId: () => "ann", now: NOW },
    );
    next = {
      ...next,
      results: [result("someone", "done")],
    };
    next = seedAllEvents(next, {}, NOW);
    expect(next.heats.map((h) => h.eventId)).toEqual(["open"]);
  });

  it("ranks a dive with no total, an exhibition swim, and a team that is not on the list", () => {
    let next = meet();
    next = addEvent(
      next,
      { number: 1, distance: 1, stroke: "dive", gender: "female" },
      { newId: () => "dive", now: NOW },
    );
    next = addEvent(
      next,
      { number: 2, distance: 50, stroke: "free", gender: "female" },
      { newId: () => "swim", now: NOW },
    );
    const divers: Entry[] = ["d1", "d2"].map((id) => ({
      id,
      eventId: "dive",
      teamCode: id === "d1" ? "AAA" : "ZZZ",
      seedTimeMs: null,
      exhibition: false,
      scratched: false,
    }));
    const swimmers: Entry[] = [
      {
        id: "fast",
        eventId: "swim",
        teamCode: "AAA",
        seedTimeMs: null,
        exhibition: false,
        scratched: false,
      },
      {
        id: "ex",
        eventId: "swim",
        teamCode: "BBB",
        seedTimeMs: null,
        exhibition: true,
        scratched: false,
      },
    ];
    next = {
      ...next,
      teams: [
        { code: "AAA", name: "Ants" },
        { code: "BBB", name: "Bees" },
      ],
      entries: [...divers, ...swimmers],
      results: [
        result("d1", "dive", { timeMs: null, dive: { dives: [], total: 200 } }),
        result("d2", "dive", { timeMs: null, lane: 2 }),
        result("fast", "swim", { timeMs: 25_000 }),
        result("ex", "swim", { timeMs: 24_000, lane: 2 }),
      ],
    };
    expect(eventStandings(next, "dive").map((r) => r.entry.id)).toEqual([
      "d1",
      "d2",
    ]);
    expect(eventStandings(next, "swim").map((r) => r.entry.id)).toEqual([
      "fast",
      "ex",
    ]);
    const scores = teamScores(next);
    expect(scores.find((s) => s.teamCode === "ZZZ")!.points).toBeGreaterThan(0);
    expect(scores[0]!.points).toBeGreaterThanOrEqual(scores[1]!.points);

    const tied = {
      ...meet(),
      teams: [
        { code: "MMM", name: "M" },
        { code: "AAA", name: "A" },
      ],
      events: next.events.filter((e) => e.id === "swim"),
      entries: [
        {
          id: "t1",
          eventId: "swim",
          teamCode: "MMM",
          seedTimeMs: null,
          exhibition: false,
          scratched: false,
        },
        {
          id: "t2",
          eventId: "swim",
          teamCode: "AAA",
          seedTimeMs: null,
          exhibition: false,
          scratched: false,
        },
      ],
      results: [
        result("t1", "swim", { timeMs: 30_000, lane: 1 }),
        result("t2", "swim", { timeMs: 30_000, lane: 2 }),
      ],
    };
    expect(teamScores(tied).map((s) => s.teamCode)).toEqual(["AAA", "MMM"]);
  });

  it("swaps only paired events and removes finals before their prelims", () => {
    let next = meet();
    next = addEvent(
      next,
      { number: 1, distance: 50, stroke: "free", gender: "female" },
      { newId: () => "f", now: NOW },
    );
    next = addEvent(
      next,
      { number: 2, distance: 50, stroke: "free", gender: "male" },
      { newId: () => "m", now: NOW },
    );
    next = addEvent(
      next,
      { number: 3, distance: 50, stroke: "free", gender: "mixed" },
      { newId: () => "x", now: NOW },
    );
    next = addEvent(
      next,
      {
        number: 1,
        distance: 50,
        stroke: "free",
        gender: "female",
        round: "final",
      },
      { newId: () => "ff", now: NOW },
    );
    next = addEvent(
      next,
      {
        number: 2,
        distance: 50,
        stroke: "free",
        gender: "male",
        round: "final",
      },
      { newId: () => "mf", now: NOW },
    );
    expect(genderPairs(next)).toHaveLength(1);
    const swapped = swapGenderOrder(next, NOW);
    expect(swapped.events.find((e) => e.id === "x")!.number).toBe(3);
    expect(nextEventNumber(swapped)).toBe(4);
    const removed = removeEvents(next, ["f", "ff", "mf"], NOW);
    expect(removed.events.map((e) => e.id).sort()).toEqual(["m", "x"]);
  });
});
