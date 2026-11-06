import { describe, expect, it } from "vitest";
import type { TimerTransport } from "../src/client";
import {
  type DiagnosticOptions,
  diagnoseTimer,
  diagnosticFilename,
  MANUAL_CHECKS,
} from "../src/diagnostics";
import { encodeErrorCode } from "../src/errors";
import { toHex } from "../src/frame";
import {
  type EncodeRaceInput,
  encodeRace,
  headerBytes,
  type TimerDate,
} from "../src/race";
import { createSimulator, type SimRaceInput } from "../src/simulator";

const NOW = new Date(2026, 10, 5, 9, 0, 0);
const OPTIONS: DiagnosticOptions = {
  now: () => NOW.getTime(),
  sleep: async () => {},
};
const NO_RACE = encodeErrorCode(50);

const SWIM: SimRaceInput = {
  event: 4,
  heat: 2,
  lengths: 4,
  lanes: [
    {
      lane: 1,
      finalMs: 60_000,
      splitsMs: [14_000, 29_000, 44_000],
      buttonsMs: [60_100, 60_120, 60_140],
      backupMs: 60_120,
    },
    { lane: 2, finalMs: 61_000, splitsMs: [14_500, 30_000, 45_000] },
  ],
};

function simulator(races = 3) {
  const sim = createSimulator({ now: () => NOW, pool: { lanesInPool: 6 } });
  for (let i = 0; i < races; i++) sim.runRace(SWIM);
  return sim;
}

const finding = (
  report: Awaited<ReturnType<typeof diagnoseTimer>>,
  id: string,
) => report.findings.find((f) => f.id === id);

const DATE: TimerDate = {
  year: 2026,
  month: 11,
  day: 5,
  hours: 9,
  minutes: 0,
  seconds: 0,
  weekday: 4,
};

const EMPTY_INCLUDES = {
  backup: false,
  splits: false,
  individualButtons: false,
  relayJudging: false,
};

function bare(overrides: Partial<EncodeRaceInput> = {}) {
  return encodeRace({
    event: 0,
    heat: 0,
    raceNumber: 0,
    date: DATE,
    raceLengths: 0,
    includes: EMPTY_INCLUDES,
    lanes: [],
    ...overrides,
  });
}

const VERSION = Uint8Array.from([0x53, 0x57, 0x49, 0x4d, 0]);

