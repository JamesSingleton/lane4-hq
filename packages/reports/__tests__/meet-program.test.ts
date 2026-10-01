import { verifyHeat } from "@lane4hq/meet-engine/adjudicate";
import { addEvent, createMeet } from "@lane4hq/meet-engine/create";
import { diveResult } from "@lane4hq/meet-engine/diving";
import { mergeTeamEntries } from "@lane4hq/meet-engine/entries";
import { createFinals, finalsEventFor } from "@lane4hq/meet-engine/finals";
import type { LaneResult, Meet } from "@lane4hq/meet-engine/model";
import { heatsForEvent, seedAllEvents } from "@lane4hq/meet-engine/seeding";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import {
  ageOn,
  buildHeatSheetReport,
  buildMeetResultsReport,
} from "../src/meet-program/build";
import { HeatSheetPdfDocument } from "../src/templates/pdf/heat-sheet";
import { MeetResultsPdfDocument } from "../src/templates/pdf/meet-results";

const NOW = new Date("2026-10-25T16:00:00Z");

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function swim(meet: Meet, eventId: string, time: (lane: number) => number) {
  for (const heat of heatsForEvent(meet, eventId)) {
    const results: LaneResult[] = heat.lanes.map(({ lane, entryId }) => ({
      entryId,
      eventId,
      heat: heat.number,
      lane,
      status: lane === 1 ? "dq" : "ok",
      dqCode: lane === 1 ? "4L" : undefined,
      timeMs: time(lane) + heat.number * 1000,
      source: "manual",
      splitsMs: [time(lane) / 2, time(lane)],
      backupMs: null,
      buttonsMs: [],
      relayExchangesMs: [],
    }));
    meet = verifyHeat(meet, { eventId, heat: heat.number }, results, NOW);
  }
  return meet;
}

function sampleMeet(): Meet {
  let meet = createMeet(
    {
      name: "Desert Champs",
      course: "SCY",
      poolLanes: 6,
      startDate: "2026-10-25",
      endDate: "2026-10-26",
      location: "Kino Aquatic Center",
      scoring: "championship",
    },
    { newId: () => "meet", now: NOW },
  );
  meet = addEvent(
    meet,
    {
      number: 1,
      distance: 100,
      stroke: "fly",
      gender: "female",
      round: "prelim",
    },
    { newId: () => "e1" },
  );
  meet = addEvent(
    meet,
    { number: 2, distance: 200, stroke: "medley_relay", gender: "male" },
    { newId: () => "e2" },
  );
  meet = addEvent(
    meet,
    { number: 3, distance: 1, stroke: "dive", gender: "female", diveCount: 1 },
    { newId: () => "e3" },
  );
  meet = mergeTeamEntries(
    meet,
    {
      name: "x",
      course: "SCY",
      events: [],
      results: [],
      entries: [
        ...Array.from({ length: 9 }, (_, i) => ({
          eventNumber: 1,
          swimmerName: `Flyer ${i}`,
          seedTime: `1:0${i}.00`,
          dateOfBirth: "2010-11-01",
          exhibition: i === 8,
        })),
        { eventNumber: 3, swimmerName: "Diver One" },
        { eventNumber: 3, swimmerName: "Diver Two" },
      ],
      relays: [
        {
          eventNumber: 2,
          teamCode: "DSRT",
          relayLetter: "A",
          seedTime: "1:45.00",
          swimmerNames: ["Al A", "Bo B", "Cy C", "Di D"],
        },
      ],
    },
    { code: "DSRT", name: "Desert Aquatics" },
    { newId: ids("a"), now: NOW },
  ).meet;
  meet = seedAllEvents(meet, { random: () => 0 }, NOW);
  meet = swim(meet, "e1", (lane) => 60_000 + lane * 100);
  meet = createFinals(meet, "e1", { finalHeats: 2, newId: ids("f") }).meet;
  meet = swim(meet, finalsEventFor(meet, "e1")!.id, (lane) => 59_000 + lane);
  meet = swim(meet, "e2", () => 105_000);
  const dive = heatsForEvent(meet, "e3")[0]!;
  meet = verifyHeat(
    meet,
    { eventId: "e3", heat: 1 },
    dive.lanes.map(({ lane, entryId }) =>
      diveResult(meet, { eventId: "e3", heat: 1, lane, entryId }, [
        { code: "101", position: "B", dd: 1.4, awards: [5, 5.5, 6] },
      ]),
    ),
    NOW,
  );
  return meet;
}

