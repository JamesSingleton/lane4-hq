import { describe, expect, it } from "vitest";
import {
  decodeHeader,
  decodeRace,
  type EncodeRaceInput,
  encodeRace,
  headerBytes,
  RaceDecodeError,
} from "../src/race";
import {
  decodePoolSetup,
  decodeSplitsSetup,
  encodePoolSetup,
  poolCourse,
} from "../src/setups";

const ALL = {
  backup: true,
  splits: true,
  individualButtons: true,
  relayJudging: false,
};

const DATE = {
  year: 2026,
  month: 9,
  day: 12,
  hours: 9,
  minutes: 41,
  seconds: 7,
  weekday: 6,
};

function race(overrides: Partial<EncodeRaceInput> = {}): EncodeRaceInput {
  return {
    event: 12,
    heat: 3,
    raceNumber: 58,
    date: DATE,
    raceLengths: 4,
    numberOfButtons: 3,
    includes: ALL,
    lanes: [
      {
        place: 1,
        splitsMs: [13_010, 27_450, 41_900, 56_120],
        buttonsMs: [56_300, 56_280, null],
        backupMs: 56_280,
      },
      {
        place: -1,
        splitsMs: [13_500, 28_000, 43_000, 58_000],
        buttonsMs: [58_200, 58_150, 58_300],
        backupMs: 58_150,
      },
      {
        place: 0,
        splitsMs: [null, null, null, null],
        buttonsMs: [null, null, null],
        backupMs: null,
      },
    ],
    ...overrides,
  };
}

describe("race header", () => {
  it("is 47 bytes with MAX_NUM_LANES = 10", () => {
    expect(headerBytes()).toBe(47);
    expect(headerBytes(12)).toBe(51);
  });

  it("decodes the header fields", () => {
    const header = decodeHeader(encodeRace(race()));
    expect(header).toEqual({
      event: 12,
      heat: 3,
      raceNumber: 58,
      date: DATE,
      raceLengths: 4,
      lanesInPool: 3,
      numTimesPerLane: 8,
      numberOfButtons: 3,
      includes: ALL,
    });
  });

  it("prefers event_16_bit when the event is above 255", () => {
    const data = encodeRace(race({ event: 412 }));
    expect(data[0]).toBe(0);
    expect(decodeHeader(data).event).toBe(412);
  });

  it("falls back to the two-digit year on old firmware", () => {
    const data = encodeRace(race());
    data[38] = 0;
    data[39] = 0;
    expect(decodeHeader(data).date?.year).toBe(2026);
    data[12] = 97;
    expect(decodeHeader(data).date?.year).toBe(1997);
  });

  it("returns a null date when the timer didn't set one", () => {
    expect(decodeHeader(encodeRace(race({ date: null }))).date).toBeNull();
  });

  it("rejects truncated headers", () => {
    expect(() => decodeHeader(new Uint8Array(10))).toThrow(RaceDecodeError);
  });

  it("honours a different MAX_NUM_LANES", () => {
    const data = encodeRace(race(), { maxNumLanes: 12 });
    expect(decodeRace(data, { maxNumLanes: 12 }).lanes).toHaveLength(3);
  });
});

