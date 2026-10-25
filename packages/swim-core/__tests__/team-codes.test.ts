import { describe, expect, it } from "vitest";
import {
  matchesTeamCode,
  normalizeLscCode,
  normalizeTeamCode,
  teamFilePrefix,
} from "../src/team-codes";

describe("team codes", () => {
  it("normalizes Hy-Tek abbreviations and LSCs", () => {
    expect(normalizeTeamCode(" mari-az ")).toBe("MARI");
    expect(normalizeTeamCode("DSUN")).toBe("DSUN");
    expect(normalizeTeamCode("AZSL")).toBe("AZSL");
    expect(normalizeTeamCode("x")).toBeNull();
    expect(normalizeLscCode("az")).toBe("AZ");
    expect(normalizeLscCode("AZI")).toBeNull();
  });

  it("builds filename prefixes", () => {
    expect(teamFilePrefix("MARI", "AZ")).toBe("MARI-AZ");
    expect(teamFilePrefix("MARI", null)).toBe("MARI");
    expect(teamFilePrefix(null, "AZ")).toBe("TEAM");
  });

  it("matches result-file codes with an optional LSC suffix", () => {
    expect(matchesTeamCode("MARI", "MARI", "AZ")).toBe(true);
    expect(matchesTeamCode("MARI-AZ", "MARI", "AZ")).toBe(true);
    expect(matchesTeamCode("MARIAZ", "MARI", "AZ")).toBe(true);
    expect(matchesTeamCode("AZMARI", "MARI", "AZ")).toBe(true);
    expect(matchesTeamCode("AZMARI", "MARI", null)).toBe(true);
    expect(matchesTeamCode("AZMARI", "MARI", "GA")).toBe(false);
    expect(matchesTeamCode("AZWFHS", "MARI", "AZ")).toBe(false);
    expect(matchesTeamCode("MARI1A", "MARI", "AZ")).toBe(false);
    expect(matchesTeamCode("WFHS", "MARI", "AZ")).toBe(false);
    expect(matchesTeamCode(undefined, "MARI", "AZ")).toBe(false);
    expect(matchesTeamCode("WFHS", null, "AZ")).toBe(true);
  });
});
