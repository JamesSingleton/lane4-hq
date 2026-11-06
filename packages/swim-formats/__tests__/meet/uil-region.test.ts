import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCl2Meet } from "../../src/cl2/parser";
import { parseEv3, parseHyv } from "../../src/ev3/parser";
import { exportEv3, exportHy3, exportHyv } from "../../src/export/meet";
import { parseHy3 } from "../../src/hy3/parser";
import { parseMeetFilesFromBytes } from "../../src/meet/parser";
import { mergeParsedMeets } from "../../src/meet/zip";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
);
const text = (name: string) => readFileSync(join(fixtures, name), "latin1");
const bytes = (name: string) => readFileSync(join(fixtures, name));

describe("UIL Region event files", () => {
  it("reads prelim rounds and the dive count from the EV3", () => {
    const { events } = parseEv3(text("uil-region-events.ev3"));
    expect(events).toHaveLength(24);
    expect(new Set(events.map((e) => e.roundType))).toEqual(
      new Set(["prelim"]),
    );
    expect(events.find((e) => e.eventNumber === 9)).toMatchObject({
      eventKind: "dive",
      diveCount: 11,
      roundType: "prelim",
    });
  });

  it("reads timed finals from other EV3 files", () => {
    const { events } = parseEv3(text("charger-events.ev3"));
    expect(new Set(events.map((e) => e.roundType))).toEqual(
      new Set(["finals"]),
    );
  });

  it("doesn't take the HYV board column for a dive count", () => {
    const { events } = parseHyv(text("uil-region-events.hyv"));
    const dive = events.find((e) => e.eventNumber === 9);
    expect(dive).toMatchObject({ eventKind: "dive", roundType: "prelim" });
    expect(dive?.diveCount).toBeUndefined();
  });

  it("keeps the EV3 when both event files are chosen", () => {
    const meet = parseMeetFilesFromBytes([
      { filename: "e.ev3", bytes: bytes("uil-region-events.ev3") },
      { filename: "e.hyv", bytes: bytes("uil-region-events.hyv") },
    ]);
    expect(meet.events.find((e) => e.eventNumber === 10)).toMatchObject({
      diveCount: 11,
      roundType: "prelim",
    });
  });

  it("round-trips rounds through the event exporters", () => {
    const parsed = parseEv3(text("uil-region-events.ev3"));
    const ev3 = exportEv3(parsed);
    expect(ev3).toContain(";9;P;3;I;G;");
    expect(ev3).toContain(";1;P;2;R;G;");
    expect(parseEv3(ev3).events.find((e) => e.eventNumber === 9)).toMatchObject(
      { roundType: "prelim", diveCount: 11 },
    );
    expect(exportHyv(parsed)).toContain("9;P;F;I;0;109;1;6");
  });
});

describe("UIL Region HY3 results", () => {
  const meet = parseHy3(text("uil-region-results.hy3"));

  it("reads diving as diving, not an 11 free", () => {
    const dive = meet.events.filter((e) => e.eventKind === "dive");
    expect(dive.map((e) => e.eventNumber).sort()).toEqual([10, 9]);
    expect(dive[0]).toMatchObject({
      distance: 0,
      stroke: "dive",
      diveCount: 11,
    });
    expect(dive[0]?.eventKey).toMatch(/^dive-/);
    expect(meet.events.some((e) => e.distance === 11)).toBe(false);
  });

  it("keeps every diving round as points", () => {
    const rows = meet.results.filter(
      (r) => r.eventNumber === 9 && r.swimmerName === "Test Athlete0001",
    );
    expect(rows.map((r) => [r.resultType, r.time, r.diveScore])).toEqual([
      ["finals", "237.20", 237.2],
      ["prelim", "107.90", 107.9],
      ["swimoff", "174.95", 174.95],
    ]);
  });

  it("has one entry per swim, whatever the number of rounds", () => {
    const divers = meet.entries.filter((e) => e.eventNumber === 9);
    expect(divers).toHaveLength(18);
    expect(divers.every((e) => e.seedTime === undefined)).toBe(true);
    const relays = meet.relays?.filter((r) => r.eventNumber === 17) ?? [];
    expect(
      new Set(relays.map((r) => `${r.teamCode}${r.relayLetter}`)).size,
    ).toBe(relays.length);
    expect(relays.some((r) => (r.results?.length ?? 0) === 2)).toBe(true);
  });

  it("re-exports diving the way Meet Manager wrote it", () => {
    const out = exportHy3(meet);
    expect(out).toMatch(/^E1.{19}F/m);
    const again = parseHy3(out);
    expect(again.events.find((e) => e.eventNumber === 9)).toMatchObject({
      stroke: "dive",
      diveCount: 11,
    });
  });
});

