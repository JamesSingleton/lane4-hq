import { describe, expect, it } from "vitest";
import {
  cl2G0RoundSuffix,
  parseResultRoundType,
  parseSdifHeatLane,
  resultRoundCode,
} from "../src/g0-meta";

describe("g0-meta", () => {
  it("parses trailing and fixed-column P/F/S round markers", () => {
    expect(parseResultRoundType("....1:05.00 P")).toBe("prelim");
    expect(parseResultRoundType("....1:05.00 F")).toBe("finals");
    expect(parseResultRoundType("....1:05.00 S")).toBe("swimoff");
    expect(parseResultRoundType("....1:05.00 P             N26")).toBe(
      "prelim",
    );
    // Force fixed-column path: letter at col 116 with trailing junk so $ anchor fails.
    expect(parseResultRoundType(`${" ".repeat(115)}P junk`)).toBe("prelim");
    expect(parseResultRoundType(`${" ".repeat(115)}F junk`)).toBe("finals");
    expect(parseResultRoundType(`${" ".repeat(115)}S junk`)).toBe("swimoff");
    expect(parseResultRoundType("no round")).toBeUndefined();
    expect(
      parseResultRoundType("....6:36.51F             N12"),
    ).toBeUndefined();
  });

  it("uses fixed column 115 when trailing regex is blocked by junk after P/F/S", () => {
    expect(parseResultRoundType(`${" ".repeat(115)}PX`)).toBe("prelim");
    expect(parseResultRoundType(`${" ".repeat(115)}FX`)).toBe("finals");
    expect(parseResultRoundType(`${" ".repeat(115)}SX`)).toBe("swimoff");
    expect(parseResultRoundType(`${" ".repeat(115)}P`)).toBe("prelim");
    expect(parseResultRoundType(`${" ".repeat(143)}P junk`)).toBe("prelim");
    expect(parseResultRoundType(`${" ".repeat(143)}F junk`)).toBe("finals");
    expect(parseResultRoundType(`${" ".repeat(143)}X junk`)).toBeUndefined();
  });

  it("reads trailing swimoff marker before the checksum suffix", () => {
    expect(parseResultRoundType("....1:05.00 S             N00")).toBe(
      "swimoff",
    );
    expect(parseResultRoundType("heat 3 lane 4 S")).toBe("swimoff");
  });

  it("parses heat/lane from primary and alternate SDIF columns", () => {
    const primary = `${" ".repeat(93)}002004${" ".repeat(7)}1:05.00`;
    expect(parseSdifHeatLane(primary)).toEqual({ heat: 2, lane: 4 });

    const alternate = `${" ".repeat(100)}003005${" ".repeat(1)}1:06.00`;
    expect(parseSdifHeatLane(alternate)).toEqual({ heat: 3, lane: 5 });
    expect(parseSdifHeatLane("short")).toEqual({});
  });

  it("formats round codes and Hy-Tek CL2 suffixes", () => {
    expect(resultRoundCode("prelim")).toBe("P");
    expect(resultRoundCode("finals")).toBe("F");
    expect(resultRoundCode("swimoff")).toBe("S");
    expect(resultRoundCode(undefined)).toBe("");
    expect(cl2G0RoundSuffix("prelim")).toContain("P");
    expect(cl2G0RoundSuffix(undefined)).toBe("");
  });
});
