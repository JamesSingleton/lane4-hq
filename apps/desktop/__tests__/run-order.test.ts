import type { HeatReview } from "@lane4hq/meet-engine/adjudicate";
import { addEvent, createMeet } from "@lane4hq/meet-engine/create";
import { addIndividualEntry } from "@lane4hq/meet-engine/entries";
import type {
  LaneResult,
  Meet,
  TimerCapture,
} from "@lane4hq/meet-engine/model";
import { seedEvent } from "@lane4hq/meet-engine/seeding";
import { describe, expect, it } from "vitest";
import {
  canVerify,
  firstOpenHeat,
  heatCaptures,
  initialResults,
  nextWaitingRace,
  runOrder,
  scoreboard,
  stepHeat,
  withEveryLane,
} from "../src/lib/run-order";

const NOW = new Date(2026, 10, 5, 9, 0, 0);

function lane(eventId: string, entryId: string, n: number): LaneResult {
  return {
    entryId,
    eventId,
    heat: 1,
    lane: n,
    status: "ok",
    timeMs: 60_000 + n,
    source: "pad",
    splitsMs: [],
    backupMs: null,
    buttonsMs: [],
    relayExchangesMs: [],
  };
}

function capture(
  id: string,
  state: TimerCapture["state"],
  assignment: TimerCapture["assignment"],
): TimerCapture {
  return {
    id,
    capturedAt: NOW.toISOString(),
    rawHex: "",
    state,
    assignment,
    race: {} as TimerCapture["race"],
  };
}

function twoEvents(genders: Array<"female" | "male"> = ["female", "male"]) {
  let n = 0;
  const at = { newId: () => `id-${++n}`, now: NOW };
  let meet = createMeet({ name: "Dual", course: "SCY", poolLanes: 6 }, at);
  genders.forEach((gender, i) => {
    meet = addEvent(
      meet,
      { number: i + 1, distance: 100, stroke: "free", gender },
      at,
    );
  });
  for (const event of meet.events) {
    for (let i = 0; i < 8; i++) {
      meet = addIndividualEntry(
        meet,
        {
          eventId: event.id,
          teamCode: i % 2 ? "AAA" : "BBB",
          firstName: `S${i}`,
          lastName: event.id,
          seedTimeMs: 60_000 + i * 100,
        },
        at,
      );
    }
    meet = seedEvent(meet, event.id, {}, NOW);
  }
  return meet;
}

const verifiedHeat = (meet: Meet, eventId: string, heat: number): Meet => ({
  ...meet,
  heatRecords: {
    ...meet.heatRecords,
    [`${eventId}#${heat}`]: {} as Meet["heatRecords"][string],
  },
});

describe("run order", () => {
  it("lists seeded events with each heat's state", () => {
    const meet = twoEvents();
    const [first, second] = meet.events;
    const race = { eventId: second!.id, heat: 1 };
    const withRace = {
      ...meet,
      captures: [capture("c1", "new", race)],
    };
    const order = runOrder(withRace);
    expect(order).toHaveLength(2);
    expect(order[0]?.event.id).toBe(first!.id);
    expect(order[0]?.heats.every((h) => h.state === "waiting")).toBe(true);
    expect(order[1]?.heats[0]?.state).toBe("ready");
  });

  it("skips events with no heats", () => {
    const empty = createMeet({ name: "Empty", course: "SCY" }, { now: NOW });
    const meet = addEvent(
      empty,
      { number: 1, distance: 50, stroke: "free", gender: "male" },
      { now: NOW },
    );
    expect(runOrder(meet)).toEqual([]);
    expect(firstOpenHeat(meet)).toBeNull();
  });

  it("shows only this computer's pool in a split meet", () => {
    const meet = twoEvents();
    const split: Meet = {
      ...meet,
      split: {
        pools: [
          { id: "g", name: "Girls", genders: ["female"] },
          { id: "b", name: "Boys", genders: ["male"] },
        ],
        localPoolId: "b",
        assignments: {},
      },
    };
    expect(runOrder(split).map((e) => e.event.gender)).toEqual(["male"]);
  });

  it("steps across heats and events, stopping at the ends", () => {
    const meet = twoEvents();
    const [first, second] = meet.events;
    const heats = runOrder(meet)[0]!.heats.length;
    const last = { eventId: first!.id, heat: heats };
    expect(stepHeat(meet, last, 1)).toEqual({ eventId: second!.id, heat: 1 });
    expect(stepHeat(meet, { eventId: first!.id, heat: 1 }, -1)).toBeNull();
    expect(stepHeat(meet, { eventId: "gone", heat: 1 }, 1)).toBeNull();
  });

  it("starts at the first heat that isn't verified", () => {
    const meet = twoEvents(["female"]);
    const id = meet.events[0]!.id;
    expect(firstOpenHeat(meet)).toEqual({ eventId: id, heat: 1 });
    const count = runOrder(meet)[0]!.heats.length;
    let done = meet;
    for (let heat = 1; heat <= count; heat++) {
      done = verifiedHeat(done, id, heat);
    }
    expect(firstOpenHeat(done)).toEqual({ eventId: id, heat: count });
  });

  it("finds a heat's races newest first, leaving out ignored ones", () => {
    const meet = twoEvents();
    const on = { eventId: meet.events[0]!.id, heat: 1 };
    const withRaces = {
      ...meet,
      captures: [
        capture("old", "verified", on),
        capture("skip", "ignored", on),
        capture("new", "new", on),
        capture("other", "new", { eventId: on.eventId, heat: 2 }),
        capture("none", "new", null),
      ],
    };
    expect(heatCaptures(withRaces, on).map((c) => c.id)).toEqual([
      "new",
      "old",
    ]);
  });

  it("finds the next race waiting on another heat", () => {
    const meet = twoEvents();
    const on = { eventId: meet.events[0]!.id, heat: 1 };
    const withRaces = {
      ...meet,
      captures: [
        capture("here", "new", on),
        capture("there", "new", { eventId: on.eventId, heat: 2 }),
      ],
    };
    expect(nextWaitingRace(withRaces, on)?.id).toBe("there");
    expect(nextWaitingRace(withRaces, null)?.id).toBe("here");
    expect(nextWaitingRace(meet, on)).toBeNull();
  });
});