describe("UIL Region CL2 results", () => {
  const meet = parseCl2Meet(text("uil-region-results.cl2"));

  it("reads 1H as diving and leaves seed points out", () => {
    expect(meet.events.find((e) => e.eventNumber === 9)).toMatchObject({
      stroke: "dive",
      eventKind: "dive",
      eventKey: "dive-9",
    });
    expect(
      meet.results.find(
        (r) =>
          r.eventNumber === 9 &&
          r.swimmerName === "Test Athlete0001" &&
          r.resultType === "finals",
      ),
    ).toMatchObject({ time: "237.20", diveScore: 237.2 });
    expect(
      meet.entries.find((e) => e.swimmerName === "Test Athlete0001")?.seedTime,
    ).toBeUndefined();
  });

  it("treats ten-split lines as splits, not results", () => {
    expect(meet.results.filter((r) => (r.heat ?? 0) > 5)).toEqual([]);
    expect(meet.results.some((r) => r.swimmerName.includes("ID0"))).toBe(false);
    const swim = meet.results.find(
      (r) => r.eventNumber === 15 && (r.splitsMs?.length ?? 0) === 10,
    );
    expect(swim?.time).toMatch(/^\d:\d{2}\.\d{2}$/);
  });

  it("adds nothing when imported alongside the HY3", () => {
    const hy3 = parseHy3(text("uil-region-results.hy3"));
    const pair = parseMeetFilesFromBytes([
      { filename: "r.hy3", bytes: bytes("uil-region-results.hy3") },
      { filename: "r.cl2", bytes: bytes("uil-region-results.cl2") },
    ]);
    expect(pair.results).toHaveLength(hy3.results.length);
    expect(pair.events).toHaveLength(hy3.events.length);
  });
});

describe("edge cases from the UIL Region pack", () => {
  it("ignores a G0 with no time and no split marker", () => {
    const meet = parseCl2Meet(
      [
        `A09V3      02Meet Results${" ".repeat(60)}`,
        `D09        Doe, Ada${" ".repeat(44)}10FF 501  3 UNOV02062026   30.00Y   29.50Y          29.00Y`,
        `G09            Doe, Ada`,
      ].join("\n"),
    );
    expect(meet.results.every((r) => r.time !== "")).toBe(true);
    expect(meet.results.some((r) => r.resultType === undefined)).toBe(false);
  });

  it("keeps a middle name and stops at a letters-first member id", () => {
    const pad = (s: string, n: number) => s.padEnd(n, " ");
    const line = `D09${" ".repeat(8)}${pad("Doe, Mary Ann", 28)}${pad("CD6942B2A140", 12)}A           10FF 501  3 UNOV`;
    const idLine = `D09${" ".repeat(8)}${pad("Doe, Ada", 28)}${pad("CD6942B2A140", 12)}A           10FF 501  4 UNOV`;
    const meet = parseCl2Meet(
      [`A09V3      20Meet Entries${" ".repeat(60)}`, line, idLine].join("\n"),
    );
    expect(meet.entries.map((e) => e.swimmerName)).toEqual([
      "Mary Ann Doe",
      "Ada Doe",
    ]);
  });

  it("stops a name that fills the column at the member id", () => {
    const name = "Xxxxxxxxx-Yyyyyyyy, Abcdefgh";
    expect(name).toHaveLength(28);
    const meet = parseCl2Meet(
      [
        `A09V3      20Meet Entries${" ".repeat(60)}`,
        `D09${" ".repeat(8)}${name}CD6942B2A140A           10FF 501  3 UNOV`,
      ].join("\n"),
    );
    expect(meet.entries[0]?.swimmerName).toBe("Abcdefgh Xxxxxxxxx-Yyyyyyyy");
  });

  it("dedupes a swim named two ways across HY3 and CL2", () => {
    const base = { name: "M", course: "SCY" as const, events: [] };
    const result = { eventNumber: 3, time: "2:00.00", place: 1 };
    const merged = mergeParsedMeets(
      {
        ...base,
        entries: [
          {
            eventNumber: 3,
            swimmerName: "Liz Doe",
            preferredName: "Liz",
            legalFirstName: "Elizabeth",
          },
          { eventNumber: 3, swimmerName: "Ada Doe", legalFirstName: "Ada" },
          {
            eventNumber: 3,
            swimmerName: "Bo Ray",
            preferredName: "Robert",
            legalFirstName: "Robert",
          },
        ],
        results: [{ ...result, swimmerName: "Liz Doe" }],
      },
      [
        {
          ...base,
          entries: [],
          results: [
            { ...result, swimmerName: "Elizabeth Doe" },
            { ...result, swimmerName: "Ada Doe" },
          ],
        },
      ],
    );
    expect(merged.results.map((r) => r.swimmerName)).toEqual([
      "Liz Doe",
      "Ada Doe",
    ]);
  });

  it("writes a dive event with no dive count, and one E1 per swim", () => {
    const entry = {
      eventNumber: 9,
      swimmerName: "Ada Doe",
      gender: "female" as const,
    };
    const out = exportHy3({
      name: "M",
      course: "SCY",
      events: [
        {
          eventNumber: 9,
          distance: 0,
          stroke: "dive",
          gender: "female",
          eventKey: "dive-9",
          eventKind: "dive",
        },
      ],
      entries: [entry, entry],
      results: [],
      athletes: [{ name: "Ada Doe", gender: "female" }],
      importKind: "meet_entries",
      teamCode: "ABC",
    } as Parameters<typeof exportHy3>[0]);
    expect(out.match(/^E1/gm)).toHaveLength(1);
    expect(out).toMatch(/^E1.{13} {5}0F/m);
  });
});

describe("EV3 rows without a round letter", () => {
  it("leaves the round unstated", () => {
    const row = "1;1;;1;I;G;0;109;50;A;0;;;N;0;;;;;;;1;1;1;09:00AM;Y;4;2;3;0*>";
    const { events } = parseEv3(
      `Meet;Pool;01/01/2027;01/01/2027;01/01/2027;Y\n${row}`,
    );
    expect(events[0]?.roundType).toBeUndefined();
  });
});
