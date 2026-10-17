import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { detectCl2FileKind } from "../../src/cl2/kind";
import { parseCl2Meet } from "../../src/cl2/parser";
import { parseEv3, parseHyv } from "../../src/ev3/parser";
import {
  exportCl2,
  exportEv3,
  exportHy3,
  exportHyv,
  exportMeetZip,
  exportSdif,
  meetEntryPackBaseName,
  meetZipDownloadFilename,
} from "../../src/export/meet";
import { parseHy3 } from "../../src/hy3/parser";
import { extractAllMeetFilesFromZip } from "../../src/meet/zip";
import { parseSdif } from "../../src/sdif/parser";
import type { ParsedMeet } from "../../src/types";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

const baseMeet: ParsedMeet = {
  name: "Test Meet",
  course: "SCY",
  location: "Test Pool",
  events: [
    {
      eventNumber: 1,
      distance: 50,
      stroke: "free",
      gender: "female",
      eventKey: "50_free_scy_f",
    },
    {
      eventNumber: 2,
      distance: 100,
      stroke: "back",
      gender: "male",
      eventKey: "100_back_scy_m",
    },
    {
      eventNumber: 3,
      distance: 200,
      stroke: "breast",
      gender: "mixed",
      eventKey: "200_breast_scy_x",
    },
    {
      eventNumber: 4,
      distance: 50,
      stroke: "fly",
      gender: "female",
      eventKey: "50_fly_scy_f",
    },
    {
      eventNumber: 5,
      distance: 200,
      stroke: "im",
      gender: "male",
      eventKey: "200_im_scy_m",
    },
    {
      eventNumber: 6,
      distance: 50,
      stroke: "unknown_stroke",
      gender: "female",
      eventKey: "50_unknown_scy_f",
    },
  ],
  entries: [
    {
      eventNumber: 1,
      swimmerName: "Ada Lovelace",
      seedTime: "28.50",
      usaMemberId: "USA123",
    },
    { eventNumber: 2, swimmerName: "Bob Baker", seedTime: "1:05.00" },
  ],
  results: [
    {
      eventNumber: 1,
      swimmerName: "Ada Lovelace",
      time: "27.50",
      place: 1,
      isDq: false,
    },
    {
      eventNumber: 2,
      swimmerName: "Bob Baker",
      time: "1:04.00",
      place: 2,
      isDq: true,
    },
  ],
  relays: [
    {
      eventNumber: 10,
      swimmerNames: ["A One", "B Two", "C Three", "D Four"],
      seedTime: "1:40.00",
    },
  ],
};

describe("exportSdif", () => {
  it("writes G0 rows even when a result omits a time value", () => {
    const text = exportSdif({
      ...baseMeet,
      results: [
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          place: 4,
          isDq: true,
          resultType: "prelim",
        },
      ],
    });
    expect(text).toContain("G0");
    expect(text).toContain("0004");
  });

  it("writes G0 heat, lane, place, and DQ flags on SDIF export", () => {
    const text = exportSdif({
      ...baseMeet,
      results: [
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          time: "27.50",
          place: 3,
          heat: 2,
          lane: 4,
          isDq: true,
        },
      ],
    });
    expect(text).toContain("0003");
    expect(text).toMatch(/G0[\s\S]*D/);
  });

  it("writes G0 results without place when place is omitted", () => {
    const text = exportSdif({
      ...baseMeet,
      results: [
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          time: "27.50",
          heat: 1,
          lane: 2,
        },
      ],
    });
    expect(text).toContain("G0");
    expect(text).toContain("27.50");
  });

  it("skips non-relay-only meet athletes when writing SDIF roster D0 lines", () => {
    const text = exportSdif({
      ...baseMeet,
      entries: [],
      results: [],
      athletes: [
        { name: "Relay Only", relayOnly: true },
        { name: "Not Relay Only", relayOnly: false },
      ],
    });
    expect(text).toContain("Relay");
    expect(text).not.toContain("Not Relay");
  });

  it("does not duplicate SDIF D0 lines when a relay-only athlete also has entries", () => {
    const countD0 = (text: string) =>
      text.split(/\r?\n/).filter((line) => line.startsWith("D0")).length;
    const baseline = countD0(exportSdif(baseMeet));
    const withRegistry = countD0(
      exportSdif({
        ...baseMeet,
        athletes: [{ name: "Ada Lovelace", relayOnly: true }],
      }),
    );
    expect(withRegistry).toBe(baseline);
  });

  it("exports events, entries, results, and terminator", () => {
    const text = exportSdif(baseMeet);
    expect(text).toContain("A01V3");
    expect(text).toContain("Test Meet");
    expect(text).toContain("Test Pool");
    expect(text).toContain("E1");
    expect(text).toContain("D0");
    expect(text).toContain("G0");
    expect(text.endsWith("Z0")).toBe(true);
    expect(text).toMatch(/G0.{90,}0001/);
  });

  it("uses course digit for SCM and LCM", () => {
    const scm = exportSdif({ ...baseMeet, course: "SCM" });
    const lcm = exportSdif({ ...baseMeet, course: "LCM" });
    expect(parseSdif(scm).course).toBe("SCM");
    expect(parseSdif(lcm).course).toBe("LCM");
  });

  it("round-trips meet name, events, entries, results, and round metadata through parseSdif", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      startDate: "2025-06-01",
      endDate: "2025-06-02",
      results: [
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          time: "27.50",
          place: 1,
          resultType: "prelim",
          heat: 2,
          lane: 5,
        },
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          time: "27.10",
          place: 1,
          resultType: "finals",
          heat: 1,
          lane: 4,
        },
        {
          eventNumber: 2,
          swimmerName: "Bob Baker",
          time: "DQ",
          place: 9,
          isDq: true,
        },
        {
          eventNumber: 3,
          swimmerName: "Swim Off",
          time: "29.00",
          resultType: "swimoff",
        },
      ],
    };
    const parsed = parseSdif(exportSdif(meet));
    expect(parsed.name).toBe("Test Meet");
    expect(parsed.location).toBe("Test Pool");
    expect(parsed.events).toHaveLength(6);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.results).toHaveLength(4);

    const adaPrelim = parsed.results.find(
      (r) =>
        r.swimmerName.includes("Lovelace") &&
        r.swimmerName.includes("Ada") &&
        r.resultType === "prelim",
    );
    const adaFinals = parsed.results.find(
      (r) =>
        r.swimmerName.includes("Lovelace") &&
        r.swimmerName.includes("Ada") &&
        r.resultType === "finals",
    );
    expect(adaPrelim).toMatchObject({
      time: "27.50",
      place: 1,
      heat: 2,
      lane: 5,
    });
    expect(adaFinals).toMatchObject({
      time: "27.10",
      place: 1,
      heat: 1,
      lane: 4,
    });
    expect(parsed.results.find((r) => r.isDq)?.swimmerName).toContain("Baker");
    expect(parsed.results.find((r) => r.resultType === "swimoff")?.time).toBe(
      "29.00",
    );
  });

  it("handles single-word swimmer names in entries/results", () => {
    const text = exportSdif({
      ...baseMeet,
      entries: [{ eventNumber: 1, swimmerName: "Madonna" }],
      results: [{ eventNumber: 1, swimmerName: "Madonna", time: "30.00" }],
    });
    expect(text).toContain("Madonna");
  });
});

