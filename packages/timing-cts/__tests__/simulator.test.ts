import { describe, expect, it } from "vitest";
import {
  CtsTimer,
  FULL_RACE_OPTIONS,
  type TimerTransport,
} from "../src/client";
import { TimerResponseError } from "../src/errors";
import { toHex } from "../src/frame";
import { createSimulator, seededRandom, simulateSwim } from "../src/simulator";

const NOW = new Date(2026, 8, 12, 9, 30, 0);

function setup(options: Parameters<typeof createSimulator>[0] = {}) {
  const sim = createSimulator({ now: () => NOW, ...options });
  return { sim, timer: new CtsTimer(sim) };
}

function runHeat(
  sim: ReturnType<typeof createSimulator>,
  event: number,
  heat: number,
) {
  return sim.runRace({
    event,
    heat,
    lengths: 2,
    lanes: [
      { lane: 1, finalMs: 31_000, splitsMs: [15_000], backupMs: 31_100 },
      { lane: 2, finalMs: 29_500, splitsMs: [14_200], backupMs: 29_600 },
      { lane: 3, finalMs: 30_000, dq: true },
    ],
  });
}

describe("CtsTimer against the simulator", () => {
  it("identifies the timer and reads setups", async () => {
    const { timer } = setup({ model: "system5", pool: { lanesInPool: 6 } });
    expect(await timer.whoAreYou()).toBe("SWIM 3.25");
    expect((await timer.poolSetup()).lanesInPool).toBe(6);
    expect(await timer.splitsSetup()).toEqual({
      cumulativeSplits: true,
      byLapSplits: false,
    });
    expect(await timer.selectedEventSequence()).toBe(0);
    expect(await timer.meetDate()).toMatchObject({
      year: 2026,
      month: 9,
      day: 12,
    });
  });

  it("uses per-model default versions and accepts overrides", async () => {
    expect(await setup({ model: "gen7" }).timer.whoAreYou()).toBe(
      "GEN7 SWIM 2026",
    );
    expect(await setup({ version: "CUSTOM" }).timer.whoAreYou()).toBe("CUSTOM");
  });

  it("reads a W reply with no NUL terminator", async () => {
    const transport: TimerTransport = {
      request: async () =>
        Uint8Array.from([..."ABC"].map((c) => c.charCodeAt(0))),
    };
    expect(await new CtsTimer(transport).whoAreYou()).toBe("ABC");
  });

  it("fetches races by number, event/heat, and pointer", async () => {
    const { sim, timer } = setup();
    expect(runHeat(sim, 5, 1)).toBe(1);
    expect(runHeat(sim, 5, 2)).toBe(2);
    expect(runHeat(sim, 301, 1)).toBe(3);

    const byNumber = await timer.race({ kind: "race", raceNumber: 2 });
    expect(byNumber.race).toMatchObject({ event: 5, heat: 2, raceNumber: 2 });
    expect(byNumber.race.lanes).toHaveLength(8);
    expect(byNumber.race.lanes[1]).toMatchObject({
      place: 1,
      finalMs: 29_500,
      splitsMs: [14_200, 29_500],
      backupMs: 29_600,
    });
    expect(byNumber.race.lanes[2]!.status).toBe("dq");
    expect(byNumber.raw.length).toBeGreaterThan(47);

    const byEvent = await timer.race({ kind: "event", event: 301, heat: 1 });
    expect(byEvent.race.raceNumber).toBe(3);
    const current = await timer.race({ kind: "current" });
    expect(current.race.raceNumber).toBe(3);
    const pointer = await timer.race({ kind: "pointer" }, {});
    expect(pointer.race.lanes[1]!.splitsMs).toEqual([29_500]);
  });

  it("walks races with L and N and errors past the ends", async () => {
    const { sim, timer } = setup();
    runHeat(sim, 1, 1);
    runHeat(sim, 1, 2);
    expect((await timer.race({ kind: "last" })).race.raceNumber).toBe(1);
    await expect(timer.race({ kind: "last" })).rejects.toThrow(
      TimerResponseError,
    );
    expect((await timer.race({ kind: "next" })).race.raceNumber).toBe(2);
    expect(await timer.raceIfPresent({ kind: "next" })).toBeNull();
  });

  it("reports no race on an empty meet", async () => {
    const { timer } = setup();
    await expect(timer.race({ kind: "pointer" })).rejects.toMatchObject({
      code: 50,
    });
    expect(
      await timer.raceIfPresent({ kind: "race", raceNumber: 9 }),
    ).toBeNull();
  });

  it("rethrows errors that aren't 'no race'", async () => {
    const { timer } = setup({ model: "gen7" });
    await expect(
      timer.raceIfPresent({ kind: "current" }),
    ).rejects.toMatchObject({
      code: 300,
    });
  });

  it("moves the meet pointer, wrapping on M- and stopping on M+", async () => {
    let clock = new Date(2026, 8, 12);
    const sim = createSimulator({ now: () => clock });
    const timer = new CtsTimer(sim);
    runHeat(sim, 1, 1);
    clock = new Date(2026, 8, 13);
    sim.powerOn();
    runHeat(sim, 1, 1);
    clock = new Date(2026, 8, 14);
    sim.powerOn();

    await expect(timer.nextMeet()).rejects.toMatchObject({ code: 51 });
    expect((await timer.previousMeet())?.day).toBe(13);
    expect((await timer.previousMeet())?.day).toBe(12);
    expect((await timer.previousMeet())?.day).toBe(14);
    expect((await timer.previousMeet())?.day).toBe(13);
    expect((await timer.nextMeet())?.day).toBe(14);
  });

  it("drops the oldest races past capacity", async () => {
    let clock = new Date(2026, 8, 12);
    const sim = createSimulator({ capacity: 2, now: () => clock });
    const timer = new CtsTimer(sim);
    runHeat(sim, 1, 1);
    clock = new Date(2026, 8, 13);
    sim.powerOn();
    runHeat(sim, 2, 1);
    runHeat(sim, 2, 2);
    expect(sim.raceCount).toBe(2);
    // The first meet lost its only race and is gone: M- wraps to itself.
    expect((await timer.previousMeet())?.day).toBe(13);

    runHeat(sim, 2, 3);
    expect(sim.raceCount).toBe(2);
    expect(
      await timer.raceIfPresent({ kind: "race", raceNumber: 1 }),
    ).toBeNull();
  });

  it("keeps the pointer in place when browsing older races", async () => {
    const sim = createSimulator({ capacity: 2, now: () => NOW });
    const timer = new CtsTimer(sim);
    runHeat(sim, 1, 1);
    runHeat(sim, 1, 2);
    await timer.race({ kind: "last" });
    runHeat(sim, 1, 3);
    expect((await timer.race({ kind: "pointer" })).race.raceNumber).toBe(2);
  });

  it("handles a meet removed before the pointer", async () => {
    let clock = new Date(2026, 8, 12);
    const sim = createSimulator({ capacity: 1, now: () => clock });
    runHeat(sim, 1, 1);
    clock = new Date(2026, 8, 13);
    sim.powerOn();
    runHeat(sim, 1, 1);
    expect(sim.raceCount).toBe(1);
  });

  it("sends individual buttons and relay exchanges only when they exist", async () => {
    const { sim, timer } = setup();
    const random = seededRandom(7);
    sim.runRace({
      event: 1,
      heat: 1,
      lengths: 8,
      lanes: [
        simulateSwim(4, 120_000, 8, random, 4),
        simulateSwim(5, 121_000, 8, random, 4),
      ],
    });
    const relay = await timer.race({ kind: "race", raceNumber: 1 });
    expect(relay.race.includes.relayJudging).toBe(true);
    expect(relay.race.lanes[3]!.relayExchangesMs).toHaveLength(3);
    expect(relay.race.lanes[0]!.relayExchangesMs).toEqual([0, 0, 0]);
    expect(relay.race.lanes[3]!.buttonsMs).toHaveLength(3);

    runHeat(sim, 2, 1);
    const individual = await timer.race({ kind: "race", raceNumber: 2 });
    expect(individual.race.includes.relayJudging).toBe(false);

    const single = setup({ numberOfButtons: 1 });
    runHeat(single.sim, 1, 1);
    const one = await single.timer.race({ kind: "pointer" }, FULL_RACE_OPTIONS);
    expect(one.race.includes.individualButtons).toBe(false);
  });

  it("answers unsupported commands with errors", async () => {
    const { sim } = setup({ latencyMs: 1 });
    expect(toHex(await sim.request(Uint8Array.of(0x49, 0x72, 7)))).toBe(
      "65 00",
    );
    expect(toHex(await sim.request(Uint8Array.of(0x52, 0x7a)))).toBe("2D 01");
    expect(toHex(await sim.request(Uint8Array.of(0x4d, 0x3f)))).toBe("2C 01");
    expect(toHex(await sim.request(Uint8Array.of(0x5a)))).toBe("2C 01");
    expect(sim.log).toHaveLength(4);
  });

  it("parses X and two-byte event selectors", async () => {
    const { sim } = setup();
    runHeat(sim, 301, 2);
    const reply = await sim.request(
      Uint8Array.of(0x53, 0x58, 0x45, 2, 0, 0x2d, 0x01),
    );
    expect(reply.length).toBeGreaterThan(2);
    const truncated = await sim.request(Uint8Array.of(0x53, 0x45));
    expect(toHex(truncated)).toBe("32 00");
    const truncatedRace = await sim.request(Uint8Array.of(0x53, 0x52));
    expect(toHex(truncatedRace)).toBe("32 00");
  });

  it("accepts ACK replies without throwing", async () => {
    const transport: TimerTransport = {
      request: async () => Uint8Array.of(6, 0),
    };
    const timer = new CtsTimer(transport);
    await expect(timer.selectedEventSequence()).resolves.toBe(6);
  });

  it("simulates plausible swims deterministically", () => {
    const a = simulateSwim(3, 60_000, 4, seededRandom(1));
    const b = simulateSwim(3, 60_000, 4, seededRandom(1));
    expect(a).toEqual(b);
    expect(a.finalMs).toBeGreaterThan(58_000);
    expect(a.finalMs).toBeLessThan(62_000);
    expect(a.splitsMs).toHaveLength(3);
    expect(a.relayExchangesMs).toBeUndefined();
  });

  it("uses the wall clock by default", async () => {
    const timer = new CtsTimer(createSimulator());
    expect((await timer.meetDate())?.year).toBe(new Date().getFullYear());
  });
});
