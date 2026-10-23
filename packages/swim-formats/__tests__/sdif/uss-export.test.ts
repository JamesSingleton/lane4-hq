import { describe, expect, it } from "vitest";
import { hy3FileDate } from "../../src/export/meet";
import { parseUssSdif } from "../../src/sdif/uss";
import { exportUssSdif, ussAgeCode } from "../../src/sdif/uss-export";
import type { ParsedMeet } from "../../src/types";

function linesOf(text: string): string[] {
  expect(text.endsWith("\r\n")).toBe(true);
  const lines = text.split("\r\n").filter((line) => line.length > 0);
  expect(lines.every((line) => line.length === 160)).toBe(true);
  return lines;
}

describe("ussAgeCode", () => {
  it("encodes open, under, over, and ranged ages", () => {
    expect(ussAgeCode()).toBe("UNOV");
    expect(ussAgeCode("open")).toBe("UNOV");
    expect(ussAgeCode("8&U")).toBe("UN08");
    expect(ussAgeCode("15&O")).toBe("15OV");
    expect(ussAgeCode("0-6")).toBe("UN06");
    expect(ussAgeCode("11-11")).toBe("1111");
  });
});

describe("exportUssSdif", () => {
  const meet: ParsedMeet = {
    name: "Summer Champs",
    course: "SCY",
    startDate: "2026-06-07",
    ageUpDate: "2026-05-01",
    location: "Kingwood, TX",
    teamCode: "BB",
    teamName: "Bear Branch Swim Team",
    teamShortName: "Bear Branch",
    teamAddressLine1: "2261 Northpark Dr",
    teamAddressLine2: "#122",
    teamCity: "Kingwood",
    teamRegion: "TX",
    importKind: "entries",
    events: [
      {
        eventNumber: 42,
        eventSuffix: "A",
        distance: 50,
        stroke: "back",
        gender: "female",
        ageGroup: "11-11",
        eventKey: "50_back_scy_f",
      },
      {
        eventNumber: 42,
        eventSuffix: "K",
        distance: 50,
        stroke: "breast",
        gender: "female",
        ageGroup: "0-6",
        eventKey: "50_breast_scy_f",
      },
      {
        eventNumber: 3,
        distance: 100,
        stroke: "free",
        gender: "female",
        ageGroup: "8&U",
        eventKey: "100_free_scy_f",
      },
      {
        eventNumber: 7,
        eventSuffix: "A",
        distance: 200,
        stroke: "free_relay",
        gender: "female",
        ageGroup: "15&O",
        eventKey: "200_free_relay_scy_f",
      },
      {
        eventNumber: 8,
        distance: 200,
        stroke: "medley_relay",
        gender: "mixed",
        ageGroup: "13-14",
        eventKey: "200_medley_relay_scy_x",
      },
      {
        eventNumber: 9,
        distance: 100,
        stroke: "fly",
        gender: "male",
        ageGroup: "open",
        eventKey: "100_fly_scy_m",
      },
      {
        eventNumber: 10,
        distance: 200,
        stroke: "im",
        gender: "male",
        eventKey: "200_im_scy_m",
      },
    ],
    entries: [
      {
        eventNumber: 42,
        eventSuffix: "A",
        swimmerName: "Ada Lane",
        legalFirstName: "Ada",
        preferredName: "Addy",
        middleInitial: "Q",
        usaMemberId: "0123456789ABCD",
        dateOfBirth: "2015-01-22",
        gender: "female",
        seedTime: "49.17",
        seedCourse: "SCY",
      },
      {
        eventNumber: 42,
        eventSuffix: "K",
        swimmerName: "Ada Lane",
        preferredName: "Other",
        usaMemberId: "KEEPS-FIRST-ID",
        dateOfBirth: "2015-01-22",
        gender: "female",
        seedTime: "NT",
      },
      {
        eventNumber: 9,
        swimmerName: "Bo Fly",
        dateOfBirth: "not-a-date",
        gender: "male",
        seedTime: "1:02.00",
        seedCourse: "LCM",
      },
      {
        eventNumber: 10,
        swimmerName: "Cy Im",
        dateOfBirth: "2014-06-01",
        seedTime: "2:07.53",
      },
      {
        eventNumber: 99,
        swimmerName: " ",
        seedTime: "nope",
      },
      {
        eventNumber: 3,
        swimmerName: "May Late",
        dateOfBirth: "2015-05-20",
        gender: "female",
        seedTime: "40.00",
      },
      {
        eventNumber: 3,
        swimmerName: "May Same",
        dateOfBirth: "2015-05-01",
        gender: "female",
        seedTime: "41.00",
      },
    ],
    athletes: [
      { name: "   " },
      {
        name: "Ada Lane",
        legalFirstName: "Should Not Replace",
        preferredName: "Nope",
        middleInitial: "Z",
        usaMemberId: "SHOULD-NOT",
        gender: "male",
      },
      {
        name: "Bo Fly",
        usaMemberId: "BOFLYID12345",
        gender: "male",
      },
      {
        name: "Dee Only",
        dateOfBirth: "2016-04-04",
        gender: "female",
        relayOnly: true,
      },
      {
        name: "Extra Leg",
        dateOfBirth: "2013-03-03",
        gender: "male",
      },
      {
        name: "Fifth Kid",
        dateOfBirth: "2012-02-02",
        gender: "male",
      },
    ],
    relays: [
      {
        eventNumber: 7,
        eventSuffix: "A",
        relayLetter: "A",
        teamCode: "BB",
        seedTime: "2:07.53",
        swimmerNames: [
          "Ada Lane",
          "Dee Only",
          "Cy Im",
          "Extra Leg",
          "Fifth Kid",
        ],
      },
      {
        eventNumber: 8,
        relayLetter: "B",
        seedTime: "",
        swimmerNames: [],
      },
      {
        relayLetter: "C",
        swimmerNames: ["No Dob", " "],
      },
    ],
    results: [],
  };

  it("round-trips SwimTopia entry columns with Lane4 HQ branding", () => {
    const text = exportUssSdif(meet);
    const lines = linesOf(text);
    const a0 = lines[0]!;
    expect(a0.slice(0, 13)).toBe("A01V3      01");
    expect(a0.slice(43, 63)).toBe("Lane4 HQ".padEnd(20, " "));
    expect(a0.slice(63, 73)).toBe("1.0".padEnd(10, " "));
    expect(a0.slice(73, 93)).toBe("Lane4 HQ".padEnd(20, " "));
    expect(a0.slice(93, 105)).toBe(" ".repeat(12));
    expect(a0.slice(105, 113)).toBe(hy3FileDate());
    expect(a0).not.toContain("Swimtopia");
    expect(a0).not.toContain("877");

    const b1 = lines.find((line) => line.startsWith("B1"))!;
    expect(b1.slice(11, 24)).toBe("Summer Champs");
    expect(b1.slice(85, 93)).toBe("Kingwood");
    expect(b1.slice(105, 107)).toBe("TX");
    expect(b1.slice(117, 121)).toBe("USA9");
    expect(b1.slice(121, 137)).toBe("0607202606072026");
    expect(b1[149]).toBe("Y");

    const c1 = lines.find((line) => line.startsWith("C1"))!;
    expect(c1.slice(11, 17)).toBe("  BB  ");
    expect(c1.slice(17, 47).trim()).toBe("Bear Branch Swim Team");

    const d0 = lines.filter((line) => line.startsWith("D0"));
    expect(d0[0]?.slice(11, 39).trim()).toBe("Lane, Ada Q");
    expect(d0[0]?.slice(39, 51)).toBe("0123456789AB");
    expect(d0[0]?.slice(55, 63)).toBe("01222015");
    expect(d0[0]?.slice(72, 80)).toBe(" 42A1111");
    expect(d0[0]?.slice(88, 97)).toBe("   49.17Y");
    expect(d0[1]?.slice(72, 76)).toBe(" 42K");
    expect(d0[1]?.slice(76, 80)).toBe("UN06");
    expect(d0[1]?.slice(88, 96)).toBe(" ".repeat(8));
    const bo = d0.find((line) => line.slice(11, 39).includes("Fly"));
    expect(bo?.slice(39, 51)).toBe("BOFLYID12345");
    const adaLines = lines.filter(
      (line) => line.startsWith("D0") || line.startsWith("D3"),
    );
    expect(adaLines[0]?.startsWith("D0")).toBe(true);
    expect(adaLines[1]?.startsWith("D3")).toBe(true);
    expect(adaLines[1]?.slice(2, 16)).toBe("0123456789ABCD");
    expect(adaLines[1]?.slice(16, 31)).toBe("Addy".padEnd(15, " "));
    expect(adaLines[2]?.startsWith("D0")).toBe(true);

    const e0 = lines.filter((line) => line.startsWith("E0"));
    expect(e0[0]?.slice(11, 21)).toBe("A  BB   5F");
    expect(e0[0]?.slice(20, 21)).toBe("F");
    expect(e0[0]?.[25]).toBe("6");
    expect(e0[1]?.[25]).toBe("7");
    expect(e0[1]?.[20]).toBe("X");
    const f0 = lines.filter((line) => line.startsWith("F0"));
    expect(f0.map((line) => line.slice(76, 79)).slice(0, 5)).toEqual([
      "111",
      "222",
      "333",
      "444",
      "555",
    ]);
    expect(f0[1]?.slice(22, 50).trim()).toBe("Only, Dee");

    const z0 = lines.find((line) => line.startsWith("Z0"))!;
    expect(z0.slice(11, 13)).toBe("01");
    expect(z0.slice(43, 46).trim()).toBe("1");
    expect(z0.slice(57, 63).trim()).toBe(
      String(d0.length + lines.filter((line) => line.startsWith("D3")).length),
    );
    expect(Number(z0.slice(69, 74))).toBe(e0.length);
    expect(Number(z0.slice(74, 80))).toBe(f0.length);

    const parsed = parseUssSdif(text);
    expect(parsed.importKind).toBe("entries");
    expect(parsed.teamCode).toBe("BB");
    expect(parsed.entries.map((entry) => entry.eventSuffix)).toContain("A");
    expect(
      parsed.entries.find((entry) => entry.eventSuffix === "A")?.seedTime,
    ).toBe("49.17");
    expect(
      parsed.entries.find((entry) => entry.eventSuffix === "A")?.swimmerName,
    ).toBe("Addy Lane");
    expect(parsed.relays?.[0]?.swimmerNames).toEqual([
      "Ada Lane",
      "Dee Only",
      "Cy Im",
      "Extra Leg",
      "Fifth Kid",
    ]);
  });

  it("writes a results file from result rows and leaves an unknown place blank", () => {
    const results = exportUssSdif({
      name: "Finals",
      course: "SCM",
      location: "Natatorium",
      importKind: "results",
      events: [
        {
          eventNumber: 1,
          distance: 100,
          stroke: "free",
          gender: "male",
          ageGroup: "11-12",
          eventKey: "100_free_scm_m",
        },
      ],
      entries: [],
      results: [
        {
          eventNumber: 1,
          swimmerName: "Owen Result",
          time: "1:01.02",
          gender: "male",
          dateOfBirth: "2012-08-08",
        },
        {
          eventNumber: 1,
          swimmerName: "Owen Result",
          time: "NT",
          gender: "male",
          dateOfBirth: "2012-08-08",
        },
      ],
    });
    const lines = linesOf(results);
    expect(lines[0]?.slice(11, 13)).toBe("02");
    const d0 = lines.find((line) => line.startsWith("D0"))!;
    expect(d0.slice(115, 123).trim()).toBe("1:01.02");
    expect(d0[123]).toBe("S");
    expect(lines.find((line) => line.startsWith("B1"))?.[149]).toBe("S");

    const bare = exportUssSdif({
      name: "Bare",
      course: "LCM",
      entries: [
        {
          eventNumber: 4,
          swimmerName: "Future Kid",
          dateOfBirth: "2099-01-01",
          gender: "female",
          seedTime: "30.00",
        },
      ],
      events: [
        {
          eventNumber: 4,
          distance: 50,
          stroke: "free",
          gender: "female",
          eventKey: "50_free",
        },
      ],
      results: [
        {
          swimmerName: "Ignored Because Entries Exist",
          time: "40.00",
        },
      ],
      relays: [
        {
          swimmerNames: ["Future Kid"],
          seedTime: "1:00.00",
        },
      ],
    });
    const bareLines = linesOf(bare);
    expect(bareLines[0]?.slice(11, 13)).toBe("01");
    expect(bareLines.find((line) => line.startsWith("B1"))?.[149]).toBe("L");
    expect(
      bareLines
        .find((line) => line.startsWith("D0"))
        ?.slice(63, 65)
        .trim(),
    ).toBe("0");

    const resultsOnly = exportUssSdif({
      name: "Results Only",
      course: "SCY",
      entries: [],
      events: [],
      results: [
        {
          swimmerName: "Solo",
          time: "25.00",
        },
      ],
    });
    expect(linesOf(resultsOnly)[0]?.slice(11, 13)).toBe("02");
  });
});