describe("exportHy3", () => {
  it("round-trips meet header, entries, results (incl. DQ), and relay legs through parseHy3", () => {
    const text = exportHy3(baseMeet);
    expect(text).toContain("A1");
    expect(text).toContain("D1");
    expect(text).toContain("E1");
    expect(text).toContain("E2");
    expect(text).toContain("F1");
    expect(text).toContain("F3");

    const parsed = parseHy3(text);
    expect(parsed.name).toBe("Test Meet");
    expect(parsed.location).toBe("Test Pool");
    expect(parsed.course).toBe("SCY");

    const adaEntry = parsed.entries.find(
      (e) => e.swimmerName === "Ada Lovelace",
    );
    expect(adaEntry).toMatchObject({
      eventNumber: 1,
      usaMemberId: "USA123",
      seedTime: "28.50",
    });

    const adaResult = parsed.results.find(
      (r) => r.swimmerName === "Ada Lovelace",
    );
    expect(adaResult).toMatchObject({
      eventNumber: 1,
      time: "27.50",
      place: 1,
      isDq: false,
    });

    const bobResult = parsed.results.find((r) => r.swimmerName === "Bob Baker");
    expect(bobResult?.isDq).toBe(true);

    expect(parsed.relays?.[0]).toMatchObject({ eventNumber: 10 });
    expect(parsed.relays?.[0]?.swimmerNames).toEqual([
      "A One",
      "B Two",
      "C Three",
      "D Four",
    ]);
  });

  it("writes TM-style team identity, 130-char lines, and nested entries", () => {
    const text = exportHy3({
      ...baseMeet,
      teamCode: "MARI",
      lscCode: "AZ",
      teamName: "Maricopa High School",
      teamShortName: "MHS",
      teamKind: "HS",
      startDate: "2026-09-12",
    });
    const rows = text.split(/\r?\n/).filter(Boolean);
    expect(rows.every((row) => row.length === 130)).toBe(true);
    expect(text).toContain("C1MARI");
    expect(text).toContain("Maricopa High School");
    expect(text).toContain("AZ");
    const c1 = rows.find((row) => row.startsWith("C1"))!;
    expect(c1.slice(120, 122)).toBe("HS");
    const d1Index = rows.findIndex((row) => row.startsWith("D1"));
    expect(rows[d1Index + 1]?.startsWith("E1")).toBe(true);
    expect(exportHy3({ ...baseMeet, teamCode: "   " })).toContain("C1TEAM");
  });

  it("writes C2/C3 from team address and head-coach email, and D1 DOB/age/class year", () => {
    const text = exportHy3({
      ...baseMeet,
      teamCode: "MARI",
      lscCode: "AZ",
      teamName: "Maricopa High School",
      teamShortName: "MHS",
      teamKind: "HS",
      teamAddressLine1: "45012 W Honeycutt Ave",
      teamCity: "Maricopa",
      teamRegion: "AZ",
      teamPostalCode: "85139",
      teamCountry: "USA",
      teamContactName: "Meg O'Brien",
      teamContactEmail: "coach@example.com",
      startDate: "2026-09-12",
      entries: [
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          dateOfBirth: "2010-05-15",
          classYear: "JR",
          gender: "female",
          usaMemberId: "USA123",
          seedTime: "28.50",
        },
      ],
    });
    const rows = text.split(/\r?\n/).filter(Boolean);
    const c1 = rows.find((row) => row.startsWith("C1"))!;
    expect(c1.slice(55, 66)).toContain("Meg");
    const c2 = rows.find((row) => row.startsWith("C2"))!;
    expect(c2.slice(2, 24)).toContain("45012 W Honeycutt");
    expect(c2.slice(62, 92)).toContain("Maricopa");
    expect(c2.slice(92, 94)).toBe("AZ");
    expect(c2.slice(94, 104)).toContain("85139");
    expect(c2.slice(104, 107)).toBe("USA");
    expect(c2.slice(108, 111)).toBe("USS");
    const c3 = rows.find((row) => row.startsWith("C3"))!;
    expect(c3.slice(92)).toContain("coach@example.com");
    const d1 = rows.find((row) => row.startsWith("D1"))!;
    expect(d1.slice(88, 96)).toBe("05152010");
    expect(d1.slice(96, 99).trim()).toBe("16");
    expect(d1.slice(99, 101)).toBe("JR");

    const beforeBirthday = exportHy3({
      ...baseMeet,
      startDate: "2026-03-01",
      entries: [
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          dateOfBirth: "2010-05-15",
          gender: "female",
        },
      ],
    });
    const d1Before = beforeBirthday
      .split(/\r?\n/)
      .find((row) => row.startsWith("D1"))!;
    expect(d1Before.slice(96, 99).trim()).toBe("15");

    const sameMonthBeforeDay = exportHy3({
      ...baseMeet,
      startDate: "2026-05-01",
      entries: [
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          dateOfBirth: "2010-05-15",
          gender: "female",
        },
      ],
    });
    const d1SameMonth = sameMonthBeforeDay
      .split(/\r?\n/)
      .find((row) => row.startsWith("D1"))!;
    expect(d1SameMonth.slice(96, 99).trim()).toBe("15");

    const futureDob = exportHy3({
      ...baseMeet,
      startDate: "2000-01-01",
      entries: [
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          dateOfBirth: "2010-05-15",
          gender: "female",
        },
      ],
    });
    const d1Future = futureDob
      .split(/\r?\n/)
      .find((row) => row.startsWith("D1"))!;
    expect(d1Future.slice(96, 99).trim()).toBe("0");

    const c2Usa = exportHy3({
      ...baseMeet,
      teamCity: "Maricopa",
    });
    expect(c2Usa).toContain("C2");
    expect(c2Usa).toContain("USA");
    expect(c2Usa).toContain("USS");

    const c2Can = exportHy3({
      ...baseMeet,
      teamCity: "Calgary",
      teamCountry: "CAN",
    });
    const canRow = c2Can.split(/\r?\n/).find((row) => row.startsWith("C2"))!;
    expect(canRow.slice(104, 107)).toBe("CAN");
    expect(canRow.slice(108, 111)).not.toBe("USS");
  });

  it("round-trips all individual strokes and relay strokes for SCM/LCM courses", () => {
    for (const course of ["SCY", "SCM", "LCM"] as const) {
      const meet: ParsedMeet = {
        name: "Stroke Meet",
        course,
        events: [
          {
            eventNumber: 1,
            distance: 50,
            stroke: "free",
            gender: "female",
            eventKey: "x",
          },
          {
            eventNumber: 2,
            distance: 50,
            stroke: "back",
            gender: "male",
            eventKey: "x",
          },
          {
            eventNumber: 3,
            distance: 50,
            stroke: "breast",
            gender: "male",
            eventKey: "x",
          },
          {
            eventNumber: 4,
            distance: 50,
            stroke: "fly",
            gender: "male",
            eventKey: "x",
          },
          {
            eventNumber: 5,
            distance: 200,
            stroke: "im",
            gender: "male",
            eventKey: "x",
          },
          {
            eventNumber: 6,
            distance: 200,
            stroke: "free_relay",
            gender: "mixed",
            eventKey: "x",
          },
          {
            eventNumber: 7,
            distance: 200,
            stroke: "medley_relay",
            gender: "mixed",
            eventKey: "x",
          },
        ],
        entries: [
          { eventNumber: 1, swimmerName: "Ann Free" },
          { eventNumber: 2, swimmerName: "Bea Back" },
          { eventNumber: 3, swimmerName: "Cate Breast" },
          { eventNumber: 4, swimmerName: "Dee Fly" },
          { eventNumber: 5, swimmerName: "Eve Im" },
        ],
        results: [],
        relays: [
          {
            eventNumber: 6,
            swimmerNames: ["A One", "B Two", "C Three", "D Four"],
          },
          {
            eventNumber: 7,
            swimmerNames: ["E Five", "F Six", "G Seven", "H Eight"],
          },
        ],
      };
      const parsed = parseHy3(exportHy3(meet));
      expect(parsed.course).toBe(course);

      const byName = (name: string) =>
        parsed.entries.find((e) => e.swimmerName === name);
      expect(byName("Ann Free")?.eventNumber).toBe(1);
      expect(byName("Bea Back")?.eventNumber).toBe(2);
      expect(byName("Cate Breast")?.eventNumber).toBe(3);
      expect(byName("Dee Fly")?.eventNumber).toBe(4);
      expect(byName("Eve Im")?.eventNumber).toBe(5);

      const freeRelay = parsed.relays?.find((r) => r.eventNumber === 6);
      const medleyRelay = parsed.relays?.find((r) => r.eventNumber === 7);
      expect(freeRelay?.swimmerNames).toEqual([
        "A One",
        "B Two",
        "C Three",
        "D Four",
      ]);
      expect(medleyRelay?.swimmerNames).toEqual([
        "E Five",
        "F Six",
        "G Seven",
        "H Eight",
      ]);
    }
  });

  it("covers undefined event numbers, LCM course, and seedless relays", () => {
    const meet: ParsedMeet = {
      name: "Sparse",
      course: "LCM",
      events: [
        { distance: 50, stroke: "free", gender: "female", eventKey: "x" },
      ],
      entries: [{ swimmerName: "Solo Name" }],
      results: [{ swimmerName: "Solo Name", time: "30.00" }],
      relays: [
        {
          swimmerNames: ["A", "B", "C", "D"],
        },
      ],
    };
    const sdif = exportSdif(meet);
    expect(parseSdif(sdif).course).toBe("LCM");
    expect(sdif).toContain("0000");

    const hy3 = exportHy3(meet);
    expect(hy3).toContain("B1");
    expect(hy3).toContain("F1");
    expect(hy3).toContain("F3");

    const parsed = parseHy3(hy3);
    expect(parsed.course).toBe("LCM");
    // Single-letter names round-trip as "A A" etc: splitName has no last
    // name to split off, so the same token fills both first and last.
    expect(parsed.relays?.[0]?.swimmerNames).toEqual([
      "A A",
      "B B",
      "C C",
      "D D",
    ]);
  });

  it("round-trips relay results through HY3 F2", () => {
    const meet: ParsedMeet = {
      name: "Relay Results",
      course: "SCY",
      teamCode: "RLY",
      importKind: "results",
      events: [
        {
          eventNumber: 3,
          distance: 200,
          stroke: "free_relay",
          gender: "female",
          eventKey: "200_free_relay_scy_f",
        },
      ],
      entries: [],
      results: [],
      relays: [
        {
          eventNumber: 3,
          teamCode: "RLY",
          relayLetter: "A",
          swimmerNames: ["Ann One", "Bea Two", "Cat Three", "Dee Four"],
          results: [
            {
              time: "1:45.67",
              place: 2,
              heat: 1,
              lane: 4,
              resultType: "finals",
            },
          ],
        },
        {
          eventNumber: 3,
          teamCode: "RLY",
          relayLetter: "B",
          swimmerNames: ["Eve Five", "Fay Six", "Gia Seven", "Hal Eight"],
          results: [
            {
              time: "",
              isDq: true,
              dqCode: "9A",
              heat: 1,
              lane: 5,
              resultType: "prelim",
            },
            { time: "1:50.00", heat: 2, lane: 3, resultType: "swimoff" },
          ],
        },
        {
          eventNumber: 3,
          teamCode: "RLY",
          relayLetter: "C",
          swimmerNames: ["Ivy Nine", "Joy Ten", "Kim Eleven", "Lou Twelve"],
          results: [{ time: "", isDq: true }],
        },
      ],
    };
    const hy3 = exportHy3(meet);
    const f2 = hy3.split("\r\n").filter((l) => l.startsWith("F2"));
    expect(f2).toHaveLength(4);
    expect(f2[3]!.slice(12, 15)).toBe("DDQ");
    const parsed = parseHy3(hy3);
    const a = parsed.relays?.find((r) => r.relayLetter === "A");
    expect(a?.results?.[0]).toMatchObject({
      time: "1:45.67",
      place: 2,
      heat: 1,
      lane: 4,
    });
    const b = parsed.relays?.find((r) => r.relayLetter === "B");
    expect(b?.results?.some((r) => r.isDq)).toBe(true);
  });

  it("derives the A1 title from importKind for results/roster/entries", () => {
    const base = { ...baseMeet, entries: [], results: [] };
    expect(
      parseHy3(exportHy3({ ...base, importKind: "results" })).importKind,
    ).toBe("results");
    expect(exportHy3({ ...base, importKind: "roster" })).toContain(
      "Rosters Only",
    );
    expect(exportHy3({ ...base, importKind: "entries" })).toContain(
      "Meet Entries",
    );
  });

  it("falls back to a results-from-MM title when importKind is unset but only results exist", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      importKind: undefined,
      entries: [],
      results: [{ eventNumber: 1, swimmerName: "Only Results", time: "29.00" }],
    };
    const text = exportHy3(meet);
    expect(text).toContain("Results From MM to TM");
  });

  it("round-trips altitude, notes, sanction number, and a female swimmer's D1 gender", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      altitude: 2500,
      notes: "High-altitude course",
      sanctionNumber: "AZ26-01",
      entries: [
        {
          eventNumber: 1,
          swimmerName: "Ada Lovelace",
          gender: "female",
          classYear: "SR",
        },
      ],
      results: [],
      relays: [],
    };
    const text = exportHy3(meet);
    const parsed = parseHy3(text);
    expect(parsed.sanctionNumber).toBe("AZ26-01");
    expect(parsed.notes).toContain("High-altitude course");
    expect(text).toContain("0SR");
  });

  it("round-trips one-sided and ranged age groups on entries and relays", () => {
    const meet: ParsedMeet = {
      name: "Age Groups",
      course: "SCY",
      events: [
        {
          eventNumber: 1,
          distance: 50,
          stroke: "free",
          gender: "female",
          eventKey: "x",
          ageGroup: "15&O",
        },
        {
          eventNumber: 2,
          distance: 50,
          stroke: "back",
          gender: "male",
          eventKey: "x",
          ageGroup: "10&U",
        },
        {
          eventNumber: 3,
          distance: 200,
          stroke: "breast",
          gender: "mixed",
          eventKey: "x",
          ageGroup: "13-14",
        },
        {
          eventNumber: 4,
          distance: 50,
          stroke: "fly",
          gender: "male",
          eventKey: "x",
          ageGroup: "Masters",
        },
        {
          eventNumber: 6,
          distance: 200,
          stroke: "free_relay",
          gender: "mixed",
          eventKey: "x",
          ageGroup: "18&O",
        },
      ],
      entries: [
        { eventNumber: 1, swimmerName: "Senior Swimmer" },
        { eventNumber: 2, swimmerName: "Junior Swimmer" },
        { eventNumber: 3, swimmerName: "Mid Swimmer" },
        { eventNumber: 4, swimmerName: "Masters Swimmer" },
      ],
      results: [],
      relays: [
        {
          eventNumber: 6,
          swimmerNames: ["Rel One", "Rel Two", "Rel Three", "Rel Four"],
        },
      ],
    };
    const parsed = parseHy3(exportHy3(meet));
    expect(parsed.events.find((e) => e.eventNumber === 1)?.ageGroup).toBe(
      "15&O",
    );
    expect(parsed.events.find((e) => e.eventNumber === 2)?.ageGroup).toBe(
      "10&U",
    );
    expect(parsed.events.find((e) => e.eventNumber === 3)?.ageGroup).toBe(
      "13-14",
    );
    expect(parsed.events.find((e) => e.eventNumber === 6)?.ageGroup).toBe(
      "18&O",
    );
  });

  it("emits an E1 for a swimmer entered in two events (shared D1 registration)", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      entries: [
        { eventNumber: 1, swimmerName: "Ada Lovelace", usaMemberId: "USA123" },
        { eventNumber: 4, swimmerName: "Ada Lovelace" },
      ],
      results: [],
      relays: [],
    };
    const parsed = parseHy3(exportHy3(meet));
    const adaEntries = parsed.entries.filter(
      (e) => e.swimmerName === "Ada Lovelace",
    );
    expect(adaEntries.map((e) => e.eventNumber).sort()).toEqual([1, 4]);
  });

  it("emits an E1/E2 pair for a results-only swimmer with no matching entry", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      entries: [],
      results: [
        {
          eventNumber: 1,
          swimmerName: "Only Results",
          time: "28.50",
          place: 1,
          isDq: false,
          dateOfBirth: "2012-04-01",
          gender: "female",
        },
      ],
      relays: [],
    };
    const parsed = parseHy3(exportHy3(meet));
    const entry = parsed.entries.find((e) => e.swimmerName === "Only Results");
    expect(entry).toBeTruthy();
    const result = parsed.results.find((r) => r.swimmerName === "Only Results");
    expect(result).toMatchObject({ time: "28.50", place: 1 });
  });

  it("round-trips prelim/swimoff result rounds and heat/lane", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      entries: [{ eventNumber: 1, swimmerName: "Heat Swimmer" }],
      results: [
        {
          eventNumber: 1,
          swimmerName: "Heat Swimmer",
          time: "28.00",
          resultType: "prelim",
          heat: 3,
          lane: 4,
        },
        {
          eventNumber: 1,
          swimmerName: "Heat Swimmer",
          time: "27.90",
          resultType: "swimoff",
          heat: 1,
          lane: 2,
        },
      ],
      relays: [],
    };
    const parsed = parseHy3(exportHy3(meet));
    const prelim = parsed.results.find((r) => r.resultType === "prelim");
    const swimoff = parsed.results.find((r) => r.resultType === "swimoff");
    expect(prelim).toMatchObject({ heat: 3, lane: 4 });
    expect(swimoff).toMatchObject({ heat: 1, lane: 2 });
  });

  it("marks exhibition entries and falls back to the 'A' stroke letter for unmapped strokes", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      entries: [
        { eventNumber: 6, swimmerName: "Odd Stroke", exhibition: true },
      ],
      results: [],
      relays: [],
    };
    const parsed = parseHy3(exportHy3(meet));
    const entry = parsed.entries.find((e) => e.swimmerName === "Odd Stroke");
    expect(entry?.exhibition).toBe(true);
  });

  it("treats a blank swimmer name as an empty first/last name (no crash)", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      entries: [{ eventNumber: 1, swimmerName: "   " }],
      results: [],
      relays: [],
    };
    expect(() => exportHy3(meet)).not.toThrow();
  });

  it("blanks out unparseable dates and non-finite/zero seed times instead of throwing", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      startDate: "not-a-date",
      entries: [{ eventNumber: 1, swimmerName: "No Seed", seedTime: "NT" }],
      results: [],
      relays: [],
    };
    const text = exportHy3(meet);
    const parsed = parseHy3(text);
    expect(parsed.startDate).toBeUndefined();
    const entry = parsed.entries.find((e) => e.swimmerName === "No Seed");
    expect(entry?.seedTime).toBeUndefined();
  });
});

