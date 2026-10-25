import { describe, expect, it } from "vitest";
import {
  canAssignRacingRelayLeg,
  deriveRelayLetter,
  formatAssignmentCountLine,
  individualEventKeyForRelayLeg,
  isRelayAlternateSlot,
  racingRelayCount,
  racingRelayKeysByMember,
  racingRelayTeamKey,
  relayLegBestTimeKeys,
  relayLegRoleLabel,
  relayLegTimeKey,
  relayLetterFromIndex,
  relaySlotLabel,
  resolveImportedRelayLineup,
  shouldCreditRelayLeadOff,
  strokeForRelayLeg,
} from "../src/relay-legs";

describe("relay slots", () => {
  it("imports a relay when the four racing legs match and an alternate does not", () => {
    const names = [
      "Orion Chaturvedi",
      "Dante Flores",
      "Hudson Gerhke",
      "Hayden Meyers",
      "Ruben Anguiano",
      "Bennett Munkirs",
      "Cash Hotton",
    ];
    const roster = new Set(names.slice(0, 5));
    const lineup = resolveImportedRelayLineup(names, (name) =>
      roster.has(name) ? name : null,
    );
    expect(lineup).toEqual([
      { legOrder: 1, resolved: "Orion Chaturvedi" },
      { legOrder: 2, resolved: "Dante Flores" },
      { legOrder: 3, resolved: "Hudson Gerhke" },
      { legOrder: 4, resolved: "Hayden Meyers" },
      { legOrder: 5, resolved: "Ruben Anguiano" },
    ]);
  });

  it("rejects a relay when a racing leg is unmatched", () => {
    expect(
      resolveImportedRelayLineup(
        ["A One", "B Two", "C Three", "D Four", "E Alt"],
        (name) => (name === "D Four" ? null : name),
      ),
    ).toBeNull();
    expect(
      resolveImportedRelayLineup(["A One", "B Two", "C Three"], () => "x"),
    ).toBeNull();
  });

  it("labels primary legs and alternates #5–#8", () => {
    expect(isRelayAlternateSlot(4)).toBe(false);
    expect(isRelayAlternateSlot(5)).toBe(true);
    expect(relaySlotLabel(1)).toBe("Leg 1");
    expect(relaySlotLabel(8)).toBe("Alt 8");
    expect(relayLegRoleLabel("medley_relay", 1)).toBe("Back");
    expect(relayLegRoleLabel("medley_relay", 2)).toBe("Breast");
    expect(relayLegRoleLabel("medley_relay", 3)).toBe("Fly");
    expect(relayLegRoleLabel("medley_relay", 4)).toBe("Free");
    expect(relayLegRoleLabel("free_relay", 1)).toBe("Free");
    expect(relayLegRoleLabel("free_relay", 4)).toBe("Free");
    expect(relayLegRoleLabel("medley_relay", 5)).toBe("Alt 5");
  });

  it("formats lane-board event and alt counts", () => {
    expect(formatAssignmentCountLine(0, 0)).toBe("0 events");
    expect(formatAssignmentCountLine(1, 0)).toBe("1 event");
    expect(formatAssignmentCountLine(2, 1)).toBe("2 events · 1 alt");
    expect(formatAssignmentCountLine(0, 1)).toBe("1 alt");
    expect(formatAssignmentCountLine(1, 2)).toBe("1 event · 2 alts");
  });

  it("maps medley and free-relay slots onto split strokes", () => {
    expect(strokeForRelayLeg("medley_relay", 1)).toBe("back");
    expect(strokeForRelayLeg("200_medley_relay", 3)).toBe("fly");
    expect(strokeForRelayLeg("free_relay", 4)).toBe("free");
    expect(strokeForRelayLeg("medley_relay", 6)).toBe("breast");
  });

  it("derives team letters from stored values or legacy 4-leg packing", () => {
    expect(relayLetterFromIndex(0)).toBe("A");
    expect(relayLetterFromIndex(2)).toBe("C");
    expect(relayLetterFromIndex(9)).toBe("A");
    expect(deriveRelayLetter(" b ", 1)).toBe("B");
    expect(deriveRelayLetter("", 5)).toBe("B");
    expect(deriveRelayLetter(null, 9)).toBe("C");
  });

  it("counts unique named racing teams, ignoring alternates", () => {
    const legs = [
      {
        membershipId: "xaria",
        meetEventId: "mr",
        relayLetter: "A",
        legOrder: 3,
      },
      {
        membershipId: "xaria",
        meetEventId: "mr",
        relayLetter: "A",
        legOrder: 5,
      },
      {
        membershipId: "xaria",
        meetEventId: "fr",
        relayLetter: "A",
        legOrder: 1,
      },
    ];
    expect(racingRelayCount(legs, "xaria")).toBe(2);
    expect(racingRelayCount(legs, "nobody")).toBe(0);
    expect(racingRelayTeamKey("mr", "  ")).toBe("mr:A");
    expect(
      racingRelayKeysByMember([
        {
          membershipId: "xaria",
          meetEventId: "mr",
          relayLetter: "A",
          legOrder: 0,
        },
      ]).size,
    ).toBe(0);
    expect(
      canAssignRacingRelayLeg({
        limits: {
          maxIndividualEntries: null,
          maxRelayEntries: 2,
          maxCombinedEntries: null,
          entryLimitPackages: null,
        },
        individualCount: 2,
        legs,
        membershipId: "xaria",
        meetEventId: "mr",
        relayLetter: "A",
      }),
    ).toEqual({ ok: true });
    expect(
      canAssignRacingRelayLeg({
        limits: {
          maxIndividualEntries: null,
          maxRelayEntries: 2,
          maxCombinedEntries: null,
          entryLimitPackages: null,
        },
        individualCount: 2,
        legs,
        membershipId: "xaria",
        meetEventId: "im",
        relayLetter: "A",
      }).ok,
    ).toBe(false);
    expect(
      canAssignRacingRelayLeg({
        limits: null,
        individualCount: 0,
        legs: [],
        membershipId: "a",
        meetEventId: "e",
        relayLetter: "A",
      }),
    ).toEqual({ ok: true });
  });
});