describe("heat results", () => {
  function review(eventId: string): HeatReview {
    return {
      eventId,
      heat: 1,
      captureId: "c1",
      warnings: [],
      lanes: [
        {
          lane: 1,
          entryId: "e1",
          timer: null,
          flags: [],
          result: lane(eventId, "e1", 1),
        },
        { lane: 2, entryId: null, timer: null, flags: [], result: null },
      ],
    };
  }

  it("opens an unverified heat with what the console reported", () => {
    const meet = twoEvents();
    const id = meet.events[0]!.id;
    const edits = initialResults(meet, review(id));
    expect(edits.get(1)?.timeMs).toBe(60_001);
    expect(edits.has(2)).toBe(false);
  });

  it("opens a verified heat with its official results, DQs included", () => {
    const meet = twoEvents();
    const id = meet.events[0]!.id;
    const official = {
      ...lane(id, "e1", 1),
      status: "dq" as const,
      dqCode: "1A",
    };
    const done = { ...verifiedHeat(meet, id, 1), results: [official] };
    const edits = initialResults(done, review(id));
    expect(edits.get(1)).toEqual(official);
  });

  it("keeps the review's result if a verified heat lacks one", () => {
    const meet = twoEvents();
    const id = meet.events[0]!.id;
    const edits = initialResults(verifiedHeat(meet, id, 1), review(id));
    expect(edits.get(1)?.status).toBe("ok");
  });

  it("gives a waiting heat a row for every lane in the pool", () => {
    const meet = { ...twoEvents(), poolLanes: 12 };
    const lanes = withEveryLane(meet, review("x")).lanes;
    expect(lanes.map((l) => l.lane)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(lanes[0]?.entryId).toBe("e1");
    expect(lanes[11]).toMatchObject({ entryId: null, result: null, flags: [] });
  });

  it("keeps a lane seeded beyond the pool's count", () => {
    const narrow = { ...twoEvents(), poolLanes: 1 };
    expect(withEveryLane(narrow, review("x")).lanes).toHaveLength(2);
  });

  it("won't verify a heat nobody has entered", () => {
    const empty = {
      ...lane("x", "e1", 1),
      status: "ns" as const,
      timeMs: null,
    };
    expect(canVerify([], true)).toBe(false);
    expect(canVerify([empty], false)).toBe(false);
    expect(canVerify([empty], true)).toBe(true);
    expect(canVerify([{ ...empty, timeMs: 60_000 }], false)).toBe(true);
    expect(canVerify([{ ...empty, status: "dq" }], false)).toBe(true);
  });
});

describe("scoreboard", () => {
  function scored(genders: Array<"female" | "male">) {
    const meet = twoEvents(genders);
    const results: LaneResult[] = [];
    for (const heat of meet.heats) {
      for (const seat of heat.lanes) {
        results.push({
          ...lane(heat.eventId, seat.entryId, seat.lane),
          heat: heat.number,
        });
      }
    }
    return { ...meet, results };
  }

  it("is empty until someone has points", () => {
    expect(scoreboard(twoEvents())).toEqual({ columns: [], rows: [] });
  });

  it("splits girls and boys when both swim", () => {
    const board = scoreboard(scored(["female", "male"]));
    expect(board.columns).toEqual(["Girls", "Boys", "Total"]);
    for (const row of board.rows) {
      expect(row.points[0]! + row.points[1]!).toBe(row.points[2]);
    }
  });

  it("shows one column for a single-gender meet", () => {
    const board = scoreboard(scored(["female"]));
    expect(board.columns).toEqual(["Points"]);
    expect(board.rows.length).toBeGreaterThan(0);
  });
});