describe("meet program reports", () => {
  it("computes ages on the meet date", () => {
    expect(ageOn("2010-11-01", "2026-10-25")).toBe(15);
    expect(ageOn("2010-10-25", "2026-10-25")).toBe(16);
    expect(ageOn(undefined, "2026-10-25")).toBeNull();
    expect(ageOn("2030-01-01", "2026-10-25")).toBeNull();
  });

  it("builds the heat sheet: heats, finals, relays, dive order", () => {
    const meet = sampleMeet();
    const report = buildHeatSheetReport(meet, { generatedAt: NOW });
    expect(report.meetDateLabel).toBe("25-Oct-26 to 26-Oct-26");
    expect(report.events.map((e) => e.title)).toEqual([
      "Female 100 Butterfly Prelims",
      "Male 200 Medley Relay",
      "Female Diving (1 dives)",
      "Female 100 Butterfly Finals",
    ]);
    const [prelim, relay, dive, finals] = report.events;
    expect(prelim!.heats.map((h) => h.label)).toEqual([
      "Heat 1 of 2",
      "Heat 2 of 2",
    ]);
    expect(prelim!.heats[0]!.rows[0]).toMatchObject({
      age: 15,
      team: "Desert Aquatics",
    });
    expect(relay!.heats[0]!.rows[0]!.legs).toHaveLength(4);
    expect(relay!.heats[0]!.rows[0]!.name).toBe("Desert Aquatics 'A'");
    expect(dive!.heats[0]!.label).toBe("Dive order");
    expect(dive!.heats[0]!.rows[0]!.seed).toBe("");
    expect(finals!.heats.map((h) => h.label)).toEqual(["B Final", "A Final"]);
    const only = buildHeatSheetReport(meet, { eventIds: ["e2"] });
    expect(only.events).toHaveLength(1);
  });

  it("builds results: finals sections, qualifiers, DQs, splits, scores", () => {
    const meet = sampleMeet();
    const report = buildMeetResultsReport(meet, { generatedAt: NOW });
    const [prelim, relay, dive, finals] = report.events;
    expect(prelim!.markLabel).toBe("Prelims");
    const rows = prelim!.sections[0]!.rows;
    expect(rows.filter((r) => r.note === "q").length).toBeGreaterThan(0);
    expect(rows.find((r) => r.mark === "DQ")?.note).toBe("4L");
    expect(rows[0]!.splits).toHaveLength(2);
    expect(rows.every((r) => r.points === "")).toBe(true);
    expect(relay!.sections[0]!.rows.find((r) => r.place === "1")?.points).toBe(
      "40",
    );
    expect(dive!.markLabel).toBe("Score");
    expect(dive!.sections[0]!.rows[0]!.mark).toBe("23.10");
    expect(finals!.sections.map((s) => s.label)).toEqual([
      "A Final",
      "B Final",
    ]);
    expect(report.teamScores[0]).toMatchObject({
      rank: 1,
      team: "Desert Aquatics",
    });

    const unscored = buildMeetResultsReport({
      ...meet,
      scoring: { preset: "none", individual: [], relay: [] },
      startDate: undefined,
    });
    expect(unscored.teamScores).toEqual([]);
    expect(unscored.meetDateLabel).toBeNull();
  });

  it("renders both PDFs", async () => {
    const meet = sampleMeet();
    for (const doc of [
      HeatSheetPdfDocument({ report: buildHeatSheetReport(meet) }),
      MeetResultsPdfDocument({ report: buildMeetResultsReport(meet) }),
      HeatSheetPdfDocument({
        report: buildHeatSheetReport(meet, { eventIds: [] }),
      }),
      MeetResultsPdfDocument({
        report: buildMeetResultsReport(meet, { eventIds: [] }),
      }),
    ]) {
      const buffer = await renderToBuffer(doc);
      expect(Buffer.from(buffer.subarray(0, 4)).toString()).toBe("%PDF");
    }
  });
});