describe("individualEventKeyForRelayLeg", () => {
  it("maps free and medley lead-offs onto gendered individual keys", () => {
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "200_free_relay_scy_m",
        legOrder: 1,
        swimmerGender: "male",
      }),
    ).toBe("50_free_scy_m");
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "400_free_relay_scy_f",
        legOrder: 1,
        swimmerGender: "female",
      }),
    ).toBe("100_free_scy_f");
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "200_medley_relay_scy_m",
        legOrder: 1,
        swimmerGender: "male",
      }),
    ).toBe("50_back_scy_m");
  });

  it("uses the swimmer gender for mixed relays, not _x", () => {
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "200_medley_relay_scy_x",
        legOrder: 1,
        swimmerGender: "female",
      }),
    ).toBe("50_back_scy_f");
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "200_free_relay_scy_x",
        legOrder: 1,
        swimmerGender: "male",
      }),
    ).toBe("50_free_scy_m");
  });

  it("returns null for missing catalog keys, alternates, and non-lead-off mapping still works for later legs", () => {
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "not_an_event",
        legOrder: 1,
        swimmerGender: "male",
      }),
    ).toBeNull();
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "200_free_relay_scy_m",
        legOrder: 5,
        swimmerGender: "male",
      }),
    ).toBeNull();
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "200_free_relay_scy_f",
        legOrder: 2,
        swimmerGender: "female",
      }),
    ).toBe("50_free_scy_f");
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "200_free_relay_scy_m",
        legOrder: 0,
        swimmerGender: "male",
      }),
    ).toBeNull();
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "50_free_relay_scy_m",
        legOrder: 1,
        swimmerGender: "male",
      }),
    ).toBeNull();
    expect(
      individualEventKeyForRelayLeg({
        relayEventKey: "100_free_relay_scy_m",
        legOrder: 1,
        swimmerGender: "male",
      }),
    ).toBeNull();
  });

  it("uses one leg of the relay, including alternates", () => {
    expect(relayLegTimeKey("200_free_relay_scy_m", 4, "male")).toBe(
      "50_free_scy_m",
    );
    expect(relayLegTimeKey("200_free_relay_scy_f", 5, "female")).toBe(
      "50_free_scy_f",
    );
    expect(relayLegTimeKey("400_medley_relay_scy_m", 2, "male")).toBe(
      "100_breast_scy_m",
    );
    expect(relayLegTimeKey("200_medley_relay_scy_f", 6, "female")).toBe(
      "50_breast_scy_f",
    );
    expect(relayLegBestTimeKeys("200_free_relay_scy_m", ["male"])).toEqual([
      "50_free_scy_m",
    ]);
    expect(relayLegTimeKey("200_free_relay_scy_m", 0, "male")).toBeNull();
    expect(relayLegTimeKey("200_free_relay_scy_m", 9, "male")).toBeNull();
    expect(relayLegBestTimeKeys("not_an_event", ["male", "female"])).toEqual(
      [],
    );
    expect(
      relayLegBestTimeKeys("200_medley_relay_scy_x", ["female", "male"]),
    ).toEqual([
      "50_back_scy_f",
      "50_breast_scy_f",
      "50_fly_scy_f",
      "50_free_scy_f",
      "50_back_scy_m",
      "50_breast_scy_m",
      "50_fly_scy_m",
      "50_free_scy_m",
    ]);
  });

  it("credits a valid racing lead-off regardless of exhibition status", () => {
    expect(
      shouldCreditRelayLeadOff({
        legOrder: 1,
        isDq: false,
        exhibition: false,
      }),
    ).toBe(true);
    expect(
      shouldCreditRelayLeadOff({
        legOrder: 2,
        isDq: false,
        exhibition: false,
      }),
    ).toBe(false);
    expect(
      shouldCreditRelayLeadOff({
        legOrder: 1,
        isDq: true,
        exhibition: false,
      }),
    ).toBe(false);
    expect(
      shouldCreditRelayLeadOff({
        legOrder: 1,
        isDq: false,
        exhibition: true,
      }),
    ).toBe(true);
  });
});