describe("race lanes", () => {
  it("decodes places, splits, buttons, and backups", () => {
    const decoded = decodeRace(encodeRace(race()));
    expect(decoded.layoutWarning).toBeUndefined();
    expect(decoded.lanes[0]).toEqual({
      lane: 1,
      place: 1,
      status: "finished",
      finalMs: 56_120,
      splitsMs: [13_010, 27_450, 41_900, 56_120],
      buttonsMs: [56_300, 56_280, null],
      backupMs: 56_280,
      relayExchangesMs: [],
    });
    expect(decoded.lanes[1]!.status).toBe("dq");
    expect(decoded.lanes[1]!.place).toBe(-1);
    expect(decoded.lanes[2]).toMatchObject({
      status: "no-finish",
      finalMs: null,
      backupMs: null,
    });
  });

  it("decodes final-only races", () => {
    const decoded = decodeRace(
      encodeRace(
        race({
          includes: {
            backup: false,
            splits: false,
            individualButtons: false,
            relayJudging: false,
          },
          lanes: [{ place: 1, splitsMs: [30_000] }],
        }),
      ),
    );
    expect(decoded.lanes[0]).toMatchObject({
      finalMs: 30_000,
      splitsMs: [30_000],
      buttonsMs: [],
      backupMs: null,
    });
  });

  it("decodes buttons without splits", () => {
    const decoded = decodeRace(
      encodeRace(
        race({
          includes: { ...ALL, splits: false },
          lanes: [
            { place: 1, splitsMs: [30_000], buttonsMs: [1, 2, 3], backupMs: 2 },
          ],
        }),
      ),
    );
    expect(decoded.lanes[0]!.buttonsMs).toEqual([1, 2, 3]);
  });

  it("decodes signed relay exchanges", () => {
    const decoded = decodeRace(
      encodeRace(
        race({
          includes: { ...ALL, relayJudging: true },
          lanes: [
            {
              place: 1,
              splitsMs: [25_000, 50_000, 75_000, 100_000],
              buttonsMs: [1, 2, 3],
              backupMs: 100_100,
              relayExchangesMs: [120, -40, 310],
            },
          ],
        }),
      ),
    );
    expect(decoded.lanes[0]!.relayExchangesMs).toEqual([120, -40, 310]);
  });

  it("decodes a race with no lanes", () => {
    expect(decodeRace(encodeRace(race({ lanes: [] }))).lanes).toEqual([]);
    const junk = new Uint8Array(headerBytes() + 3);
    expect(() => decodeRace(junk)).toThrow(/0 lanes/);
  });

  it("infers the layout when num_times disagrees with the byte count", () => {
    const data = encodeRace(race());
    data[15] = 2;
    const decoded = decodeRace(data);
    expect(decoded.layoutWarning).toMatch(/inferred/);
    expect(decoded.lanes[0]!.finalMs).toBe(56_120);
  });

  it("infers relay exchanges when num_times is wrong", () => {
    const data = encodeRace(
      race({
        includes: { ...ALL, relayJudging: true },
        lanes: [
          {
            place: 1,
            splitsMs: [25_000, 50_000, 75_000, 100_000],
            buttonsMs: [1, 2, 3],
            backupMs: 100_100,
            relayExchangesMs: [120, -40, 310],
          },
        ],
      }),
    );
    data[15] = 99;
    expect(decodeRace(data).lanes[0]!.relayExchangesMs).toEqual([
      120, -40, 310,
    ]);
  });

  it("drops buttons when the count leaves no room for a split", () => {
    const data = encodeRace(
      race({
        numberOfButtons: 3,
        lanes: [{ place: 1, splitsMs: [30_000], buttonsMs: [], backupMs: 1 }],
      }),
    );
    expect(decodeRace(data).lanes[0]!.buttonsMs).toEqual([]);
  });

  it("fails loudly when bytes can't be explained", () => {
    const uneven = new Uint8Array(headerBytes() + 7);
    uneven[14] = 2;
    expect(() => decodeRace(uneven)).toThrow(/divide evenly/);

    const odd = new Uint8Array(headerBytes() + 4);
    odd[14] = 1;
    odd[15] = 1;
    expect(() => decodeRace(odd)).toThrow(/Can't split/);

    const buttonsNotRequested = new Uint8Array(headerBytes() + 9);
    buttonsNotRequested[14] = 1;
    buttonsNotRequested[15] = 2;
    expect(() => decodeRace(buttonsNotRequested)).toThrow(/Can't split/);

    // One time per lane can't be both a backup and a final.
    for (const splits of [0, 1]) {
      const backupOnly = new Uint8Array(headerBytes() + 5);
      backupOnly[2] = 1;
      backupOnly[3] = splits;
      backupOnly[14] = 1;
      backupOnly[15] = 1;
      expect(() => decodeRace(backupOnly)).toThrow(/Can't split/);
    }
  });
});

describe("setups", () => {
  it("round-trips the pool setup and maps it to a course", () => {
    const setup = {
      reverseLanes: true,
      lanesInPool: 10,
      farEndSplits: true,
      course: "long" as const,
      units: "meters" as const,
    };
    expect(decodePoolSetup(encodePoolSetup(setup))).toEqual(setup);
    expect(poolCourse(setup)).toBe("LCM");
    expect(poolCourse({ ...setup, course: "short" })).toBe("SCM");
    expect(poolCourse({ ...setup, course: "short", units: "yards" })).toBe(
      "SCY",
    );
    expect(() => decodePoolSetup(Uint8Array.of(1))).toThrow(/5 bytes/);
  });

  it("decodes the splits setup", () => {
    expect(decodeSplitsSetup(Uint8Array.of(1, 0))).toEqual({
      cumulativeSplits: true,
      byLapSplits: false,
    });
  });
});
