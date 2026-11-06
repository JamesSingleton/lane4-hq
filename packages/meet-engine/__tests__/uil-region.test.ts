import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHyv } from "@lane4hq/swim-formats/ev3";
import { parseHy3 } from "@lane4hq/swim-formats/hy3";
import { parseMeetFilesFromBytes } from "@lane4hq/swim-formats/meet";
import { describe, expect, it } from "vitest";
import { addEvent, createMeet, createMeetFromEventFile } from "../src/create";
import { mergeTeamEntries } from "../src/entries";
import { createFinals } from "../src/finals";
import type { Entry, Meet } from "../src/model";
import { seedEntries } from "../src/seeding";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "swim-formats",
  "fixtures",
);
const bytes = (name: string) => readFileSync(join(fixtures, name));

function regionMeet(): Meet {
  return createMeetFromEventFile(
    parseMeetFilesFromBytes([
      { filename: "e.ev3", bytes: bytes("uil-region-events.ev3") },
      { filename: "e.hyv", bytes: bytes("uil-region-events.hyv") },
    ]),
    { scoring: "championship" },
  );
}

describe("a UIL Region meet", () => {
  it("builds prelims for swims and an 11-dive card for diving", () => {
    const meet = regionMeet();
    expect(meet.events.filter((e) => e.round === "prelim")).toHaveLength(22);
    expect(meet.events.filter((e) => e.kind === "dive")).toMatchObject([
      { number: 9, round: "timed_final", diveCount: 11 },
      { number: 10, round: "timed_final", diveCount: 11 },
    ]);
  });

  it("assumes 11 dives for prelim diving from an HYV alone", () => {
    const meet = createMeetFromEventFile(
      parseHyv(bytes("uil-region-events.hyv").toString("latin1")),
    );
    expect(meet.events.find((e) => e.kind === "dive")).toMatchObject({
      round: "timed_final",
      diveCount: 11,
    });
  });

  it("merges divers from a Hy-Tek file", () => {
    const parsed = parseHy3(bytes("uil-region-results.hy3").toString("latin1"));
    const { meet, summary } = mergeTeamEntries(regionMeet(), parsed, {
      code: "TM01",
      name: "School 01",
    });
    expect(summary.skipped).toEqual([]);
    const event9 = meet.events.find((e) => e.number === 9)!;
    const divers = meet.entries.filter((e) => e.eventId === event9.id);
    expect(divers).toHaveLength(18);
    expect(divers.every((e) => e.seedTimeMs == null)).toBe(true);
  });

  it("matches divers to a hand-added event whatever its distance", () => {
    const hand = addEvent(createMeet({ name: "M", course: "SCY" }), {
      number: 9,
      distance: 1,
      stroke: "dive",
      gender: "female",
    });
    const parsed = parseHy3(bytes("uil-region-results.hy3").toString("latin1"));
    const { summary } = mergeTeamEntries(
      hand,
      { ...parsed, events: parsed.events.filter((e) => e.eventNumber === 9) },
      { code: "TM01", name: "School 01" },
    );
    expect(summary.added).toBe(18);
  });

  it("refuses to build finals from a diving event", () => {
    const meet = addEvent(createMeet({ name: "M", course: "SCY" }), {
      number: 9,
      distance: 0,
      stroke: "dive",
      gender: "female",
      round: "prelim",
    });
    expect(() => createFinals(meet, meet.events[0]!.id)).toThrow(/dive card/);
  });
});

describe("circle seeding a small field", () => {
  const entries = (n: number): Entry[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `e${i + 1}`,
      eventId: "x",
      teamCode: "T",
      seedTimeMs: (i + 1) * 1000,
      exhibition: false,
      scratched: false,
    }));
  const sizes = (n: number) =>
    seedEntries("x", entries(n), { lanes: 8, circleHeats: 3 }).map(
      (h) => h.lanes.length,
    );

  // Heat sizes from the Region prelims in Meet Manager's results file.
  it.each([
    [18, [6, 6, 6]],
    [19, [6, 6, 7]],
    [20, [6, 7, 7]],
    [21, [7, 7, 7]],
    [22, [7, 7, 8]],
    [23, [7, 8, 8]],
    [24, [8, 8, 8]],
  ])("spreads %i swimmers evenly", (n, expected) => {
    expect(sizes(n)).toEqual(expected);
  });

  it("deals the fastest swimmers round the heats, center lanes first", () => {
    const heats = seedEntries("x", entries(18), { lanes: 8, circleHeats: 3 });
    expect(
      heats.map((h) => h.lanes.find((l) => l.lane === 4)?.entryId),
    ).toEqual(["e3", "e2", "e1"]);
  });

  it("keeps normal heat sizes when more heats swim than are circled", () => {
    expect(sizes(25)).toEqual([3, 6, 8, 8]);
    expect(sizes(8)).toEqual([8]);
  });
});
