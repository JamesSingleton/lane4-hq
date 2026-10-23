import { describe, expect, it } from "vitest";
import {
  COURSES,
  DIVE_COUNTS,
  EVENT_GENDERS,
  GENDER_ORDERS,
  LANES,
  PROGRAM_GENDERS,
  ROUNDS,
  SCORING,
  STROKES,
} from "../src/lib/meet-choices";

describe("meet choices", () => {
  it("lists the courses, lanes, and scoring presets the new-meet form offers", () => {
    expect(COURSES.map((c) => c.value)).toEqual(["SCY", "SCM", "LCM"]);
    expect(LANES.map((l) => l.value)).toEqual(["6", "8", "10"]);
    expect(SCORING.map((s) => s.value)).toEqual([
      "none",
      "dual",
      "invitational",
      "championship",
    ]);
    expect(PROGRAM_GENDERS.map((g) => g.value)).toContain("mixed");
    expect(GENDER_ORDERS.map((g) => g.value)).toEqual([
      "girls_boys",
      "boys_girls",
    ]);
    expect(EVENT_GENDERS.map((g) => g.value)).toEqual([
      "female",
      "male",
      "mixed",
    ]);
    expect(DIVE_COUNTS.map((d) => d.value)).toEqual(["6", "11"]);
    expect(ROUNDS.map((r) => r.value)).toEqual(["timed_final", "prelim"]);
    expect(STROKES.map((s) => s.value)).toContain("dive");
  });
});
