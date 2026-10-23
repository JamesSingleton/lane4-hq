import { buildMeetLineupSnapshot } from "@lane4hq/swim-core/meet-lineup-snapshot";
import { describe, expect, it } from "vitest";
import {
  buildMeetEntriesReport,
  formatCourseLabel,
  formatMeetDateCompact,
  formatReportEventTitle,
  formatSeedLabel,
} from "../src/meet-entries/build";

describe("meet entries report formatting", () => {
  it("formats TM-style dates and course labels", () => {
    expect(formatMeetDateCompact("2026-09-12")).toBe("12-Sep-26");
    expect(formatCourseLabel("SCY")).toBe("Yards");
    expect(formatCourseLabel("LCM")).toBe("Long Course Meters");
    expect(formatCourseLabel("SCM")).toBe("Short Course Meters");
    expect(formatMeetDateCompact(new Date(Date.UTC(2026, 0, 5)))).toBe(
      "5-Jan-26",
    );
  });

  it("formats seeds with course suffix", () => {
    expect(formatSeedLabel(56_240, "SCY")).toBe("56.24Y");
    expect(formatSeedLabel(null, "SCY")).toBe("NT");
    expect(formatSeedLabel(127_540, "SCY", true)).toBe("2:07.54Y ex");
  });

  it("uses short stroke titles", () => {
    expect(formatReportEventTitle(200, "free")).toBe("200 Free");
    expect(formatReportEventTitle(200, "medley_relay")).toBe(
      "200 Medley Relay",
    );
    expect(formatReportEventTitle(100, "unknown_stroke")).toBe(
      "100 Unknown stroke",
    );
  });
});