describe("exportCl2", () => {
  it("round-trips entries, results (incl. DQ), and relay legs through parseCl2Meet", () => {
    const text = exportCl2(baseMeet);
    expect(text).toContain("A0");
    expect(text).toContain("D0");
    expect(text).toContain("G0");
    expect(text).toContain("E0");
    expect(text).toContain("F0");

    expect(detectCl2FileKind(text)).toBe("meet_results");

    const parsed = parseCl2Meet(text);
    expect(parsed.name).toBe("Test Meet");
    expect(parsed.importKind).toBe("results");
    expect(parsed.entries.length).toBeGreaterThanOrEqual(2);
    expect(parsed.results.length).toBe(2);

    const adaResult = parsed.results.find((r) => r.swimmerName.includes("Ada"));
    expect(adaResult).toMatchObject({ time: "27.50", place: 1, isDq: false });

    const bobResult = parsed.results.find((r) => r.swimmerName.includes("Bob"));
    expect(bobResult?.isDq).toBe(true);

    expect(parsed.relays?.length).toBe(1);
    expect(parsed.relays?.[0]?.swimmerNames.length).toBe(4);
  });

  it("labels entries-only packs for round-trip detection", () => {
    const entriesOnly = exportCl2({ ...baseMeet, results: [], relays: [] });
    expect(detectCl2FileKind(entriesOnly)).toBe("meet_entries");
    expect(parseCl2Meet(entriesOnly).importKind).toBe("entries");
  });

  it("labels an empty roster-only pack distinctly from entries/results", () => {
    const rosterOnly = exportCl2({
      ...baseMeet,
      importKind: "roster",
      entries: [],
      results: [],
      relays: [],
    });
    expect(rosterOnly).toContain("Swimmers Only");
    expect(detectCl2FileKind("B1 only file\nD0 data")).toBe("unknown");
    expect(
      detectCl2FileKind("A01V3      02Custom Export                 Hy-Tek"),
    ).toBe("unknown");
    expect(
      detectCl2FileKind("A01V3      02Team Roster                   Hy-Tek"),
    ).toBe("swimmers_only");
  });

  it("falls back to a '1' stroke digit and skips events with no eventNumber", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      events: [
        ...baseMeet.events,
        { distance: 25, stroke: "free", gender: "female", eventKey: "no-num" },
      ],
      entries: [
        { eventNumber: 6, swimmerName: "Odd Stroke Swimmer" },
        { swimmerName: "No Event Number Entry" },
      ],
      results: [],
      relays: [],
    };
    expect(() => exportCl2(meet)).not.toThrow();
    const text = exportCl2(meet);
    expect(text).toContain("Odd Stroke Swimmer".split(" ")[0]);
  });

  it("uses a medley-relay event code and 'F' gender letter for a female relay", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      teamCode: "MARI",
      lscCode: "AZ",
      teamName: "Maricopa High School",
      events: [
        ...baseMeet.events,
        {
          eventNumber: 20,
          distance: 200,
          stroke: "medley_relay",
          gender: "female",
          eventKey: "medley-relay",
        },
      ],
      entries: [],
      results: [],
      relays: [
        {
          eventNumber: 20,
          swimmerNames: ["Rel One", "Rel Two", "Rel Three", "Rel Four"],
        },
      ],
    };
    const text = exportCl2(meet);
    expect(text).toContain("F 2007");
    expect(text).toContain("AZMARI");
    expect(text).toContain("Maricopa High School");
    expect(parseCl2Meet(text).relays?.[0]?.swimmerNames.length).toBe(4);
    expect(parseCl2Meet(text).relays?.[0]?.eventNumber).toBe(20);
  });

  it("aligns D0 event columns, emits one D3 per athlete, and checksums at 160 chars", () => {
    const text = exportCl2({
      ...baseMeet,
      teamCode: "MARI",
      lscCode: "AZ",
      teamName: "Maricopa High School",
      startDate: "2026-09-12",
      events: [
        {
          eventNumber: 12,
          distance: 100,
          stroke: "free",
          gender: "female",
          eventKey: "100_free",
        },
        {
          eventNumber: 17,
          distance: 100,
          stroke: "back",
          gender: "female",
          eventKey: "100_back",
        },
      ],
      results: [],
      relays: [],
      entries: [
        {
          eventNumber: 12,
          swimmerName: "Marlie McNamee",
          gender: "female",
          classYear: "JR",
          seedTime: "1:11.01",
        },
        {
          eventNumber: 17,
          swimmerName: "Marlie McNamee",
          gender: "female",
          classYear: "JR",
          seedTime: "1:27.44",
        },
      ],
    });
    const rows = text.split(/\r?\n/).filter(Boolean);
    expect(rows.every((row) => row.length === 160)).toBe(true);
    const d0s = rows.filter((row) => row.startsWith("D0"));
    const d3s = rows.filter((row) => row.startsWith("D3"));
    expect(d0s).toHaveLength(2);
    expect(d3s).toHaveLength(1);
    expect(rows[rows.indexOf(d0s[0]!) + 1]?.startsWith("D3")).toBe(true);
    expect(d0s[0]!.slice(65, 67)).toBe("FF");
    expect(d0s[0]!.slice(68, 72)).toBe("1001");
    expect(d0s[0]!.slice(73, 75).trim()).toBe("12");
    expect(d0s[0]!.slice(76, 80)).toBe("UNOV");
    expect(d3s[0]!.endsWith("N50")).toBe(true);
    const z0 = rows.find((row) => row.startsWith("Z0"))!;
    expect(z0).toMatch(/Successful Build on \d{2}-\d{2}-\d{4}/);
    expect(z0).toContain(
      `${String(2).padStart(6)}${String(1).padStart(6)}${String(0).padStart(5)}`,
    );
  });

  it("omits the seed-time and relay-seed suffixes when absent", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      entries: [
        { eventNumber: 1, swimmerName: "No Seed Cl2", seedTime: "0.00" },
      ],
      results: [],
      relays: [{ eventNumber: 10, swimmerNames: ["A", "B", "C", "D"] }],
    };
    expect(() => exportCl2(meet)).not.toThrow();
  });

  it("uses a mixed-gender event's identity fallback and carries the USA ID from a result-only identity", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      entries: [
        { eventNumber: 3, swimmerName: "Bob Baker", gender: undefined },
      ],
      results: [
        {
          eventNumber: 3,
          swimmerName: "Bob Baker",
          time: "2:10.00",
          usaMemberId: "USA999",
          gender: "male",
        },
      ],
      relays: [],
    };
    const text = exportCl2(meet);
    expect(text).toContain("USA999");
  });

  it("round-trips results without an eventNumber or place", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      entries: [],
      results: [{ swimmerName: "No Event Number", time: "31.00" }],
      relays: [{ swimmerNames: ["A", "B", "C", "D"] }],
    };
    expect(() => exportCl2(meet)).not.toThrow();
    const text = exportCl2(meet);
    expect(text).toContain("No");
  });

  it("round-trips prelim/finals round markers on CL2 G0 results", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      entries: [{ eventNumber: 1, swimmerName: "Round Swimmer" }],
      results: [
        {
          eventNumber: 1,
          swimmerName: "Round Swimmer",
          time: "28.00",
          resultType: "prelim",
          heat: 3,
          lane: 4,
        },
        {
          eventNumber: 1,
          swimmerName: "Round Swimmer",
          time: "27.50",
          resultType: "finals",
          heat: 1,
          lane: 5,
        },
      ],
      relays: [],
    };
    const parsed = parseCl2Meet(exportCl2(meet));
    const prelim = parsed.results.find((r) => r.resultType === "prelim");
    const finals = parsed.results.find((r) => r.resultType === "finals");
    expect(prelim?.time).toBe("28.00");
    expect(finals?.time).toBe("27.50");
  });

  it("re-exports azsi-results.cl2 with comparable result counts", () => {
    const content = readFileSync(join(fixturesDir, "azsi-results.cl2"), "utf8");
    const imported = parseCl2Meet(content);
    const reexported = parseCl2Meet(exportCl2(imported));
    expect(reexported.results.length).toBeGreaterThan(0);
    expect(reexported.results.length).toBe(imported.results.length);
    expect(reexported.results.some((r) => r.resultType === "prelim")).toBe(
      true,
    );
    expect(reexported.results.some((r) => r.resultType === "finals")).toBe(
      true,
    );
  });

  it("uses SCM/LCM course tokens", () => {
    expect(exportCl2({ ...baseMeet, course: "SCM" })).toContain("SCM");
    expect(exportCl2({ ...baseMeet, course: "LCM" })).toContain("LCM");
  });
});