/** Answers by command hex. Anything unlisted is "no such race". */
function scripted(
  replies: Record<string, Uint8Array | Error | (() => Uint8Array | Error)>,
): TimerTransport {
  return {
    async request(data) {
      const listed = replies[toHex(data)] ?? NO_RACE;
      const reply = typeof listed === "function" ? listed() : listed;
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

describe("diagnoseTimer", () => {
  it("reports a console that matches what Lane4 expects", async () => {
    const steps: string[] = [];
    const report = await diagnoseTimer(simulator(), {
      ...OPTIONS,
      environment: { port: "COM3" },
      onProgress: (p) => steps.push(`${p.step}/${p.steps} ${p.stage}`),
    });
    expect(report).toMatchObject({
      kind: "lane4.timer-diagnostics",
      schemaVersion: 1,
      environment: { port: "COM3" },
      version: "SYS6 SWIM 1.110",
      headerBytes: 47,
      maxNumLanes: 10,
      raceNumbers: [1, 2, 3],
      pool: { lanesInPool: 6 },
      splitsSetup: { cumulativeSplits: true },
    });
    expect(steps).toHaveLength(7);
    expect(steps[0]).toBe("1/7 Asking who the timer is");
    expect(finding(report, "header")?.status).toBe("pass");
    expect(finding(report, "meet-time")?.status).toBe("pass");
    expect(finding(report, "setups-read")?.status).toBe("pass");
    expect(finding(report, "numbering")?.status).toBe("pass");
    expect(finding(report, "pointer")?.detail).toContain("newest race");
    expect(finding(report, "pointer")?.detail).toContain("returns an error");
    expect(finding(report, "meets")?.detail).toContain("No other meet");
    expect(finding(report, "decoding")?.status).toBe("pass");
    expect(finding(report, "buttons")?.detail).toContain("included");
    expect(finding(report, "splits")?.status).toBe("pass");
    expect(finding(report, "long-race")?.status).toBe("pass");
    expect(finding(report, "event-lookup")?.status).toBe("warn");
    expect(report.samples).toHaveLength(3);
    expect(report.samples[0]?.layout).toEqual({
      splits: 4,
      buttons: 3,
      backup: true,
      exchanges: 0,
    });
  });

  it("sends no setups writes and keeps only sample replies", async () => {
    const sim = simulator();
    const report = await diagnoseTimer(sim, OPTIONS);
    expect(sim.log.some((data) => data[0] === 0x49)).toBe(false);
    const walked = report.exchanges.filter((e) => e.label === "Next race");
    expect(walked.every((e) => e.reply === undefined)).toBe(true);
    const race = report.exchanges.find((e) => e.label === "Race 3");
    expect(race?.reply).toBeDefined();
  });

  it("explains a timer that doesn't answer and stops there", async () => {
    const report = await diagnoseTimer(
      scripted({ "57": new Error("Timed out") }),
      OPTIONS,
    );
    expect(report.status).toBe("fail");
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.detail).toContain("straight-through");
    expect(report.exchanges[0]?.noAnswer).toBe("Timed out");
    expect(report.version).toBeNull();
  });

  it("uses the app's own description of a lost connection", async () => {
    const report = await diagnoseTimer(
      {
        request: () => Promise.reject({ kind: "timeout" }),
      },
      { ...OPTIONS, describeError: () => "No answer" },
    );
    expect(report.exchanges[0]?.noAnswer).toBe("No answer");
    const plain = await diagnoseTimer(
      { request: () => Promise.reject("gone") },
      OPTIONS,
    );
    expect(plain.exchanges[0]?.noAnswer).toBe("gone");
  });

  it("copes with a freshly powered timer with nothing stored", async () => {
    const report = await diagnoseTimer(scripted({ "57": VERSION }), OPTIONS);
    expect(finding(report, "empty-meet")?.detail).toContain("still connects");
    expect(finding(report, "races")?.status).toBe("info");
    expect(finding(report, "setups-read")?.status).toBe("info");
    expect(report.samples).toEqual([]);
    expect(finding(report, "decoding")).toBeUndefined();
  });

  it("notes a meet date request with no answer", async () => {
    const report = await diagnoseTimer(
      scripted({ "57": VERSION, "54": new Error("Timed out") }),
      OPTIONS,
    );
    expect(finding(report, "empty-meet")?.detail).toContain("didn't answer");
  });

  it("flags a reply too short to be a header", async () => {
    const report = await diagnoseTimer(
      scripted({ "57": VERSION, "54": new Uint8Array(20) }),
      OPTIONS,
    );
    expect(finding(report, "header")?.status).toBe("fail");
    expect(report.maxNumLanes).toBeNull();
    expect(finding(report, "meet-time")).toBeUndefined();
  });

  it("learns a wider header", async () => {
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": encodeRace(
          {
            event: 0,
            heat: 0,
            raceNumber: 0,
            date: DATE,
            raceLengths: 0,
            includes: EMPTY_INCLUDES,
            lanes: [],
          },
          { maxNumLanes: 12 },
        ),
      }),
      OPTIONS,
    );
    expect(report.maxNumLanes).toBe(12);
    expect(report.headerBytes).toBe(headerBytes(12));
    expect(finding(report, "header")?.status).toBe("warn");
  });

  it("notices a meet time that is really the clock", async () => {
    let seconds = 0;
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": () => bare({ date: { ...DATE, seconds: seconds++ } }),
      }),
      OPTIONS,
    );
    expect(finding(report, "meet-time")?.status).toBe("warn");
  });

  it("falls back to the short setups form and records which worked", async () => {
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": bare(),
        "52 69": Uint8Array.of(1, 8, 0, 0, 0),
        "52 67": Uint8Array.of(1, 0),
        "52 72": Uint8Array.of(7),
      }),
      OPTIONS,
    );
    expect(finding(report, "setups-read")?.status).toBe("warn");
    expect(finding(report, "setups-read")?.detail).toContain("Pool: short");
    expect(finding(report, "reverse-lanes")?.status).toBe("warn");
  });

  it("walks a pointer that starts in the middle", async () => {
    const sim = simulator(5);
    const report = await diagnoseTimer(
      {
        request: async (data) => {
          if (toHex(data) === "53" && sim.log.length < 12) {
            await sim.request(Uint8Array.of(0x53, 0x4c));
            await sim.request(Uint8Array.of(0x53, 0x4c));
          }
          return sim.request(data);
        },
      },
      OPTIONS,
    );
    expect(finding(report, "pointer")?.detail).toContain("race 3");
    expect(report.raceNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  it("describes pointers on the oldest race and no race", async () => {
    const oldest = simulator(3);
    await oldest.request(Uint8Array.of(0x53, 0x4c));
    await oldest.request(Uint8Array.of(0x53, 0x4c));
    const report = await diagnoseTimer(oldest, OPTIONS);
    expect(finding(report, "pointer")?.detail).toContain("oldest race");

    const raceOne = bare({ raceNumber: 1 });
    const none = await diagnoseTimer(
      scripted({ "57": VERSION, "53 4E": raceOne }),
      { ...OPTIONS, maxRaces: 1 },
    );
    expect(finding(none, "pointer")?.detail).toContain("on no race");

    const capped = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "53": bare({ raceNumber: 9 }),
        "53 4C": bare({ raceNumber: 8 }),
      }),
      { ...OPTIONS, maxRaces: 1 },
    );
    expect(finding(capped, "pointer")?.detail).toContain("not reached");
  });

  it("reports wrapping, gaps, and numbers that don't start at 1", async () => {
    const race = (raceNumber: number) => bare({ raceNumber, raceLengths: 2 });
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": bare(),
        "53": race(9),
        "53 4C": (() => {
          const order = [race(7), race(9)];
          return () => order.shift()!;
        })(),
      }),
      OPTIONS,
    );
    expect(report.raceNumbers).toEqual([7, 9]);
    expect(finding(report, "numbering")?.status).toBe("warn");
    expect(finding(report, "numbering")?.detail).toContain("Missing: 8");
    expect(finding(report, "pointer")?.detail).toContain("wraps around");
    expect(finding(report, "decoding")?.status).toBe("fail");
  });

  it("checks numbering in the previous meet and comes back", async () => {
    let now = NOW;
    const sim = createSimulator({ now: () => now, pool: { lanesInPool: 6 } });
    sim.runRace(SWIM);
    now = new Date(2026, 10, 5, 13, 0, 0);
    sim.powerOn();
    sim.runRace(SWIM);
    const report = await diagnoseTimer(sim, OPTIONS);
    expect(finding(report, "meets")?.status).toBe("pass");
    expect(finding(report, "meets")?.detail).toContain("restarts");
    expect((await sim.request(Uint8Array.of(0x54)))[8]).toBe(13);
  });

  it("notes a previous meet with no race 1", async () => {
    const older = bare({ date: { ...DATE, day: 1 } });
    let moved = false;
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": () => (moved ? older : bare()),
        "4D 2D": () => {
          moved = true;
          return older;
        },
        "4D 2B": () => {
          moved = false;
          return bare();
        },
      }),
      OPTIONS,
    );
    expect(finding(report, "meets")?.detail).toContain("no race 1");
  });

  it("warns loudly if the meet pointer can't be put back", async () => {
    const older = bare({ date: { ...DATE, day: 1 } });
    let moved = false;
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": () => (moved ? older : bare()),
        "4D 2D": () => {
          moved = true;
          return older;
        },
      }),
      OPTIONS,
    );
    expect(report.status).toBe("fail");
    expect(finding(report, "meets")?.detail).toContain("off and on");
    const tries = report.exchanges.filter((e) => e.sent === "4D 2B");
    expect(tries).toHaveLength(3);
  });

  it("flags races it can't read or decode", async () => {
    const header = bare({ raceNumber: 1, raceLengths: 2 });
    const broken = new Uint8Array([...header, 1, 2, 3]);
    broken[14] = 2;
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": bare(),
        "53": header,
        "53 42 49 4A 53 52 01 00": broken,
      }),
      OPTIONS,
    );
    expect(finding(report, "decoding")?.status).toBe("fail");
    expect(report.samples[0]?.decodeError).toContain("RaceDecodeError");
    expect(report.samples[0]?.layout).toBeNull();
  });

  it("sees a layout warning", async () => {
    const lane = { place: 1, splitsMs: [30_000, 60_000] };
    const data = encodeRace({
      event: 0,
      heat: 0,
      raceNumber: 1,
      date: DATE,
      raceLengths: 2,
      includes: { ...EMPTY_INCLUDES, splits: true },
      lanes: [lane],
    });
    data[15] = 9;
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": bare(),
        "53": bare({ raceNumber: 1, raceLengths: 2 }),
        "53 42 49 4A 53 52 01 00": data,
      }),
      OPTIONS,
    );
    expect(finding(report, "decoding")?.status).toBe("warn");
    expect(report.samples[0]?.layoutWarning).toContain("inferred");
    expect(finding(report, "buttons")?.status).toBe("info");
    expect(finding(report, "relay")?.detail).toContain("No relay");
    expect(finding(report, "event-lookup")?.status).toBe("info");
    expect(finding(report, "reaction-times")?.detail).toContain(
      "Couldn't compare",
    );
    expect(finding(report, "current-race")?.detail).toContain("expected");
  });

  it("reads the button count a timer really uses", async () => {
    const lane = {
      place: 1,
      splitsMs: [30_000, 60_000],
      buttonsMs: [60_100, 60_200, 60_300],
      backupMs: 60_200,
      relayExchangesMs: [120, 90, 100],
    };
    const raceBytes = (raceNumber: number, numTimes: number) => {
      const data = encodeRace({
        event: 3,
        heat: 1,
        raceNumber,
        date: DATE,
        raceLengths: 2,
        numberOfButtons: 3,
        includes: {
          backup: true,
          splits: true,
          individualButtons: true,
          relayJudging: true,
        },
        lanes: [lane],
      });
      data[15] = numTimes;
      return data;
    };
    const leftOut = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": bare(),
        "53": bare({ raceNumber: 1, raceLengths: 2 }),
        "53 42 49 4A 53 52 01 00": raceBytes(1, 3),
        "53 45 01 03": bare({ raceNumber: 1 }),
        "53 52 01 00": raceBytes(1, 3),
        "53 58 52 01 00": new Uint8Array(raceBytes(1, 3).length + 40),
        "53 43": bare({ raceNumber: 1 }),
      }),
      OPTIONS,
    );
    expect(finding(leftOut, "buttons")?.status).toBe("pass");
    expect(finding(leftOut, "buttons")?.detail).toContain("left out");
    expect(finding(leftOut, "relay")?.detail).toContain("3");
    expect(finding(leftOut, "event-lookup")?.status).toBe("pass");
    expect(finding(leftOut, "reaction-times")?.detail).toContain("40 bytes");
    expect(finding(leftOut, "current-race")?.detail).toContain("answered");

    const unclear = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": bare(),
        "53": bare({ raceNumber: 1, raceLengths: 2 }),
        "53 42 49 4A 53 52 01 00": raceBytes(1, 20),
      }),
      OPTIONS,
    );
    expect(unclear.samples[0]?.numTimesPerLane).toBe(20);
  });

  it("flags splits that don't fit the race length", async () => {
    const sim = simulator(1);
    const report = await diagnoseTimer(
      {
        request: async (data) => {
          const reply = await sim.request(data);
          if (reply.length > 47) reply[13] = 40;
          return reply;
        },
      },
      OPTIONS,
    );
    expect(finding(report, "splits")?.status).toBe("warn");
  });

  it("covers a race with no lanes", async () => {
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": bare(),
        "53": bare({ raceNumber: 1 }),
        "53 42 49 4A 53 52 01 00": bare({ raceNumber: 1 }),
      }),
      OPTIONS,
    );
    expect(report.samples[0]?.layout).toBeNull();
    expect(finding(report, "long-race")?.status).toBe("pass");
  });

  it("treats an ACK as data, not a timer error", async () => {
    const report = await diagnoseTimer(
      scripted({ "57": Uint8Array.of(0x06, 0x00) }),
      OPTIONS,
    );
    expect(report.exchanges[0]?.timerError).toBeUndefined();
    expect(report.version).toBe("\u0006");
  });

  it("notices a meet date that goes away on the second read", async () => {
    let reads = 0;
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": () => (reads++ === 0 ? bare() : new Error("Timed out")),
      }),
      OPTIONS,
    );
    expect(finding(report, "meet-time")?.status).toBe("warn");
  });

  it("keeps a pool setup when the splits setup won't read", async () => {
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": bare(),
        "52 69 00 00 00 00 00": Uint8Array.of(0, 8, 0, 0, 0),
      }),
      OPTIONS,
    );
    expect(report.pool?.lanesInPool).toBe(8);
    expect(report.splitsSetup).toBeNull();
    expect(finding(report, "reverse-lanes")?.status).toBe("info");
  });

  it("counts buttons on a race with no backup time", async () => {
    const data = encodeRace({
      event: 0,
      heat: 0,
      raceNumber: 1,
      date: DATE,
      raceLengths: 2,
      numberOfButtons: 2,
      includes: { ...EMPTY_INCLUDES, splits: true, individualButtons: true },
      lanes: [
        { place: 1, splitsMs: [30_000, 60_000], buttonsMs: [60_100, 60_200] },
      ],
    });
    const report = await diagnoseTimer(
      scripted({
        "57": VERSION,
        "54": bare(),
        "53": bare({ raceNumber: 1, raceLengths: 2 }),
        "53 42 49 4A 53 52 01 00": data,
      }),
      OPTIONS,
    );
    expect(finding(report, "buttons")?.detail).toContain("included");
  });

  it("names the largest reply, wherever it falls", async () => {
    const sim = simulator(1);
    sim.runRace({
      lengths: 4,
      lanes: [{ lane: 1, finalMs: 60_000, relayExchangesMs: [100, 90, 80] }],
    });
    const report = await diagnoseTimer(sim, OPTIONS);
    expect(finding(report, "long-race")?.detail).toContain("Race 2");
    expect(finding(report, "relay")?.detail).toContain("3");
  });

  it("waits between meet time reads by default", async () => {
    const report = await diagnoseTimer(simulator(0));
    expect(report.startedAt).toMatch(/^\d{4}-/);
  }, 5000);

  it("names the report file and lists what needs a person", async () => {
    const late = new Date(2026, 10, 5, 23, 30, 0).getTime();
    const report = await diagnoseTimer(scripted({ "57": VERSION }), {
      ...OPTIONS,
      now: () => late,
    });
    expect(diagnosticFilename(report)).toBe("Lane4 timer test 2026-11-05.json");
    expect(MANUAL_CHECKS.length).toBeGreaterThan(0);
  });
});
