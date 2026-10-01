import { parseMeetFilesFromBytes } from "@lane4hq/swim-formats/meet";
import { CtsTimer } from "@lane4hq/timing-cts/client";
import {
  createSimulator,
  seededRandom,
  simulateSwim,
} from "@lane4hq/timing-cts/simulator";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { addCapture, reviewCapture, verifyHeat } from "../src/adjudicate";
import { createMeetFromEventFile } from "../src/create";
import { detectTeam, mergeTeamEntries } from "../src/entries";
import {
  exportAllTeamResults,
  exportResultsCsv,
  exportTeamResults,
} from "../src/export";
import { eventLengths } from "../src/labels";
import type { Meet } from "../src/model";
import {
  buildHeatPublication,
  markPublished,
  publishQueue,
} from "../src/publish";
import { heatsForEvent, seedAllEvents } from "../src/seeding";
import { eventProgress, eventStandings, teamScores } from "../src/standings";
import { counterIds, fixture, NOW } from "./helpers";

async function runEvent(
  meet: Meet,
  eventNumber: number,
  timer: CtsTimer,
  sim: ReturnType<typeof createSimulator>,
  seed: number,
) {
  const event = meet.events.find((e) => e.number === eventNumber)!;
  const random = seededRandom(seed);
  let next = meet;
  for (const heat of heatsForEvent(next, event.id)) {
    const entries = new Map(next.entries.map((e) => [e.id, e]));
    const lengths = eventLengths(event, next.course);
    sim.runRace({
      event: event.number,
      heat: heat.number,
      lengths,
      lanes: heat.lanes.map((l) =>
        simulateSwim(
          l.lane,
          entries.get(l.entryId)!.seedTimeMs ?? 35_000,
          lengths,
          random,
          event.isRelay ? 4 : 1,
        ),
      ),
    });
    const pulled = await timer
      .race({ kind: "last" })
      .catch(() => timer.race({ kind: "pointer" }));
    const latest = await timer.race({
      kind: "race",
      raceNumber: pulled.race.raceNumber,
    });
    const added = addCapture(
      next,
      { ...latest, timerVersion: sim.version },
      { now: NOW, newId: counterIds(`cap-${event.number}-${heat.number}`) },
    );
    next = added.meet;
    const review = reviewCapture(next, added.capture);
    next = verifyHeat(
      next,
      review,
      review.lanes.flatMap((l) => (l.result ? [l.result] : [])),
      NOW,
    );
  }
  return next;
}

describe("running a meet end to end", () => {
  it("imports, seeds, times, verifies, scores, exports, and publishes", async () => {
    const newId = counterIds();
    let meet = createMeetFromEventFile(
      fixture("sonoran-events.ev3"),
      { poolLanes: 6 },
      { newId, now: NOW },
    );
    expect(meet.events.length).toBeGreaterThan(10);

    const mari = fixture("mari-entries.hy3");
    const team = detectTeam(
      mari,
      "MARI-AZ-Entries-2025 Sonoran Desert Invitational-25Oct2025-001.HY3",
    );
    expect(team.code).toBe("MARI");
    const merged = mergeTeamEntries(meet, mari, team, { newId, now: NOW });
    meet = merged.meet;
    expect(merged.summary.added).toBeGreaterThan(0);
    expect(meet.teams.map((t) => t.code)).toEqual(["MARI"]);

    meet = seedAllEvents(meet, {}, NOW);
    const seeded = meet.events.filter(
      (e) => eventProgress(meet, e.id).state === "seeded",
    );
    expect(seeded.length).toBeGreaterThan(0);

    const sim = createSimulator({ pool: { lanesInPool: 6 }, now: () => NOW });
    const timer = new CtsTimer(sim);
    const target = seeded.find((e) => !e.isRelay)!;
    meet = await runEvent(meet, target.number, timer, sim, 42);

    expect(eventProgress(meet, target.id).state).toBe("complete");
    const standings = eventStandings(meet, target.id);
    expect(standings[0]!.place).toBe(1);
    expect(teamScores(meet)[0]!.points).toBeGreaterThan(0);

    // Export → re-import round trip.
    const pack = exportTeamResults(meet, "MARI");
    expect(pack.filename).toMatch(/^MARI-AZ-Results-/);
    const files = unzipSync(pack.bytes);
    const names = Object.keys(files);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/\.hy3$/);
    const hy3Name = names.find((n) => n.endsWith(".hy3"))!;
    const reparsed = parseMeetFilesFromBytes([
      { filename: hy3Name, bytes: files[hy3Name]! },
    ]);
    const reResults = reparsed.results.filter(
      (r) => r.eventNumber === target.number,
    );
    expect(reResults).toHaveLength(
      standings.filter((r) => r.result.status !== "ns").length,
    );
    const winner = reResults.find((r) => r.place === 1)!;
    expect(winner).toBeDefined();

    const all = exportAllTeamResults(meet);
    expect(
      Object.keys(unzipSync(all.bytes)).every((n) => n.startsWith("MARI/")),
    ).toBe(true);
    const csv = new TextDecoder().decode(exportResultsCsv(meet).bytes);
    expect(csv.split("\r\n")[0]).toMatch(/^Event,Event name,Heat/);

    // Publishing: one queued publication per verified heat.
    const queue = publishQueue(meet);
    expect(queue).toHaveLength(heatsForEvent(meet, target.id).length);
    const pub = buildHeatPublication(meet, queue[0]!.eventId, queue[0]!.heat);
    expect(pub.idempotencyKey).toBe(`${meet.id}:${target.number}:1:r1`);
    expect(pub.lanes.length).toBeGreaterThan(0);
    meet = markPublished(meet, queue[0]!.key, pub.revision, NOW);
    expect(publishQueue(meet)).toHaveLength(queue.length - 1);
  });

  it("times a relay event with exchanges", async () => {
    const newId = counterIds();
    let meet = createMeetFromEventFile(
      fixture("croswhite-2026-events.ev3"),
      {},
      { newId, now: NOW },
    );
    const ctcc = fixture("ctcc-entries.hy3");
    // Croswhite relays are events 1/2; point the CTCC pack at them.
    const relays = (ctcc.relays ?? [])
      .slice(0, 2)
      .map((r) => ({ ...r, eventNumber: 2 }));
    meet = mergeTeamEntries(
      meet,
      { ...ctcc, entries: [], events: [], relays },
      { code: "CTCC", name: "CTCC" },
      { newId, now: NOW },
    ).meet;
    meet = seedAllEvents(meet, {}, NOW);
    const sim = createSimulator({ now: () => NOW });
    meet = await runEvent(meet, 2, new CtsTimer(sim), sim, 9);
    const event = meet.events.find((e) => e.number === 2)!;
    const rows = eventStandings(meet, event.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.result.relayExchangesMs).toHaveLength(3);
    const pub = buildHeatPublication(meet, event.id, 1);
    expect(pub.lanes[0]!.relay?.legs).toHaveLength(4);
    const parsed = parseMeetFilesFromBytes([
      {
        filename: "r.hy3",
        bytes: unzipSync(exportTeamResults(meet, "CTCC").bytes)[
          Object.keys(unzipSync(exportTeamResults(meet, "CTCC").bytes)).find(
            (n) => n.endsWith(".hy3"),
          )!
        ]!,
      },
    ]);
    expect(parsed.relays?.some((r) => (r.results?.length ?? 0) > 0)).toBe(true);
  });
});