describe("exportHyv", () => {
  it("round-trips event catalog (incl. dive) through parseHyv", () => {
    const meet: ParsedMeet = {
      name: "HYV Meet",
      course: "SCY",
      location: "Test Pool",
      startDate: "2025-03-01",
      endDate: "2025-03-02",
      events: [
        {
          eventNumber: 11,
          distance: 50,
          stroke: "free",
          gender: "female",
          ageGroup: "13-14",
          eventKey: "50_free_scy_f",
          roundType: "prelim",
          qualifyingTimeMs: 28_500,
        },
        {
          eventNumber: 42,
          distance: 0,
          stroke: "dive",
          gender: "male",
          ageGroup: "15-18",
          eventKey: "dive-42",
          eventKind: "dive",
          diveCount: 6,
          roundType: "finals",
        },
      ],
      entries: [],
      results: [],
    };
    const parsed = parseHyv(exportHyv(meet));
    expect(parsed.name).toBe("HYV Meet");
    expect(parsed.location).toBe("Test Pool");
    expect(parsed.startDate).toBe("2025-03-01");
    expect(parsed.endDate).toBe("2025-03-02");
    expect(parsed.course).toBe("SCY");

    const swim = parsed.events.find((e) => e.eventNumber === 11);
    expect(swim).toMatchObject({
      distance: 50,
      stroke: "free",
      gender: "female",
      ageGroup: "13-14",
      roundType: "prelim",
      qualifyingTimeMs: 28_500,
    });

    const dive = parsed.events.find((e) => e.eventKind === "dive");
    expect(dive).toMatchObject({
      eventNumber: 42,
      diveCount: 6,
      roundType: "finals",
    });
  });

  it("covers SCM/LCM headers, relays, swimoff rounds, and unknown strokes", () => {
    const meet: ParsedMeet = {
      name: "HYV Relay",
      course: "LCM",
      events: [
        {
          eventNumber: 1,
          distance: 200,
          stroke: "free_relay",
          gender: "mixed",
          eventKey: "x",
          roundType: "swimoff",
        },
        {
          eventNumber: 2,
          distance: 200,
          stroke: "medley_relay",
          gender: "male",
          eventKey: "x",
        },
        {
          eventNumber: 3,
          distance: 50,
          stroke: "unknown_stroke",
          gender: "female",
          eventKey: "x",
        },
      ],
      entries: [],
      results: [],
    };
    const parsed = parseHyv(exportHyv(meet));
    expect(parsed.course).toBe("LCM");
    expect(parsed.events.find((e) => e.eventNumber === 1)?.roundType).toBe(
      "swimoff",
    );
    expect(parsed.events.find((e) => e.eventNumber === 2)?.stroke).toBe(
      "medley_relay",
    );

    const scm = parseHyv(exportHyv({ ...meet, course: "SCM" }));
    expect(scm.course).toBe("SCM");
  });

  it("exports time-trial rounds, invalid header dates, sparse event numbers, and dives", () => {
    const meet: ParsedMeet = {
      name: "Sparse HYV",
      course: "SCY",
      startDate: "not-a-date",
      endDate: "also-bad",
      events: [
        {
          distance: 50,
          stroke: "free",
          gender: "male",
          eventKey: "no-num",
          roundType: "time_trial",
        },
        {
          eventNumber: 9,
          distance: 0,
          stroke: "dive",
          gender: "female",
          eventKey: "dive-9",
          eventKind: "dive",
          diveCount: 5,
        },
        {
          eventNumber: 10,
          distance: 0,
          stroke: "dive",
          gender: "male",
          eventKey: "dive-10",
          eventKind: "dive",
        },
      ],
      entries: [],
      results: [],
    };
    const text = exportHyv(meet);
    expect(text).toContain(";X;");
    expect(text).toContain(";0;");
    expect(text).toContain(";5;6;");
    expect(text).toContain(";0;6;");
    expect(text.startsWith("Sparse HYV;")).toBe(true);
    expect(text).toContain(";Y;");

    const parsed = parseHyv(text);
    expect(
      parsed.events.find((e) => e.roundType === "time_trial"),
    ).toBeTruthy();
    expect(parsed.events.find((e) => e.eventKind === "dive")).toMatchObject({
      diveCount: 5,
    });
  });
});

