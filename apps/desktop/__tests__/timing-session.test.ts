import { addEvent, createMeet } from "@lane4hq/meet-engine/create";
import { addIndividualEntry } from "@lane4hq/meet-engine/entries";
import { seedEvent } from "@lane4hq/meet-engine/seeding";
import type { TimerTransport } from "@lane4hq/timing-cts/client";
import { encodeErrorCode } from "@lane4hq/timing-cts/errors";
import { createSimulator } from "@lane4hq/timing-cts/simulator";
import { describe, expect, it, vi } from "vitest";
import { simulateHeat } from "../src/lib/simulate-heat";
import {
  resumePoint,
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
    expect(await session.latestRace()).toBeNull();

    simulateHeat(sim, meet, { eventId: meet.events[0]!.id, heat: 1 }, 1);
    simulateHeat(sim, meet, { eventId: meet.events[1]!.id, heat: 1 }, 2, {
      titled: false,
    });
    simulateHeat(sim, meet, { eventId: meet.events[0]!.id, heat: 1 }, 3);
    expect((await session.latestRace())?.raceNumber).toBe(3);

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

  it("resumes after the last race captured since the timer's meet began", () => {
    const d = (day: number, hours = 9) => ({
      year: 2026,
      month: 10,
      day,
      hours,
      minutes: 0,
      seconds: 0,
      weekday: 0,
    });
    const captures = [
      { race: { raceNumber: 4, date: d(25, 10) } },
      { race: { raceNumber: 3, date: d(25, 9) } },
      { race: { raceNumber: 9, date: d(24) } },
      { race: { raceNumber: 2, date: null } },
    ];
    expect(resumePoint(captures, d(25))).toEqual({
      cursor: 4,
      anchor: captures[0]!.race,
    });
    expect(resumePoint(captures, null)).toEqual({ cursor: 0, anchor: null });
  });

  it("doesn't resume across a power cycle on the same day", () => {
    const at = (hours: number) => ({
      year: 2026,
      month: 10,
      day: 25,
      hours,
      minutes: 0,
      seconds: 0,
      weekday: 0,
    });
    const morning = [{ race: { raceNumber: 40, date: at(9) } }];
    expect(resumePoint(morning, at(13)).cursor).toBe(0);
  });

  it("connects to a timer that has no meet to report yet", async () => {
    const sim = createSimulator({ now: () => NOW, pool: { lanesInPool: 6 } });
    const transport: TimerTransport = {
      request: (data) =>
        data[0] === 0x54
          ? Promise.resolve(encodeErrorCode(50))
          : sim.request(data),
    };
    const session = new TimingSession({
      transport,
      onRace: () => {},
      onStatus: () => {},
    });
    const identity = await session.connect();
    expect(identity.meetDate).toBeNull();
    expect(session.current.state).toBe("connected");
  });

  it("pulls races when the lowest numbers are gone from the timer", async () => {
    const sim = createSimulator({
      now: () => NOW,
      capacity: 2,
      pool: { lanesInPool: 6 },
    });
    for (let i = 0; i < 4; i++) {
      sim.runRace({ lengths: 2, lanes: [{ lane: 1, finalMs: 60_000 + i }] });
    }
    const races: number[] = [];
    const session = new TimingSession({
      transport: sim,
      onRace: (r) => {
        races.push(r.race.raceNumber);
      },
      onStatus: () => {},
    });
    await session.connect();
    await session.pollOnce();
    expect(races).toEqual([3, 4]);
    expect(session.current).toMatchObject({ cursor: 4 });
    await session.pollOnce();
    expect(races).toEqual([3, 4]);
  });

  it("follows the timer into a new meet after a power cycle", async () => {
    let now = NOW;
    const sim = createSimulator({ now: () => now, pool: { lanesInPool: 6 } });
    const run = () =>
      sim.runRace({ lengths: 2, lanes: [{ lane: 1, finalMs: 60_000 }] });
    run();
    run();
    const races: Array<[number, number]> = [];
    const session = new TimingSession({
      transport: sim,
      onRace: (r) => {
        races.push([r.race.raceNumber, r.race.date!.hours]);
      },
      onStatus: () => {},
    });
    await session.connect();
    await session.pollOnce();
    expect(session.current).toMatchObject({ cursor: 2 });

    now = new Date(2026, 9, 25, 13, 0, 0);
    sim.powerOn();
    run();
    await session.pollOnce();
    expect(races).toEqual([
      [1, 9],
      [2, 9],
      [1, 13],
    ]);
    expect(session.current).toMatchObject({
      cursor: 1,
      identity: { meetDate: { hours: 13 } },
    });
  });

  it("pulls a race again if storing it failed", async () => {
    const sim = createSimulator({ now: () => NOW, pool: { lanesInPool: 6 } });
    sim.runRace({ lengths: 2, lanes: [{ lane: 1, finalMs: 60_000 }] });
    const stored: number[] = [];
    let broken = true;
    const session = new TimingSession({
      transport: sim,
      onRace: (r) => {
        if (broken) throw new Error("Couldn't store the race");
        stored.push(r.race.raceNumber);
      },
      onStatus: () => {},
    });
    await session.connect();
    await session.pollOnce();
    expect(session.current).toMatchObject({ cursor: 0 });
    broken = false;
    await session.pollOnce();
    expect(stored).toEqual([1]);
    expect(session.current).toMatchObject({ cursor: 1, error: null });
  });

  it("stops cleanly if the race found by pointer has gone", async () => {
    const sim = createSimulator({ now: () => NOW, pool: { lanesInPool: 6 } });
    sim.runRace({ lengths: 2, lanes: [{ lane: 1, finalMs: 60_000 }] });
    sim.runRace({ lengths: 2, lanes: [{ lane: 1, finalMs: 60_000 }] });
    const isRaceTwoPull = (data: Uint8Array) =>
      data[0] === 0x53 && data.length > 4 && data[data.length - 2] === 2;
    const transport: TimerTransport = {
      request: (data) =>
        isRaceTwoPull(data)
          ? Promise.resolve(encodeErrorCode(50))
          : sim.request(data),
    };
    const races: number[] = [];
    const session = new TimingSession({
      transport,
      onRace: (r) => {
        races.push(r.race.raceNumber);
      },
      onStatus: () => {},
    });
    await session.connect();
    session.setCursor(1);
    await session.pollOnce();
    expect(races).toEqual([]);
    expect(session.current).toMatchObject({ cursor: 1, error: null });
  });

  it("leaves the status alone if the session drops during a meet check", async () => {
    let session: TimingSession;
    const sim = createSimulator({ now: () => NOW, pool: { lanesInPool: 6 } });
    let dropOnTime = false;
    const transport: TimerTransport = {
      request: (data) => {
        if (data[0] === 0x54 && dropOnTime) session.disconnect();
        return sim.request(data);
      },
    };
    session = new TimingSession({
      transport,
      onRace: () => {},
      onStatus: () => {},
    });
    await session.connect();
    session.setCursor(7, { raceNumber: 7, date: null });
    dropOnTime = true;
    await session.pollOnce();
    expect(session.current.state).toBe("idle");
  });

  it("pauses polling for a timer test and carries on after", async () => {
    const sim = createSimulator({ now: () => NOW, pool: { lanesInPool: 6 } });
    sim.runRace({ lengths: 2, lanes: [{ lane: 1, finalMs: 60_000 }] });
    const timers = manualTimers();
    const session = new TimingSession({
      transport: sim,
      onRace: () => {},
      onStatus: () => {},
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });
    await session.connect();
    session.start();
    const report = await session.diagnose({ sleep: async () => {} });
    expect(report.version).toBe("SYS6 SWIM 1.110");
    expect(session.current).toMatchObject({ polling: true });

    session.stop();
    await session.diagnose({ sleep: async () => {} });
    expect(session.current).toMatchObject({ polling: false });
  });

  it("keeps the meet when the race it stands on is unchanged", async () => {
    const sim = createSimulator({ now: () => NOW, pool: { lanesInPool: 6 } });
    const number = sim.runRace({
      lengths: 2,
      lanes: [{ lane: 1, finalMs: 60_000 }],
    });
    const session = new TimingSession({
      transport: sim,
      onRace: () => {},
      onStatus: () => {},
    });
    await session.connect();
    const newest = await session.latestRace();
    session.setCursor(number, newest);
    await session.pollOnce();
    expect(session.current).toMatchObject({ cursor: number });
  });

  it("describes a non-error rejection and stops polling if the session drops", async () => {
    const sim = createSimulator({ now: () => NOW });
    let mode: "ok" | "string" | "drop" = "ok";
    const session = new TimingSession({
      transport: {
        request: async (data) => {
          if (mode === "string") return Promise.reject("nope");
          if (mode === "drop") {
            session.disconnect();
            throw new Error("dropped");
          }
          return sim.request(data);
        },
      },
      onRace: () => {},
      onStatus: () => {},
    });
    mode = "string";
    await expect(session.connect()).rejects.toBe("nope");
    expect(session.current).toEqual({ state: "error", message: "nope" });

    mode = "ok";
    await session.connect();
    mode = "drop";
    await session.pollOnce();
    expect(session.current.state).toBe("idle");
  });

  it("uses the default failure limit and skips the cursor update after disconnect", async () => {
    const sim = createSimulator({ now: () => NOW });
    const meet = seededMeet();
    let fail = false;
    const session = new TimingSession({
      transport: {
        request: async (data) => {
          if (fail) throw new Error("lost");
          return sim.request(data);
        },
      },
      onRace: () => {
        session.disconnect();
      },
      onStatus: () => {},
    });
    await session.connect();
    simulateHeat(sim, meet, { eventId: meet.events[0]!.id, heat: 1 }, 1);
    await session.pollOnce();
    expect(session.current.state).toBe("idle");

    await session.connect();
    fail = true;
    for (let i = 0; i < 4; i++) await session.pollOnce();
    expect(session.current).toMatchObject({
      state: "connected",
      error: "lost",
    });
    await session.pollOnce();
    expect(session.current).toEqual({ state: "error", message: "lost" });
  });

  it("refuses to simulate unseeded heats", () => {
    const sim = createSimulator();
    expect(() =>
      simulateHeat(sim, seededMeet(), { eventId: "nope", heat: 1 }),
    ).toThrow(/isn't seeded/);
  });
});
