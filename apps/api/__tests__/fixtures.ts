import { verifyHeat } from "@lane4hq/meet-engine/adjudicate";
import { addEvent, createMeet } from "@lane4hq/meet-engine/create";
import { mergeTeamEntries } from "@lane4hq/meet-engine/entries";
import type { LaneResult, Meet } from "@lane4hq/meet-engine/model";
import { buildHeatPublication } from "@lane4hq/meet-engine/publish";
import { heatsForEvent, seedAllEvents } from "@lane4hq/meet-engine/seeding";
import { vi } from "vitest";

const NOW = new Date("2026-10-25T16:00:00.000Z");

function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** A small meet with one verified heat, built the way the desktop builds it. */
export function verifiedMeet(): Meet {
  let meet = createMeet(
    {
      name: "Desert Duals",
      course: "SCY",
      startDate: "2026-10-25",
      location: "Mesa, AZ",
      poolLanes: 6,
    },
    { newId: () => "meet-1", now: NOW },
  );
  meet = addEvent(
    meet,
    { number: 1, distance: 50, stroke: "free", gender: "female" },
    { newId: () => "e1", now: NOW },
  );
  meet = mergeTeamEntries(
    meet,
    {
      name: "x",
      course: "SCY",
      events: [],
      results: [],
      entries: [0, 1, 2].map((i) => ({
        eventNumber: 1,
        swimmerName: `Swimmer ${i}`,
        seedTime: `${25 + i}.00`,
        dateOfBirth: "2010-01-01",
        usaMemberId: `ID${i}`,
      })),
    },
    { code: "AAA", name: "A Aquatics" },
    { newId: ids("a"), now: NOW },
  ).meet;
  meet = seedAllEvents(meet, { random: () => 0 }, NOW);
  const heat = heatsForEvent(meet, "e1")[0]!;
  const results: LaneResult[] = heat.lanes.map(({ lane, entryId }, i) => ({
    entryId,
    eventId: "e1",
    heat: heat.number,
    lane,
    status: i === 2 ? "dq" : "ok",
    timeMs: i === 2 ? null : 25_000 + i * 1000,
    source: "manual",
    splitsMs: [],
    backupMs: null,
    buttonsMs: [],
    relayExchangesMs: [],
    ...(i === 2 ? { dqCode: "15" } : {}),
  }));
  return verifyHeat(meet, { eventId: "e1", heat: heat.number }, results, NOW);
}

export function samplePublication() {
  return buildHeatPublication(verifiedMeet(), "e1", 1);
}

export function testLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}
