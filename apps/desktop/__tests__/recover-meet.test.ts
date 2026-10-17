import { createMeet } from "@lane4hq/meet-engine/create";
import { toHex } from "@lane4hq/timing-cts/frame";
import { type EncodeRaceInput, encodeRace } from "@lane4hq/timing-cts/race";
import { describe, expect, it } from "vitest";
import {
  damagedMeetMessage,
  recoverySummary,
  replayCaptureJournal,
} from "../src/lib/recover-meet";

const DATE = {
  year: 2026,
  month: 9,
  day: 12,
  hours: 9,
  minutes: 41,
  seconds: 7,
  weekday: 6,
};

function race(raceNumber: number): EncodeRaceInput {
  return {
    event: 12,
    heat: 3,
    raceNumber,
    date: DATE,
    raceLengths: 2,
    numberOfButtons: 1,
    includes: {
      backup: false,
      splits: true,
      individualButtons: false,
      relayJudging: false,
    },
    lanes: [
      { place: 1, splitsMs: [30_000, 60_000] },
      { place: 2, splitsMs: [31_000, 62_000] },
    ],
  };
}

function line(input: {
  raceNumber: number;
  captureId?: string;
  at?: string;
  timer?: string;
  raw?: string;
}): string {
  return JSON.stringify({
    captureId: input.captureId ?? `cap-${input.raceNumber}`,
    at: input.at ?? "2026-09-12T14:00:00.000Z",
    timer: input.timer ?? "System 6 1.2",
    raceNumber: input.raceNumber,
    raw: input.raw ?? toHex(encodeRace(race(input.raceNumber))),
  });
}

describe("capture journal replay", () => {
  const meet = createMeet(
    { name: "Invite", course: "SCY" },
    { newId: () => "meet-1", now: new Date("2026-09-12T12:00:00Z") },
  );

  it("adds races in order and skips ones already on the meet", () => {
    const journal = [
      line({ raceNumber: 58 }),
      "",
      line({ raceNumber: 59 }),
    ].join("\n");
    const first = replayCaptureJournal(meet, journal);
    expect(first.added).toBe(2);
    expect(first.unreadable).toBe(0);
    expect(first.meet.captures.map((c) => c.id)).toEqual(["cap-58", "cap-59"]);
    expect(first.meet.captures[0]?.timerVersion).toBe("System 6 1.2");
    expect(first.meet.captures[0]?.capturedAt).toBe("2026-09-12T14:00:00.000Z");

    const again = replayCaptureJournal(
      first.meet,
      `${line({ raceNumber: 59 })}\n${line({ raceNumber: 60 })}`,
    );
    expect(again.added).toBe(1);
    expect(again.alreadyRecorded).toBe(1);
    expect(again.meet.captures).toHaveLength(3);

    const generated = replayCaptureJournal(
      meet,
      JSON.stringify({
        raw: toHex(encodeRace(race(7))),
        at: "2026-09-12T15:00:00.000Z",
        timer: "Gen7",
      }),
      { newId: () => "generated" },
    );
    expect(generated.added).toBe(1);
    expect(generated.meet.captures[0]?.id).toBe("generated");

    const dated = replayCaptureJournal(
      meet,
      JSON.stringify({ raw: toHex(encodeRace(race(8))), captureId: "" }),
      { newId: () => "from-clock", now: new Date("2026-09-12T16:00:00.000Z") },
    );
    expect(dated.meet.captures[0]?.id).toBe("from-clock");
    expect(dated.meet.captures[0]?.capturedAt).toBe("2026-09-12T16:00:00.000Z");
  });

  it("counts lines that aren't timer data", () => {
    const result = replayCaptureJournal(
      meet,
      [
        "not json",
        '{"raw":"zz"}',
        '{"raw":""}',
        "null",
        line({ raceNumber: 1, raw: "00" }),
        '{"raw":"00","at":"not-a-date"}',
      ].join("\n"),
    );
    expect(result.added).toBe(0);
    expect(result.unreadable).toBe(6);
  });

  it("describes a restore and a damaged file", () => {
    expect(recoverySummary({ added: 0, unreadable: 0 })).toBe(
      "Restored the previous save of this meet.",
    );
    expect(recoverySummary({ added: 1, unreadable: 2 })).toBe(
      "Restored the previous save of this meet. 1 race from the timing journal was added back. 2 journal lines couldn't be read.",
    );
    expect(recoverySummary({ added: 2, unreadable: 1 })).toContain(
      "2 races from the timing journal were added back. 1 journal line couldn't be read.",
    );
    expect(damagedMeetMessage({ hasBackup: true, journalLines: 0 })).toBe(
      "This meet file is damaged. The previous save can be restored.",
    );
    expect(damagedMeetMessage({ hasBackup: true, journalLines: 3 })).toContain(
      "3 races",
    );
    expect(damagedMeetMessage({ hasBackup: false, journalLines: 1 })).toContain(
      "can't be rebuilt",
    );
    expect(damagedMeetMessage({})).toContain("there's no backup");
  });
});