describe("buildMeetEntriesReport", () => {
  it("groups by event from the snapshot and omits relay alternates", () => {
    const snapshot = buildMeetLineupSnapshot({
      meet: {
        name: "2026 Croswhite Invite",
        startDate: "2026-09-12",
        course: "SCY",
        location: "Chandler High School",
      },
      team: {
        name: "Maricopa High School",
        teamCode: "MARI",
        lscCode: "AZ",
        contactName: "Meg O'Brien",
      },
      events: [
        {
          id: "e1",
          eventNumber: 1,
          stroke: "medley_relay",
          distance: 200,
          gender: "male",
          eventKey: "200_medley_relay_scy_m",
        },
        {
          id: "e7",
          eventNumber: 7,
          stroke: "free",
          distance: 50,
          gender: "male",
          eventKey: "50_free_scy_m",
        },
        {
          id: "e8",
          eventNumber: 8,
          stroke: "free",
          distance: 50,
          gender: "female",
          eventKey: "50_free_scy_f",
        },
      ],
      entries: [
        {
          id: "a1",
          meetEventId: "e7",
          membershipId: "m-juan",
          seedTimeMs: 35_160,
          exhibition: false,
          status: "entered",
        },
        {
          id: "a2",
          meetEventId: "e7",
          membershipId: "m-antonio",
          seedTimeMs: null,
          exhibition: false,
          status: "entered",
        },
        {
          id: "a3",
          meetEventId: "e8",
          membershipId: "m-riley",
          seedTimeMs: null,
          exhibition: false,
          status: "scratched",
        },
      ],
      relayLegs: [
        {
          meetEventId: "e1",
          relayLetter: "A",
          legOrder: 1,
          membershipId: "m-orion",
        },
        {
          meetEventId: "e1",
          relayLetter: "A",
          legOrder: 2,
          membershipId: "m-dante",
        },
        {
          meetEventId: "e1",
          relayLetter: "A",
          legOrder: 5,
          membershipId: "m-ruben",
        },
      ],
      relayTeams: [
        { meetEventId: "e1", relayLetter: "A", seedTimeMs: 112_540 },
      ],
      members: [
        {
          membershipId: "m-juan",
          swimmerId: "s-juan",
          firstName: "Juan",
          lastName: "Trejo",
          gender: "male",
          classYear: "SR",
        },
        {
          membershipId: "m-antonio",
          swimmerId: "s-antonio",
          firstName: "Antonio",
          lastName: "Rodriguez",
          gender: "male",
        },
        {
          membershipId: "m-riley",
          swimmerId: "s-riley",
          firstName: "Riley",
          lastName: "Cain",
          gender: "female",
        },
        {
          membershipId: "m-orion",
          swimmerId: "s-orion",
          firstName: "Orion",
          lastName: "Chaturvedi",
          gender: "male",
          classYear: "SR",
        },
        {
          membershipId: "m-dante",
          swimmerId: "s-dante",
          firstName: "Dante",
          lastName: "Flores",
          gender: "male",
        },
        {
          membershipId: "m-ruben",
          swimmerId: "s-ruben",
          firstName: "Ruben",
          lastName: "Anguiano",
          gender: "male",
        },
      ],
    });

    const report = buildMeetEntriesReport(snapshot);

    expect(report.reportTitle).toBe("Individual Meet Entries Report");
    expect(report.meetDateLabel).toBe("12-Sep-26");
    expect(report.teamCode).toBe("MARI-AZ");
    expect(report.events).toHaveLength(2);

    const relay = report.events[0];
    expect(relay?.kind).toBe("relay");
    if (relay?.kind === "relay") {
      expect(relay.teams[0]?.seedLabel).toBe("1:52.54Y");
      expect(relay.teams[0]?.legs).toHaveLength(2);
      expect(relay.teams[0]?.legs.map((l) => l.legOrder)).toEqual([1, 2]);
      expect(relay.teams[0]?.legs[0]?.name).toBe("Orion Chaturvedi (SR)");
    }

    const free = report.events[1];
    expect(free?.kind).toBe("individual");
    if (free?.kind === "individual") {
      expect(free.athletes).toHaveLength(2);
      expect(free.athletes[0]?.seedLabel).toBe("35.16Y");
      expect(free.athletes[1]?.seedLabel).toBe("NT");
      expect(free.athletes[0]?.name).toBe("Juan Trejo (SR)");
    }

    expect(report.summary).toEqual({
      femaleIndividualEntries: 0,
      maleIndividualEntries: 2,
      totalIndividualEntries: 2,
      totalRelayEntries: 1,
      totalAthletes: 4,
    });

    const withAlts = buildMeetEntriesReport(snapshot, {
      includeRelayAlternates: true,
    });
    const relayWithAlts = withAlts.events[0];
    expect(relayWithAlts?.kind).toBe("relay");
    if (relayWithAlts?.kind === "relay") {
      expect(relayWithAlts.teams[0]?.legs.map((l) => l.legOrder)).toEqual([
        1, 2, 5,
      ]);
      expect(relayWithAlts.teams[0]?.legs[2]?.name).toContain("[Alt]");
      expect(relayWithAlts.teams[0]?.legs[2]?.isAlternate).toBe(true);
    }
    expect(withAlts.summary.totalAthletes).toBe(5);
  });

  it("groups by swimmer and includes opponents", () => {
    const snapshot = buildMeetLineupSnapshot({
      meet: {
        name: "Dual",
        startDate: "2026-09-12",
        course: "SCY",
        opponents: "Desert Ridge",
      },
      team: { name: "Maricopa", teamCode: "MARI" },
      events: [
        {
          id: "e7",
          eventNumber: 7,
          stroke: "free",
          distance: 50,
          gender: "male",
          eventKey: "50_free_scy_m",
        },
      ],
      entries: [
        {
          id: "a1",
          meetEventId: "e7",
          membershipId: "m-juan",
          seedTimeMs: 35_160,
          exhibition: false,
          status: "entered",
        },
      ],
      relayLegs: [],
      members: [
        {
          membershipId: "m-juan",
          swimmerId: "s-juan",
          firstName: "Juan",
          lastName: "Trejo",
          gender: "male",
        },
      ],
    });

    const report = buildMeetEntriesReport(snapshot, { groupBy: "swimmer" });
    expect(report.opponents).toBe("Desert Ridge");
    expect(report.groupBy).toBe("swimmer");
    expect(report.swimmers).toHaveLength(1);
    expect(report.swimmers[0]?.name).toContain("Juan");
    expect(report.swimmers[0]?.lines[0]?.eventLabel).toContain("50");
  });

  it("fills a blank team name, an address, and tied seeds", () => {
    expect(formatMeetDateCompact("not a date").endsWith("-Jan-")).toBe(false);
    expect(formatMeetDateCompact("not-a-date")).toContain("Jan");
    const snapshot = buildMeetLineupSnapshot({
      meet: { name: "Invite", startDate: "2026-09-12", course: "SCY" },
      team: {
        teamCode: "MARI",
        addressLine1: "1 Lane",
        city: "Phoenix",
        region: "AZ",
        postalCode: "85001",
      },
      relayLegs: [],
      events: [
        {
          id: "e1",
          eventNumber: 1,
          stroke: "free",
          distance: 50,
          gender: "female",
          eventKey: "50_free_scy_f",
        },
      ],
      entries: [
        {
          id: "a",
          meetEventId: "e1",
          membershipId: "m-a",
          seedTimeMs: 30_000,
          exhibition: false,
          status: "entered",
        },
        {
          id: "b",
          meetEventId: "e1",
          membershipId: "m-b",
          seedTimeMs: 30_000,
          exhibition: false,
          status: "entered",
        },
        {
          id: "c",
          meetEventId: "e1",
          membershipId: "m-c",
          seedTimeMs: 31_000,
          exhibition: false,
          status: "entered",
        },
      ],
      members: [
        {
          membershipId: "m-a",
          swimmerId: "s-a",
          firstName: "Bea",
          lastName: "Zed",
          gender: "female",
        },
        {
          membershipId: "m-b",
          swimmerId: "s-b",
          firstName: "Ann",
          lastName: "Young",
          gender: "open",
        },
        {
          membershipId: "m-c",
          swimmerId: "s-c",
          firstName: "Cy",
          lastName: "Male",
          gender: "male",
        },
      ],
    });
    const report = buildMeetEntriesReport(snapshot);
    expect(report.teamName).toBe("Team");
    expect(report.teamAddress).toBe("1 Lane, Phoenix, AZ, 85001");
    const athletes = report.events[0];
    expect(athletes?.kind).toBe("individual");
    if (athletes?.kind === "individual") {
      expect(athletes.athletes.map((a) => a.name)).toEqual([
        "Ann Young",
        "Bea Zed",
        "Cy Male",
      ]);
    }
    expect(report.summary.maleIndividualEntries).toBe(1);
  });

  it("keeps not-going swimmers and accepts coach overrides", () => {
    const snapshot = buildMeetLineupSnapshot({
      meet: {
        name: "Invite",
        startDate: "2026-09-12",
        course: "SCM",
      },
      team: {
        name: "Maricopa",
        teamCode: "MARI",
        addressLine1: "1 Main",
        city: "Maricopa",
        region: "AZ",
        postalCode: "85138",
        contactName: "Head Coach",
      },
      events: [
        {
          id: "e1",
          eventNumber: 1,
          stroke: "free",
          distance: 50,
          gender: "female",
          eventKey: "50_free_scm_f",
        },
        {
          id: "e2",
          eventNumber: 2,
          stroke: "free_relay",
          distance: 200,
          gender: "female",
          eventKey: "200_free_relay_scm_f",
        },
      ],
      entries: [
        {
          id: "a1",
          meetEventId: "e1",
          membershipId: "m1",
          seedTimeMs: 28000,
          exhibition: true,
          status: "approved",
        },
      ],
      relayLegs: [],
      commitments: [{ membershipId: "m1", status: "not_going" }],
      members: [
        {
          membershipId: "m1",
          swimmerId: "s1",
          firstName: "Alex",
          lastName: "Smith",
          gender: "female",
        },
      ],
    });

    const report = buildMeetEntriesReport(snapshot, {
      coachName: "Session Coach",
      coachEmail: "s@x.com",
      teamAddress: "Override",
    });

    expect(report.events[0]?.kind).toBe("individual");
    expect(report.coachName).toBe("Session Coach");
    expect(report.teamAddress).toBe("Override");
    expect(report.courseLabel).toBe("Short Course Meters");
    if (report.events[0]?.kind === "individual") {
      expect(report.events[0].athletes[0]?.seedLabel).toBe("28.00S ex");
    }
  });

  it("keeps one athlete per swimmer when the same event is entered twice", () => {
    const snapshot = buildMeetLineupSnapshot({
      meet: { name: "Dual", startDate: "2026-09-12", course: "SCY" },
      team: { name: "Maricopa" },
      events: [
        {
          id: "e7",
          eventNumber: 7,
          stroke: "free",
          distance: 50,
          gender: "male",
          eventKey: "50_free_scy_m",
        },
      ],
      entries: [
        {
          id: "dup-slow",
          meetEventId: "e7",
          membershipId: "m-juan",
          seedTimeMs: 40_000,
          exhibition: false,
          status: "entered",
        },
        {
          id: "dup-fast",
          meetEventId: "e7",
          membershipId: "m-juan",
          seedTimeMs: 35_160,
          exhibition: false,
          status: "entered",
        },
      ],
      relayLegs: [],
      members: [
        {
          membershipId: "m-juan",
          swimmerId: "s-juan",
          firstName: "Juan",
          lastName: "Trejo",
          gender: "male",
        },
      ],
    });

    const report = buildMeetEntriesReport(snapshot);
    expect(report.events[0]?.kind).toBe("individual");
    if (report.events[0]?.kind === "individual") {
      expect(report.events[0].athletes).toHaveLength(1);
      expect(report.events[0].athletes[0]?.entryId).toBe("dup-fast");
      expect(report.events[0].athletes[0]?.seedLabel).toBe("35.16Y");
    }
    expect(report.summary.totalIndividualEntries).toBe(1);
  });
});
