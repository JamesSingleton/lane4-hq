import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { verifyHeat } from "../src/adjudicate";
import { addEvent, createMeet } from "../src/create";
import { addIndividualEntry } from "../src/entries";
import {
  exportAllTeamResults,
  exportResultsCsv,
  exportTeamResults,
  teamResultsMeet,
  teamResultsStem,
} from "../src/export";
import { eventLengths, poolLength } from "../src/labels";
import type { LaneResult, Meet } from "../src/model";
import { buildHeatPublication } from "../src/publish";
import { seedEvent } from "../src/seeding";
import { counterIds, NOW } from "./helpers";

function lane(
  entryId: string,
  eventId: string,
  n: number,
  patch: Partial<LaneResult>,
): LaneResult {
  return {
    entryId,
    eventId,
    heat: 1,
    lane: n,
    status: "ok",
    timeMs: 60_000 + n,
    source: "manual",
    splitsMs: [],
    backupMs: null,
    buttonsMs: [],
    relayExchangesMs: [],
    ...patch,
  };
}

function meetWithDq(): Meet {
  const newId = counterIds("x");
  let meet = createMeet(
    { name: 'Quote "Meet", Inc', course: "LCM" },
    { newId, now: NOW },
  );
  meet = addEvent(
    meet,
    {
      number: 1,
      distance: 100,
      stroke: "back",
      gender: "male",
      round: "prelim",
    },
    { newId: () => "ev1", now: NOW },
  );
  meet = addEvent(
    meet,
    { number: 2, distance: 0, stroke: "dive", gender: "male" },
    { newId: () => "dive", now: NOW },
  );
  meet = addIndividualEntry(
    meet,
    {
      eventId: "ev1",
      teamCode: "ZZ",
      firstName: "Al",
      lastName: "Pha",
      seedTimeMs: 61_000,
    },
    { newId, now: NOW },
  );
  meet = addIndividualEntry(
    meet,
    { eventId: "ev1", teamCode: "ZZ", firstName: "Be", lastName: "Ta" },
    { newId, now: NOW },
  );
  meet = addIndividualEntry(
    meet,
    { eventId: "dive", teamCode: "ZZ", firstName: "Di", lastName: "Ver" },
    { newId, now: NOW },
  );
  meet = {
    ...meet,
    entries: [
      ...meet.entries,
      {
        id: "relay",
        eventId: "ev1",
        teamCode: "ZZ",
        seedTimeMs: null,
        exhibition: false,
        scratched: false,
        relay: { letter: "A", legAthleteIds: ["missing"] },
      },
      {
        id: "orphan",
        eventId: "ev1",
        teamCode: "ZZ",
        seedTimeMs: null,
        exhibition: false,
        scratched: false,
        athleteId: "missing",
      },
    ],
    teams: [...meet.teams, { code: "EMPTY", name: "No entries" }],
  };
  meet = seedEvent(meet, "ev1", {}, NOW);
  const [a, b] = meet.entries;
  return verifyHeat(
    meet,
    { eventId: "ev1", heat: 1 },
    [
      lane(a!.id, "ev1", 1, {
        status: "dq",
        dqCode: "1F",
        splitsMs: [30_000, 60_001],
      }),
      lane(b!.id, "ev1", 2, { status: "ns", timeMs: null }),
      lane("relay", "ev1", 3, { status: "dq", timeMs: null }),
    ],
    NOW,
  );
}

describe("export edge cases", () => {
  it("handles meets without dates, LSCs, or places", () => {
    const meet = meetWithDq();
    expect(poolLength("LCM")).toBe(50);
    expect(eventLengths(meet.events[0]!, "LCM")).toBe(2);
    expect(teamResultsStem(meet, "ZZ")).toBe("ZZ-Results-Quote Meet , Inc-001");
    const parsed = teamResultsMeet(meet, "ZZ");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]).toMatchObject({
      isDq: true,
      dqCode: "1F",
      resultType: "prelim",
      splitsMs: [30_000, 60_001],
    });
    expect(parsed.relays?.[0]?.swimmerNames).toEqual([""]);
    expect(parsed.relays?.[0]?.results?.[0]).toMatchObject({
      isDq: true,
      time: "",
    });
    expect(parsed.events[0]!.roundType).toBe("prelim");
    const files = Object.keys(unzipSync(exportTeamResults(meet, "ZZ").bytes));
    expect(files).toHaveLength(1);
    const all = Object.keys(unzipSync(exportAllTeamResults(meet).bytes));
    expect(all.every((f) => f.startsWith("ZZ/"))).toBe(true);
    expect(exportAllTeamResults(meet).filename).toBe(
      "Results-Quote Meet , Inc.zip",
    );
    const csv = new TextDecoder().decode(exportResultsCsv(meet).bytes);
    expect(csv).toContain("DQ");
    expect(exportResultsCsv({ ...meet, name: "" }).filename).toBe(
      "Meet Results.csv",
    );
  });

  it("dates stems and quotes CSV cells", () => {
    let meet = meetWithDq();
    meet = {
      ...meet,
      startDate: "2026-03-07",
      teams: meet.teams.map((t) => ({ ...t, lsc: "AZ", name: "Zed, Inc" })),
    };
    expect(teamResultsStem(meet, "ZZ")).toBe(
      "ZZ-AZ-Results-Quote Meet , Inc-07Mar2026-001",
    );
    const csv = new TextDecoder().decode(
      exportResultsCsv({
        ...meet,
        athletes: meet.athletes.map((a) => ({ ...a, lastName: 'O"Neil, Jr' })),
      }).bytes,
    );
    expect(csv).toContain('"O""Neil, Jr, Al"');
  });

  it("publishes relay legs and missing athletes safely", () => {
    const meet = meetWithDq();
    const pub = buildHeatPublication(meet, "ev1", 1);
    expect(pub.lanes.map((l) => l.status)).toEqual(["dq", "ns", "dq"]);
    expect(pub.lanes[2]!.relay?.legs[0]).toMatchObject({
      firstName: "",
      lastName: "",
    });
    expect(() => buildHeatPublication(meet, "ev1", 2)).toThrow(/verified/);
  });
});
