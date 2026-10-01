import { describe, expect, it } from "vitest";
import {
  isReadSplitsSetup,
  meetTimeAndDate,
  nextMeet,
  previousMeet,
  readSetups,
  swimData,
  whoAreYou,
} from "../src/commands";
import { describeTimerError, TimerResponseError } from "../src/errors";
import { toHex } from "../src/frame";

describe("commands", () => {
  it("builds the primary commands", () => {
    expect(toHex(whoAreYou())).toBe("57");
    expect(toHex(meetTimeAndDate())).toBe("54");
    expect(toHex(nextMeet())).toBe("4D 2B");
    expect(toHex(previousMeet())).toBe("4D 2D");
    expect(toHex(readSetups("i"))).toBe("52 69");
    expect(toHex(readSetups("r"))).toBe("52 72");
  });

  it("puts include options before the selector", () => {
    expect(toHex(swimData())).toBe("53");
    expect(
      toHex(
        swimData(
          { kind: "last" },
          {
            backup: true,
            individualButtons: true,
            relayJudging: true,
            splits: true,
            reactionTimes: true,
          },
        ),
      ),
    ).toBe("53 42 49 4A 53 58 4C");
    expect(toHex(swimData({ kind: "current" }))).toBe("53 43");
    expect(toHex(swimData({ kind: "next" }))).toBe("53 4E");
    expect(toHex(swimData({ kind: "pointer" }, { splits: true }))).toBe(
      "53 53",
    );
  });

  it("encodes race numbers LSB first", () => {
    expect(toHex(swimData({ kind: "race", raceNumber: 0x0102 }))).toBe(
      "53 52 02 01",
    );
    expect(() => swimData({ kind: "race", raceNumber: 70000 })).toThrow(
      RangeError,
    );
  });

  it("encodes one-byte and two-byte events", () => {
    expect(toHex(swimData({ kind: "event", event: 12, heat: 3 }))).toBe(
      "53 45 03 0C",
    );
    expect(toHex(swimData({ kind: "event", event: 301, heat: 2 }))).toBe(
      "53 45 02 00 2D 01",
    );
    expect(() => swimData({ kind: "event", event: 0, heat: 1 })).toThrow(
      /positive/,
    );
    expect(() => swimData({ kind: "event", event: 1, heat: 0 })).toThrow(
      /Heat/,
    );
    expect(() => swimData({ kind: "event", event: 70000, heat: 1 })).toThrow(
      /Event/,
    );
  });

  it("recognises Rg, whose 2-byte reply isn't an error", () => {
    expect(isReadSplitsSetup(readSetups("g"))).toBe(true);
    expect(isReadSplitsSetup(readSetups("i"))).toBe(false);
    expect(isReadSplitsSetup(whoAreYou())).toBe(false);
  });

  it("describes timer errors", () => {
    expect(describeTimerError(51)).toMatch(/newest meet/);
    expect(describeTimerError(999)).toBe("Unknown timer error 999");
    expect(new TimerResponseError(50).isNoRace).toBe(true);
    expect(new TimerResponseError(0).isNoRace).toBe(true);
    expect(new TimerResponseError(51).isNoRace).toBe(false);
  });
});
