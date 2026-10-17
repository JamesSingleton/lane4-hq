import { describe, expect, it } from "vitest";
import { addEvent, createMeet } from "../src/create";
import { eventTitle } from "../src/labels";
import {
  addEvents,
  expandProgram,
  MEET_TEMPLATES,
  meetTemplate,
  nextEventNumber,
  removeEvents,
} from "../src/templates";
import { counterIds, NOW } from "./helpers";

const blank = () =>
  createMeet({ name: "Invite", course: "SCY" }, { newId: counterIds("m") });

describe("meet templates", () => {
  it("numbers the high school order girls-first, with diving as a timed final", () => {
    const events = expandProgram(meetTemplate("high-school")!.program);
    expect(events).toHaveLength(24);
    expect(events.slice(0, 2).map((e) => [e.number, e.gender])).toEqual([
      [1, "female"],
      [2, "male"],
    ]);
    const dive = events.find((e) => e.stroke === "dive")!;
    expect(dive).toMatchObject({
      number: 9,
      distance: 1,
      round: "timed_final",
    });
  });

  it("puts boys on the odd events when the order flips", () => {
    const events = expandProgram({
      ...meetTemplate("high-school")!.program,
      genders: "boys_girls",
    });
    expect(events).toHaveLength(24);
    expect(
      events.every(
        (e) => e.gender === (e.number % 2 === 1 ? "male" : "female"),
      ),
    ).toBe(true);
  });

  it("gives each age group its own distance and skips races it doesn't swim", () => {
    const events = expandProgram(meetTemplate("age-group")!.program);
    const im = events.filter((e) => e.stroke === "im");
    expect(im.map((e) => `${e.ageGroup} ${e.distance}`)).toEqual([
      "9-10 100",
      "9-10 100",
      "11-12 100",
      "11-12 100",
      "13-14 200",
      "13-14 200",
      "15&O 200",
      "15&O 200",
    ]);
    const firstFree = events.find((e) => e.stroke === "free")!;
    expect(firstFree).toMatchObject({ ageGroup: "8&U", distance: 25 });
  });

  it("applies prelims to swims only and follows the chosen genders", () => {
    const program = {
      ...meetTemplate("high-school")!.program,
      genders: "girls" as const,
      round: "prelim" as const,
    };
    const events = expandProgram(program, 101);
    expect(events).toHaveLength(12);
    expect(events[0]!.number).toBe(101);
    expect(events.every((e) => e.gender === "female")).toBe(true);
    expect(
      events.filter((e) => e.round === "timed_final").map((e) => e.stroke),
    ).toEqual(["dive"]);
  });

  it("uses the base distance for age groups the template doesn't know", () => {
    const events = expandProgram({
      ageGroups: ["Open"],
      genders: "mixed",
      round: "timed_final",
      items: meetTemplate("age-group")!.program.items.slice(0, 1),
    });
    expect(events).toEqual([
      {
        number: 1,
        distance: 200,
        stroke: "medley_relay",
        gender: "mixed",
        ageGroup: "Open",
        round: "timed_final",
      },
    ]);
  });

  it("every template produces unique, sequential event numbers", () => {
    for (const template of MEET_TEMPLATES) {
      const numbers = expandProgram(template.program).map((e) => e.number);
      expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    }
  });
});

describe("bulk event edits", () => {
  it("adds a whole program after the existing events", () => {
    let meet = addEvent(
      blank(),
      { number: 1, distance: 50, stroke: "free", gender: "female" },
      { newId: counterIds("e") },
    );
    const program = meetTemplate("high-school")!.program;
    meet = addEvents(meet, expandProgram(program, nextEventNumber(meet)), {
      newId: counterIds("t"),
      now: NOW,
    });
    expect(meet.events).toHaveLength(25);
    expect(nextEventNumber(meet)).toBe(26);
    expect(eventTitle(meet.events[1]!)).toBe("Female 200 Medley Relay");
    expect(meet.updatedAt).toBe(NOW.toISOString());
  });

  it("refuses a program whose numbers collide", () => {
    const meet = addEvents(
      blank(),
      expandProgram(meetTemplate("high-school")!.program),
    );
    expect(() =>
      addEvents(meet, expandProgram(meetTemplate("high-school")!.program)),
    ).toThrow(/already exists/);
  });

  it("removes several events at once", () => {
    const meet = addEvents(
      blank(),
      expandProgram(meetTemplate("high-school")!.program),
      { newId: counterIds("e") },
    );
    const ids = meet.events.slice(0, 3).map((e) => e.id);
    const next = removeEvents(meet, ids, NOW);
    expect(next.events).toHaveLength(21);
    expect(next.events[0]!.number).toBe(4);
  });
});
