import { describe, expect, it } from "vitest";
import { createMeet } from "../src/create";
import {
  genderOrder,
  genderPairs,
  hasNumberGaps,
  renumberEvents,
  swapGenderOrder,
  updateEvent,
} from "../src/event-edits";
import { eventTitle } from "../src/labels";
import type { LaneResult, Meet, MeetEvent } from "../src/model";
import {
  addEvents,
  expandProgram,
  meetTemplate,
  removeEvents,
} from "../src/templates";
import { counterIds, NOW } from "./helpers";

function highSchool(): Meet {
  return addEvents(
    createMeet({ name: "Dual", course: "SCY" }, { newId: counterIds("m") }),
    expandProgram(meetTemplate("high-school")!.program),
    { newId: counterIds("e") },
  );
}

const byNumber = (meet: Meet, n: number) =>
  meet.events.find((e) => e.number === n && e.round !== "final")!;

function withResult(meet: Meet, eventId: string): Meet {
  const result: LaneResult = {
    entryId: "x",
    eventId,
    heat: 1,
    lane: 4,
    status: "ok",
    timeMs: 60_000,
    source: "pad",
    splitsMs: [],
    backupMs: null,
    buttonsMs: [],
    relayExchangesMs: [],
  };
  return { ...meet, results: [...meet.results, result] };
}

function withEntry(meet: Meet, eventId: string): Meet {
  return {
    ...meet,
    entries: [
      ...meet.entries,
      {
        id: "entry-1",
        eventId,
        teamCode: "AAA",
        seedTimeMs: null,
        exhibition: false,
        scratched: false,
        athleteId: "a1",
      },
    ],
  };
}

function withFinal(meet: Meet, prelim: MeetEvent): Meet {
  return {
    ...meet,
    events: [
      ...meet.events,
      {
        ...prelim,
        id: `${prelim.id}-final`,
        round: "final",
        prelimEventId: prelim.id,
      },
    ],
  };
}

