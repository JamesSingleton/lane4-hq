import { describe, expect, it } from "vitest";
import { CtsTimer, type TimerTransport } from "../src/client";
import {
  isReadSplitsSetup,
  isSafeToResend,
  readSetups,
  swimData,
} from "../src/commands";
import { encodeErrorCode, replyErrorCode } from "../src/errors";
import { fromHex, toHex } from "../src/frame";
import {
  decodeHeader,
  decodeRace,
  type EncodeLane,
  type EncodeRaceInput,
  encodeRace,
  headerBytes,
  maxLanesFromHeader,
} from "../src/race";
import { createSimulator } from "../src/simulator";

const NO_RACE = encodeErrorCode(50);
const NUM_TIMES_AT = 15;

const ALL = {
  backup: true,
  splits: true,
  individualButtons: true,
  relayJudging: true,
};

function bare(raceNumber: number, overrides: Partial<EncodeRaceInput> = {}) {
  return encodeRace({
    event: 1,
    heat: 1,
    raceNumber,
    raceLengths: 2,
    includes: { ...ALL, individualButtons: false, relayJudging: false },
    lanes: [],
    ...overrides,
  });
}

/** Answers by command hex; anything unlisted is "no such race". */
function scripted(replies: Record<string, Uint8Array | Error>): TimerTransport {
  return {
    async request(data) {
      const reply = replies[toHex(data)] ?? NO_RACE;
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

describe("resending commands", () => {
  it("never resends a command that moves a pointer", () => {
    for (const hex of ["4D 2B", "4D 2D", "53 4C", "53 4E", "53 42 53 4E"]) {
      expect(isSafeToResend(fromHex(hex))).toBe(false);
    }
  });

  it("resends reads, even when an argument looks like a command letter", () => {
    expect(isSafeToResend(swimData())).toBe(true);
    expect(isSafeToResend(readSetups("i"))).toBe(true);
    expect(isSafeToResend(fromHex("57"))).toBe(true);
    expect(isSafeToResend(fromHex("54"))).toBe(true);
    expect(isSafeToResend(swimData({ kind: "race", raceNumber: 0x4e4c }))).toBe(
      true,
    );
    expect(
      isSafeToResend(swimData({ kind: "event", event: 0x4c, heat: 0x4e })),
    ).toBe(true);
  });

  it("still recognises the padded Rg command", () => {
    expect(isReadSplitsSetup(readSetups("g"))).toBe(true);
    expect(isReadSplitsSetup(readSetups("i"))).toBe(false);
  });
});

describe("worked example reads", () => {
  it("reads the selected event sequence from `05 00 07 F3 FF`", async () => {
    const timer = new CtsTimer(scripted({ "52 72 00": fromHex("07") }));
    expect(await timer.selectedEventSequence()).toBe(7);
  });
});

describe("two-byte replies", () => {
  it("reads the Rg booleans, including ones that look like old errors", async () => {
    for (const [reply, cumulative, byLap] of [
      ["00 00", false, false],
      ["01 00", true, false],
      ["00 01", false, true],
      ["01 01", true, true],
    ] as const) {
      const timer = new CtsTimer(scripted({ "52 67 00 00": fromHex(reply) }));
      expect(await timer.splitsSetup()).toEqual({
        cumulativeSplits: cumulative,
        byLapSplits: byLap,
      });
    }
  });

  it("treats anything else from Rg as the error it is", async () => {
    const timer = new CtsTimer(
      scripted({ "52 67 00 00": encodeErrorCode(301) }),
    );
    await expect(timer.splitsSetup()).rejects.toMatchObject({ code: 301 });
  });

  it("doesn't call an ACK an error", () => {
    expect(replyErrorCode(fromHex("57"), fromHex("06 00"))).toBeNull();
    expect(replyErrorCode(fromHex("57"), fromHex("32 00"))).toBe(50);
    expect(replyErrorCode(fromHex("57"), fromHex("32"))).toBeNull();
  });
});

describe("MAX_NUM_LANES", () => {
  it("is implied by the length of a bare header", () => {
    expect(maxLanesFromHeader(47)).toBe(10);
    expect(maxLanesFromHeader(headerBytes(12))).toBe(12);
    expect(maxLanesFromHeader(46)).toBeNull();
    expect(maxLanesFromHeader(2)).toBeNull();
    expect(maxLanesFromHeader(headerBytes(40))).toBeNull();
  });

  it("is learned from `T` and used to decode races", async () => {
    const options = { maxNumLanes: 12 };
    const date = {
      year: 2026,
      month: 11,
      day: 5,
      hours: 8,
      minutes: 0,
      seconds: 0,
      weekday: 4,
    };
    const lane: EncodeLane = { place: 1, splitsMs: [30_000, 60_000] };
    const timer = new CtsTimer(
      scripted({
        "54": encodeRace(
          {
            event: 0,
            heat: 0,
            raceNumber: 0,
            date,
            raceLengths: 0,
            includes: { ...ALL, backup: false, splits: false },
            lanes: [],
          },
          options,
        ),
        "53 53 52 01 00": encodeRace(
          {
            event: 4,
            heat: 2,
            raceNumber: 1,
            date,
            raceLengths: 2,
            includes: {
              backup: false,
              splits: true,
              individualButtons: false,
              relayJudging: false,
            },
            lanes: [lane],
          },
          options,
        ),
      }),
    );
    expect((await timer.meetDate())?.year).toBe(2026);
    const { race } = await timer.race(
      { kind: "race", raceNumber: 1 },
      { splits: true },
    );
    expect(race.event).toBe(4);
    expect(race.lanes[0]?.finalMs).toBe(60_000);
    expect(
      (await timer.race({ kind: "race", raceNumber: 1 }, { splits: true }))
        .maxNumLanes,
    ).toBe(12);
  });

  it("keeps a width the caller fixed", async () => {
    const timer = new CtsTimer(
      scripted({ "54": new Uint8Array(headerBytes(12)), "53": bare(6) }),
      { maxNumLanes: 10 },
    );
    await timer.meetDate();
    const { race } = await timer.race({ kind: "pointer" }, {});
    expect(race.raceNumber).toBe(6);
  });
});

describe("`T` on a timer with nothing stored", () => {
  it("resolves null instead of failing the connection", async () => {
    const timer = new CtsTimer(scripted({}));
    expect(await timer.meetDate()).toBeNull();
  });

  it("still reports a transport failure", async () => {
    const timer = new CtsTimer(scripted({ "54": new Error("gone") }));
    await expect(timer.meetDate()).rejects.toThrow("gone");
  });
});

describe("event numbers", () => {
  const tail = 16 + 2 * 11;
  function withEvents(event8: number, event16: number) {
    const data = bare(1);
    data[0] = event8;
    data[tail + 4] = event16 & 0xff;
    data[tail + 5] = event16 >> 8;
    return decodeHeader(data).event;
  }

  it("uses event_16_bit above 255", () => {
    expect(withEvents(0, 301)).toBe(301);
    expect(withEvents(12, 12)).toBe(12);
    expect(withEvents(0, 0)).toBe(0);
  });

  it("ignores the reserved bytes on firmware before v3.1", () => {
    expect(withEvents(12, 0x7777)).toBe(12);
    expect(withEvents(0, 0xffff)).toBe(0);
  });
});

describe("num_times_for_each_lane and individual buttons", () => {
  const SPLITS = [15_000, 31_000, 47_000, 63_000, 79_000, 95_000, 111_000];
  const FINAL = 127_000;

  function eightLengths(exchanges: number[]): EncodeRaceInput {
    const lane = (place: number, offset: number): EncodeLane => ({
      place,
      splitsMs: [...SPLITS, FINAL].map((t) => t + offset),
      buttonsMs: [127_200, 127_250, 127_300].map((t) => t + offset),
      backupMs: 127_250 + offset,
      relayExchangesMs: exchanges,
    });
    return {
      event: 3,
      heat: 1,
      raceNumber: 9,
      raceLengths: 8,
      numberOfButtons: 3,
      includes: ALL,
      lanes: [lane(1, 0), lane(2, 700)],
    };
  }

  it("decodes a timer that counts the buttons", () => {
    const race = decodeRace(encodeRace(eightLengths([120, -10, 80])));
    expect(race.numTimesPerLane).toBe(12);
    expect(race.lanes[0]?.finalMs).toBe(FINAL);
    expect(race.layoutWarning).toBeUndefined();
  });

  it("decodes a timer that leaves the buttons out of the count", () => {
    const data = encodeRace(eightLengths([120, -10, 80]));
    data[NUM_TIMES_AT] = 9; // 8 splits and the backup.
    const race = decodeRace(data);
    expect(race.lanes[0]?.finalMs).toBe(FINAL);
    expect(race.lanes[1]?.finalMs).toBe(FINAL + 700);
    expect(race.lanes[0]?.splitsMs).toHaveLength(8);
    expect(race.lanes[0]?.buttonsMs).toEqual([127_200, 127_250, 127_300]);
    expect(race.lanes[0]?.backupMs).toBe(127_250);
    expect(race.lanes[0]?.relayExchangesMs).toEqual([120, -10, 80]);
    expect(race.layoutWarning).toBeUndefined();
  });

  it("does the same with no exchanges, on an individual race", () => {
    const data = encodeRace(eightLengths([]));
    data[NUM_TIMES_AT] = 9;
    const race = decodeRace(data);
    expect(race.lanes[0]?.finalMs).toBe(FINAL);
    expect(race.lanes[0]?.relayExchangesMs).toEqual([]);
  });

  it("warns when the race can't settle which count it is", () => {
    const data = encodeRace({ ...eightLengths([50]), raceLengths: 99 });
    data[NUM_TIMES_AT] = 9;
    expect(decodeRace(data).layoutWarning).toContain("two lane layouts");
  });

  it("prefers a layout whose splits rise", () => {
    const input = eightLengths([120, -10, 80]);
    const scrambled = input.lanes.map((lane) => ({
      ...lane,
      splitsMs: [...lane.splitsMs].reverse(),
    }));
    const data = encodeRace({ ...input, lanes: scrambled });
    expect(decodeRace(data).lanes[0]?.finalMs).toBe(SPLITS[0]);
  });
});

describe("finding races by pointer", () => {
  function fiveRaces(capacity: number) {
    const sim = createSimulator({ capacity, pool: { lanesInPool: 6 } });
    for (let i = 0; i < 5; i++) {
      sim.runRace({ lengths: 2, lanes: [{ lane: 1, finalMs: 60_000 + i }] });
    }
    return sim;
  }

  it("finds the first race when the lowest numbers were discarded", async () => {
    const timer = new CtsTimer(fiveRaces(3));
    expect(await timer.raceIfPresent({ kind: "race", raceNumber: 1 })).toBe(
      null,
    );
    expect(await timer.nextRaceAfter(0)).toBe(3);
  });

  it("walks back to the lowest number above the cursor", async () => {
    expect(await new CtsTimer(fiveRaces(5)).nextRaceAfter(3)).toBe(4);
  });

  it("walks forward from a pointer behind the cursor", async () => {
    const timer = new CtsTimer(fiveRaces(5));
    for (let i = 0; i < 4; i++) await timer.race({ kind: "last" }, {});
    expect(await timer.nextRaceAfter(4)).toBe(5);
  });

  it("resolves null at the newest race", async () => {
    expect(await new CtsTimer(fiveRaces(5)).nextRaceAfter(5)).toBeNull();
  });

  it("stops at maxSteps without skipping a race", async () => {
    const timer = new CtsTimer(fiveRaces(5));
    expect(await timer.nextRaceAfter(0, 2)).toBeNull();
    expect(await timer.nextRaceAfter(0, 40)).toBe(1);
  });

  it("stops if the pointer wraps from oldest to newest", async () => {
    const timer = new CtsTimer(scripted({ "53": bare(3), "53 4C": bare(9) }));
    expect(await timer.nextRaceAfter(0)).toBe(3);
  });

  it("tries the next race when the pointer has none", async () => {
    const timer = new CtsTimer(scripted({ "53 4E": bare(4) }));
    await expect(timer.nextRaceAfter(9)).resolves.toBeNull();
    const fresh = new CtsTimer(
      scripted({ "53 4E": bare(4), "53 4C": NO_RACE }),
    );
    expect(await fresh.nextRaceAfter(0)).toBe(4);
  });

  it("resolves null on an empty meet", async () => {
    expect(await new CtsTimer(scripted({})).nextRaceAfter(0)).toBeNull();
  });

  it("reports a lost connection instead of finding nothing", async () => {
    const timer = new CtsTimer(scripted({ "53": new Error("gone") }));
    await expect(timer.nextRaceAfter(0)).rejects.toThrow("gone");
  });

  it("finds the newest race wherever the pointer starts", async () => {
    const timer = new CtsTimer(fiveRaces(5));
    for (let i = 0; i < 4; i++) await timer.race({ kind: "last" }, {});
    expect((await timer.newestRace())?.raceNumber).toBe(5);
    expect((await timer.newestRace(0))?.raceNumber).toBe(5);
  });

  it("resolves null for the newest race of an empty meet", async () => {
    expect(await new CtsTimer(scripted({})).newestRace()).toBeNull();
  });
});