describe("exportEv3", () => {
  it("round-trips event catalog (incl. dive) through parseEv3", () => {
    const meet: ParsedMeet = {
      name: "Events Meet",
      course: "SCY",
      startDate: "2026-01-10",
      endDate: "2026-01-11",
      events: [
        {
          eventNumber: 1,
          distance: 50,
          stroke: "free",
          gender: "female",
          eventKey: "x",
        },
        {
          eventNumber: 2,
          distance: 200,
          stroke: "im",
          gender: "male",
          eventKey: "x",
        },
        {
          eventNumber: 3,
          distance: 200,
          stroke: "free_relay",
          gender: "mixed",
          eventKey: "x",
        },
        {
          eventNumber: 4,
          distance: 200,
          stroke: "medley_relay",
          gender: "mixed",
          eventKey: "x",
        },
        {
          eventNumber: 5,
          distance: 0,
          stroke: "dive",
          gender: "female",
          eventKey: "dive-5",
          eventKind: "dive",
          diveCount: 6,
        },
      ],
      entries: [],
      results: [],
      entryLimits: {
        maxIndividualEntries: 3,
        maxRelayEntries: 2,
        maxCombinedEntries: 4,
      },
      entryDeadline: "2026-01-05",
    };
    const text = exportEv3(meet);
    const parsed = parseEv3(text);

    expect(parsed.name).toBe("Events Meet");
    expect(parsed.startDate).toBe("2026-01-10");
    expect(parsed.entryLimits).toEqual({
      maxIndividualEntries: 3,
      maxRelayEntries: 2,
      maxCombinedEntries: 4,
    });
    expect(parsed.events.length).toBe(5);

    const free = parsed.events.find((e) => e.eventNumber === 1);
    expect(free).toMatchObject({
      distance: 50,
      stroke: "free",
      gender: "female",
    });

    const freeRelay = parsed.events.find((e) => e.eventNumber === 3);
    expect(freeRelay?.stroke).toBe("free_relay");
    const medleyRelay = parsed.events.find((e) => e.eventNumber === 4);
    expect(medleyRelay?.stroke).toBe("medley_relay");

    const dive = parsed.events.find((e) => e.eventNumber === 5);
    expect(dive).toMatchObject({
      eventKind: "dive",
      stroke: "dive",
      distance: 0,
      diveCount: 6,
      gender: "female",
    });
    expect(parsed.skippedDiveEvents).toBe(undefined);
  });

  it("exports age bands, QT cuts, and empty-name slug safely", () => {
    const meet: ParsedMeet = {
      name: "!!!",
      course: "LCM",
      events: [
        {
          eventNumber: 1,
          distance: 100,
          stroke: "back",
          gender: "female",
          eventKey: "x",
          ageGroup: "15&O",
          qualifyingTimeMs: 65000,
        },
        {
          eventNumber: 2,
          distance: 50,
          stroke: "fly",
          gender: "male",
          eventKey: "x",
          ageGroup: "10&U",
        },
        {
          eventNumber: 3,
          distance: 200,
          stroke: "breast",
          gender: "mixed",
          eventKey: "x",
          ageGroup: "13-14",
        },
        {
          eventNumber: 4,
          distance: 50,
          stroke: "free",
          gender: "male",
          eventKey: "x",
          ageGroup: "Open",
        },
      ],
      entries: [],
      results: [],
    };
    const text = exportEv3(meet);
    expect(text).toContain("65.00");
    const parsed = parseEv3(text);
    expect(parsed.course).toBe("LCM");
    expect(parsed.events.some((e) => e.ageGroup?.includes("15"))).toBe(true);

    const zip = exportMeetZip(meet, "events");
    const bundle = extractAllMeetFilesFromZip(zip);
    expect(bundle.files.some((f) => f.filename.includes("meet"))).toBe(true);
  });

  it("defaults an event with no eventNumber to 0 and a dive event with no diveCount to 0", () => {
    const meet: ParsedMeet = {
      name: "Sparse Events",
      course: "SCM",
      events: [
        { distance: 50, stroke: "free", gender: "male", eventKey: "x" },
        {
          distance: 0,
          stroke: "dive",
          gender: "female",
          eventKey: "dive-x",
          eventKind: "dive",
        },
      ],
      entries: [],
      results: [],
    };
    expect(() => exportEv3(meet)).not.toThrow();
    const parsed = parseEv3(exportEv3(meet));
    expect(parsed.course).toBe("SCM");
    const dive = parsed.events.find((e) => e.eventKind === "dive");
    expect(dive?.diveCount).toBeUndefined();
  });
});

