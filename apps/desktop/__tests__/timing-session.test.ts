import { addEvent, createMeet } from "@lane4hq/meet-engine/create";
import { addIndividualEntry } from "@lane4hq/meet-engine/entries";
import { seedEvent } from "@lane4hq/meet-engine/seeding";
import type { TimerTransport } from "@lane4hq/timing-cts/client";
import { createSimulator } from "@lane4hq/timing-cts/simulator";
import { describe, expect, it, vi } from "vitest";
import { simulateHeat } from "../src/lib/simulate-heat";
import {
  resumeCursor,
  type SessionStatus,
  TimingSession,
} from "../src/lib/timing-session";

const NOW = new Date(2026, 9, 25, 9, 0, 0);

function seededMeet() {
  let n = 0;
  const newId = () => `id-${++n}`;
  let meet = createMeet(
    { name: "Sim", course: "SCY", poolLanes: 6 },
    { newId, now: NOW },
  );
  meet = addEvent(
    meet,
    { number: 1, distance: 100, stroke: "free", gender: "female" },
    { newId, now: NOW },
  );
  meet = addEvent(
    meet,
    { number: 2, distance: 200, stroke: "free_relay", gender: "female" },
    { newId, now: NOW },
  );
  for (let i = 0; i < 4; i++) {
    meet = addIndividualEntry(
      meet,
      {
        eventId: meet.events[0]!.id,
        teamCode: "AAA",
        firstName: `S${i}`,
        lastName: "X",
        seedTimeMs: 60_000 + i * 500,
      },
      { newId, now: NOW },
    );
  }
  meet = {
    ...meet,
    entries: [
      ...meet.entries,
      {
        id: "relay",
        eventId: meet.events[1]!.id,
        teamCode: "AAA",
        seedTimeMs: null,
        exhibition: false,
        scratched: false,
        relay: { letter: "A", legAthleteIds: [] },
      },
    ],
  };
  meet = seedEvent(meet, meet.events[0]!.id, {}, NOW);
  return seedEvent(meet, meet.events[1]!.id, {}, NOW);
}

function manualTimers() {
  const queue: Array<() => void> = [];
  return {
    setTimer: (fn: () => void) => {
      queue.push(fn);
      return queue.length;
    },
    clearTimer: vi.fn(),
    queue,
  };
}

describe("TimingSession", () => {
  it("connects, polls new races, and advances the cursor", async () => {
    const sim = createSimulator({ now: () => NOW, pool: { lanesInPool: 6 } });
    const meet = seededMeet();
    const statuses: SessionStatus[] = [];
    const races: number[] = [];
    const timers = manualTimers();
    const session = new TimingSession({
      transport: sim,
      onRace: (r) => {
        races.push(r.race.raceNumber);
      },
      onStatus: (s) => statuses.push(s),
      maxPerTick: 2,
      ...timers,
    });
    const identity = await session.connect();
    expect(identity).toMatchObject({
      version: "SYS6 SWIM 1.110",
      pool: { lanesInPool: 6 },
    });
    expect(await session.latestRaceNumber()).toBeNull();

    simulateHeat(sim, meet, { eventId: meet.events[0]!.id, heat: 1 }, 1);
    simulateHeat(sim, meet, { eventId: meet.events[1]!.id, heat: 1 }, 2, {
      titled: false,
    });
    simulateHeat(sim, meet, { eventId: meet.events[0]!.id, heat: 1 }, 3);
    expect(await session.latestRaceNumber()).toBe(3);

    session.start();
    session.start();
    expect(timers.queue).toHaveLength(1);
    timers.queue.shift()!();
    await session.pollOnce();
    expect(races).toEqual([1, 2]);
    await session.pollOnce();
    expect(races).toEqual([1, 2, 3]);
    expect(session.current).toMatchObject({
      state: "connected",
      cursor: 3,
      polling: true,
    });

    session.setCursor(1);
    expect(
      (await session.fetchRace(2))?.race.lanes[0]?.relayExchangesMs,
    ).toHaveLength(3);
    session.stop();
    expect(timers.clearTimer).toHaveBeenCalled();
    session.disconnect();
    expect(session.current.state).toBe("idle");
    expect(statuses[0]!.state).toBe("connecting");
  });

  it("reports connection failures", async () => {
    const dead: TimerTransport = {
      request: () => Promise.reject(new Error("No answer")),
    };
    const session = new TimingSession({
      transport: dead,
      onRace: () => {},
      onStatus: () => {},
    });
    await expect(session.connect()).rejects.toThrow("No answer");
    expect(session.current).toEqual({ state: "error", message: "No answer" });
    await session.pollOnce();
    session.setCursor(4);
  });

  it("tolerates old firmware without setups and gives up after repeated failures", async () => {
    const sim = createSimulator({ now: () => NOW });
    let fail = false;
    const transport: TimerTransport = {
      request: async (data) => {
        if (fail)
          throw { kind: "timeout", message: "The timer didn't answer." };
        if (data[0] === 0x52) return Uint8Array.of(0x2d, 0x01);
        return sim.request(data);
      },
    };
    const session = new TimingSession({
      transport,
      onRace: () => {},
      onStatus: () => {},
      maxFailures: 2,
      describeError: (e) => (e as { message: string }).message,
      ...manualTimers(),
    });
    expect((await session.connect(7)).pool).toBeNull();
    fail = true;
    await session.pollOnce();
    expect(session.current).toMatchObject({
      state: "connected",
      error: "The timer didn't answer.",
      cursor: 7,
    });
    await session.pollOnce();
    expect(session.current).toEqual({
      state: "error",
      message: "The timer didn't answer.",
    });
  });

  it("schedules the next poll after each tick", async () => {
    const sim = createSimulator({ now: () => NOW });
    const timers = manualTimers();
    const session = new TimingSession({
      transport: sim,
      onRace: () => {},
      onStatus: () => {},
      ...timers,
    });
    await session.connect();
    session.start();
    timers.queue.shift()!();
    await vi.waitFor(() => expect(timers.queue).toHaveLength(1));
    session.stop();
    timers.queue.shift()!();
    await session.pollOnce();
  });

  it("uses real timers by default", async () => {
    vi.useFakeTimers();
    const sim = createSimulator({ now: () => NOW });
    const session = new TimingSession({
      transport: sim,
      onRace: () => {},
      onStatus: () => {},
    });
    await session.connect();
    session.start();
    await vi.advanceTimersByTimeAsync(10);
    session.stop();
    vi.useRealTimers();
  });

  it("resumes after the last race captured from today's timer meet", () => {
    const d = (day: number) => ({
      year: 2026,
      month: 10,
      day,
      hours: 9,
      minutes: 0,
      seconds: 0,
      weekday: 0,
    });
    const captures = [
      { race: { raceNumber: 4, date: d(25) } },
      { race: { raceNumber: 9, date: d(24) } },
      { race: { raceNumber: 2, date: null } },
    ];
    expect(resumeCursor(captures, d(25))).toBe(4);
    expect(resumeCursor(captures, null)).toBe(0);
  });

  it("refuses to simulate unseeded heats", () => {
    const sim = createSimulator();
    expect(() =>
      simulateHeat(sim, seededMeet(), { eventId: "nope", heat: 1 }),
    ).toThrow(/isn't seeded/);
  });
});