describe("updateEvent", () => {
  it("changes the race and keeps meet order", () => {
    const meet = highSchool();
    const free = byNumber(meet, 7);
    const next = updateEvent(
      meet,
      free.id,
      { number: 30, distance: 100, stroke: "back", ageGroup: " JV " },
      NOW,
    );
    const edited = next.events.find((e) => e.id === free.id)!;
    expect(eventTitle(edited)).toBe("Female JV 100 Backstroke");
    expect(next.events[next.events.length - 1]!.id).toBe(free.id);
    expect(next.updatedAt).toBe(NOW.toISOString());
  });

  it("clears the age group and handles diving both ways", () => {
    const meet = highSchool();
    const free = byNumber(meet, 7);
    const aged = updateEvent(meet, free.id, { ageGroup: "JV" });
    const cleared = updateEvent(aged, free.id, { ageGroup: undefined });
    expect(
      cleared.events.find((e) => e.id === free.id)!.ageGroup,
    ).toBeUndefined();

    const dive = updateEvent(meet, free.id, {
      stroke: "dive",
      round: "prelim",
    });
    expect(dive.events.find((e) => e.id === free.id)).toMatchObject({
      kind: "dive",
      distance: 1,
      round: "timed_final",
      diveCount: 6,
      diveJudges: 3,
    });
    const back = updateEvent(dive, free.id, { stroke: "fly", distance: 100 });
    const swim = back.events.find((e) => e.id === free.id)!;
    expect(swim.kind).toBe("swim");
    expect(swim.diveCount).toBeUndefined();
    expect(
      updateEvent(meet, free.id, { stroke: "free_relay" }).events.find(
        (e) => e.id === free.id,
      )!.isRelay,
    ).toBe(true);
  });

  it("refuses bad numbers, taken numbers, and bad distances", () => {
    const meet = highSchool();
    const id = byNumber(meet, 1).id;
    expect(() => updateEvent(meet, id, { number: 0 })).toThrow(/whole numbers/);
    expect(() => updateEvent(meet, id, { number: 2 })).toThrow(
      /already exists/,
    );
    expect(() => updateEvent(meet, id, { distance: 0 })).toThrow(/Distance/);
    expect(() => updateEvent(meet, "nope", {})).toThrow(/isn't in this meet/);
    expect(() => updateEvent(meet, id, { round: "final" })).toThrow(/Finals/);
  });

  it("locks the race once there are entries, and everything once swum", () => {
    const meet = highSchool();
    const id = byNumber(meet, 3).id;
    const entered = withEntry(meet, id);
    expect(() => updateEvent(entered, id, { gender: "male" })).toThrow(
      /has entries/,
    );
    expect(
      updateEvent(entered, id, { number: 40, round: "prelim" }).events.find(
        (e) => e.id === id,
      ),
    ).toMatchObject({ number: 40, round: "prelim" });
    expect(() => updateEvent(withResult(meet, id), id, { number: 40 })).toThrow(
      /has results/,
    );
  });

  it("moves finals with their prelim and protects them", () => {
    const meet = highSchool();
    const prelim = { ...byNumber(meet, 3), round: "prelim" as const };
    const base = withFinal(
      {
        ...meet,
        events: meet.events.map((e) => (e.id === prelim.id ? prelim : e)),
      },
      prelim,
    );
    const next = updateEvent(base, prelim.id, { number: 50, distance: 100 });
    expect(
      next.events.find((e) => e.id === `${prelim.id}-final`),
    ).toMatchObject({
      number: 50,
      distance: 100,
    });
    expect(() => updateEvent(base, `${prelim.id}-final`, {})).toThrow(
      /Edit the prelim/,
    );
    expect(() =>
      updateEvent(base, prelim.id, { round: "timed_final" }),
    ).toThrow(/finals first/);
  });
});

describe("gender order", () => {
  it("swaps girls-first to boys-first and back", () => {
    const meet = highSchool();
    expect(genderPairs(meet)).toHaveLength(12);
    expect(genderOrder(meet)).toBe("girls");

    const boys = swapGenderOrder(meet, NOW);
    expect(genderOrder(boys)).toBe("boys");
    expect(boys.events.slice(0, 2).map(eventTitle)).toEqual([
      "Male 200 Medley Relay",
      "Female 200 Medley Relay",
    ]);
    expect(boys.events.map((e) => e.number)).toEqual(
      meet.events.map((e) => e.number),
    );
    expect(genderOrder(swapGenderOrder(boys))).toBe("girls");
  });

  it("reports a mixed order and nothing to swap", () => {
    const meet = highSchool();
    const [f, m] = genderPairs(meet)[0]!;
    const partial = {
      ...meet,
      events: meet.events.map((e) =>
        e.id === f.id
          ? { ...e, number: m.number }
          : e.id === m.id
            ? { ...e, number: f.number }
            : e,
      ),
    };
    expect(genderOrder(partial)).toBe("mixed");

    const empty = createMeet({ name: "Empty", course: "SCY" });
    expect(genderOrder(empty)).toBeNull();
    expect(() => swapGenderOrder(empty)).toThrow(/no girls' and boys'/);
  });

  it("won't swap events that have results", () => {
    const meet = highSchool();
    expect(() =>
      swapGenderOrder(withResult(meet, byNumber(meet, 1).id)),
    ).toThrow(/Events 1 and 2 have results/);
  });
});

describe("renumberEvents", () => {
  it("closes gaps left by removed events, with finals following", () => {
    const meet = highSchool();
    const gappy = removeEvents(meet, [
      byNumber(meet, 3).id,
      byNumber(meet, 4).id,
    ]);
    expect(hasNumberGaps(meet)).toBe(false);
    expect(hasNumberGaps(gappy)).toBe(true);

    const prelim = byNumber(gappy, 24);
    const next = renumberEvents(withFinal(gappy, prelim), NOW);
    expect(hasNumberGaps(next)).toBe(false);
    expect(next.events.filter((e) => e.round !== "final")).toHaveLength(22);
    expect(next.events.find((e) => e.id === `${prelim.id}-final`)!.number).toBe(
      22,
    );
  });

  it("won't move an event that has results", () => {
    const meet = highSchool();
    const gappy = removeEvents(meet, [byNumber(meet, 1).id]);
    expect(() =>
      renumberEvents(withResult(gappy, byNumber(gappy, 2).id)),
    ).toThrow(/Event 2 has results/);
  });
});