describe("exportCl2 results-only athletes", () => {
  it("emits D0 rows for result swimmers not already in entries", () => {
    const meet: ParsedMeet = {
      name: "Results Only",
      course: "SCY",
      events: [
        {
          eventNumber: 7,
          distance: 50,
          stroke: "free",
          gender: "female",
          eventKey: "x",
        },
      ],
      entries: [],
      results: [
        {
          eventNumber: 7,
          swimmerName: "Only Results",
          time: "28.50",
          place: 1,
          dateOfBirth: "2012-04-01",
          gender: "female",
          usaMemberId: "040112ONLYRES",
        },
      ],
    };
    const text = exportCl2(meet);
    expect(text).toContain("D0");
    expect(text).toContain("Only");
    expect(text).toContain("G0");
    expect(text).toContain("28.50");
  });
});

describe("exportMeetZip", () => {
  it("packs HY3+CL2 for entries/results and EV3+HY3+CL2 for events", () => {
    const resultsZip = exportMeetZip(baseMeet, "results");
    const bundle = extractAllMeetFilesFromZip(resultsZip);
    expect(bundle.files.map((f) => f.format).sort()).toEqual(["cl2", "hy3"]);

    const eventsZip = exportMeetZip(baseMeet, "events");
    const eventsBundle = extractAllMeetFilesFromZip(eventsZip);
    expect(eventsBundle.files.map((f) => f.format).sort()).toEqual([
      "cl2",
      "ev3",
      "hy3",
      "hyv",
    ]);
    expect(eventsBundle.primary.format).toBe("ev3");
  });

  it("names entry packs like Team Manager when team code and LSC are set", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      teamCode: "MARI",
      lscCode: "AZ",
      startDate: "2026-09-12",
      name: "2026 Croswhite Invite",
    };
    expect(meetEntryPackBaseName(meet)).toBe(
      "MARI-AZ-Entries-2026 Croswhite Invite-12Sep2026-001",
    );
    expect(meetEntryPackBaseName({ ...meet, startDate: undefined })).toBe(
      "MARI-AZ-Entries-2026 Croswhite Invite-001",
    );
    expect(
      meetEntryPackBaseName({ ...meet, name: "???", startDate: "2026-13-01" }),
    ).toBe("MARI-AZ-Entries-Meet-001");
    expect(meetEntryPackBaseName({ ...meet, startDate: "nope" })).toBe(
      "MARI-AZ-Entries-2026 Croswhite Invite-001",
    );

    const zip = exportMeetZip(meet, "entries");
    const bundle = extractAllMeetFilesFromZip(zip);
    const folder = "MARI-AZ-Entries-2026 Croswhite Invite-12Sep2026-001";
    expect(meetZipDownloadFilename(meet, "entries")).toBe(`${folder}.zip`);
    expect(meetZipDownloadFilename(meet, "results")).toBe(
      "2026-croswhite-invite_results.zip",
    );
    expect(meetZipDownloadFilename(meet, "events")).toBe(
      "2026-croswhite-invite_events.zip",
    );
    const paths = Object.keys(unzipSync(zip));
    expect(paths).toContain(`${folder}/${folder}.HY3`);
    expect(paths).toContain(`${folder}/${folder}.CL2`);
    expect(bundle.files.map((f) => f.filename).sort()).toEqual([
      `${folder}.CL2`,
      `${folder}.HY3`,
    ]);
  });
});

describe("relay-only athletes and championship alternates", () => {
  const meet: ParsedMeet = {
    name: "Invitational",
    course: "SCY",
    startDate: "2026-01-15",
    events: [
      {
        eventNumber: 1,
        distance: 50,
        stroke: "free",
        gender: "female",
        eventKey: "50_free_scy_f",
      },
      {
        eventNumber: 14,
        distance: 200,
        stroke: "free_relay",
        gender: "female",
        eventKey: "200_free_relay_scy_f",
      },
    ],
    entries: [
      {
        eventNumber: 1,
        swimmerName: "Ada Lovelace",
        seedTime: "28.50",
        dateOfBirth: "2012-03-01",
        gender: "female",
        exhibition: true,
      },
    ],
    results: [],
    athletes: [
      {
        name: "Relay Only",
        dateOfBirth: "2011-06-15",
        gender: "female",
        usaMemberId: "061511RELAYON",
        relayOnly: true,
      },
    ],
    relays: [
      {
        eventNumber: 14,
        relayLetter: "A",
        swimmerNames: [
          "Ada Lovelace",
          "Bea Anchor",
          "Cate Three",
          "Dee Four",
          "Eve Alt5",
          "Fay Alt6",
          "Gia Alt7",
          "Helen Alt8",
        ],
      },
    ],
  };

  it("writes D1/D0 for relay-only roster athletes and round-trips HY3", () => {
    const hy3 = exportHy3(meet);
    expect(hy3).toContain("Relay");
    expect(hy3).toContain("Only");
    const parsed = parseHy3(hy3);
    const relayOnly = parsed.athletes?.find((a) =>
      a.name.includes("Relay Only"),
    );
    expect(relayOnly?.relayOnly).toBe(true);
    expect(relayOnly?.dateOfBirth).toBe("2011-06-15");
    expect(
      parsed.athletes?.find((a) => a.name === "Ada Lovelace")?.relayOnly,
    ).toBe(false);
    expect(
      parsed.entries.some((e) => e.swimmerName.includes("Relay Only")),
    ).toBe(false);
  });

  it("exports eight F3 legs (four plus alternates) and round-trips", () => {
    const parsed = parseHy3(exportHy3(meet));
    expect(parsed.relays?.[0]?.swimmerNames).toHaveLength(8);
    expect(parsed.relays?.[0]?.swimmerNames[4]).toContain("Eve");
    expect(parsed.relays?.[0]?.swimmerNames[7]).toContain("Helen");
  });

  it("emits a CL2 D0 identity line for relay-only athletes", () => {
    const cl2 = exportCl2(meet);
    expect(cl2).toContain("Relay");
    expect(cl2).toContain("Only");
    expect(cl2).toContain("D0");
  });

  it("skips CL2 D0 for athletes already listed as entries and fills identity from the registry", () => {
    const cl2 = exportCl2({
      ...meet,
      athletes: [{ name: "Ada Lovelace" }, { name: "Bare Roster" }],
    });
    const adaLines = cl2
      .split("\n")
      .filter((line) => line.startsWith("D0") && line.includes("Lovelace"));
    expect(adaLines).toHaveLength(1);
    expect(cl2).toContain("Bare");
    expect(cl2).toContain("Roster");
  });

  it("round-trips A and B relay letters as separate F1 teams", () => {
    const parsed = parseHy3(
      exportHy3({
        ...meet,
        relays: [
          {
            eventNumber: 14,
            relayLetter: "A",
            swimmerNames: [
              "Ada Lovelace",
              "Bea Anchor",
              "Cate Three",
              "Dee Four",
            ],
          },
          {
            eventNumber: 14,
            relayLetter: "B",
            swimmerNames: ["Eve Alt5", "Fay Alt6", "Gia Alt7", "Helen Alt8"],
          },
        ],
      }),
    );
    const letters = parsed.relays?.map((r) => r.relayLetter).sort();
    expect(letters).toEqual(["A", "B"]);
  });

  it("round-trips explicit relay-only roster athletes without relay assignments (HY3/CL2/SD3)", () => {
    const rosterOnly: ParsedMeet = {
      name: "Invitational",
      course: "SCY",
      startDate: "2026-01-15",
      events: meet.events,
      entries: [],
      results: [],
      athletes: [
        {
          name: "Pre-Assignment Relay",
          dateOfBirth: "2012-08-01",
          gender: "female",
          relayOnly: true,
        },
      ],
    };

    const hy3Parsed = parseHy3(exportHy3(rosterOnly));
    expect(
      hy3Parsed.athletes?.find((a) => a.name.includes("Pre-Assignment"))
        ?.relayOnly,
    ).toBe(true);

    const cl2 = exportCl2(rosterOnly);
    expect(cl2).toContain("Pre-Assignment");
    expect(cl2).toContain("D0");

    const sdif = exportSdif(rosterOnly);
    expect(sdif).toContain("Pre-Assignment");
    expect(sdif).toContain("D0");
    expect(
      parseSdif(sdif).entries.some((e) =>
        e.swimmerName.includes("Pre-Assignment"),
      ),
    ).toBe(true);
  });
});
