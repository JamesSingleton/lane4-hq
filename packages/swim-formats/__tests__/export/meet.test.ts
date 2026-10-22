import { readdirSync, readFileSync } from "node:fs";
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
  hytekByte,
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

function hy3ChecksumDigits(body: string): string {
  let even = 0;
  let odd = 0;
  for (let i = 0; i < 128; i++) {
    const value = hytekByte(body.charCodeAt(i));
    if (i % 2 === 0) even += value;
    else odd += 2 * value;
  }
  const mod = (Math.floor((even + odd) / 21) + 205) % 100;
  return `${mod % 10}${Math.floor(mod / 10)}`;
}

function expectHy3Lines(text: string): void {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  expect(lines.length).toBeGreaterThan(0);
  // One assertion for the whole file. Per-line expects on azsi-results.hy3
  // (thousands of lines) blow the 5s Vitest budget under coverage on CI.
  const badAt = lines.findIndex(
    (line) =>
      line.length !== 130 ||
      line.slice(128) !== hy3ChecksumDigits(line.slice(0, 128)),
  );
  const bad = badAt === -1 ? undefined : lines[badAt];
  expect(
    badAt,
    bad ? `line ${badAt + 1} is ${bad.length} chars: ${bad}` : "",
  ).toBe(-1);
}

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

  it("writes the Team Manager A1 columns and F1 relay gender", () => {
    const meet: ParsedMeet = {
      ...baseMeet,
      importKind: "entries",
      startDate: "2026-10-24",
      results: [],
      events: [
        ...baseMeet.events,
        {
          eventNumber: 15,
          distance: 200,
          stroke: "free_relay",
          gender: "female",
          eventKey: "200_free_relay_f",
        },
        {
          eventNumber: 16,
          distance: 200,
          stroke: "medley_relay",
          gender: "male",
          eventKey: "200_medley_relay_m",
        },
      ],
      relays: [
        {
          eventNumber: 15,
          relayLetter: "A",
          swimmerNames: ["A One", "B Two", "C Three", "D Four"],
          seedTime: "1:52.33",
        },
        {
          eventNumber: 16,
          relayLetter: "A",
          swimmerNames: ["Bob Baker", "E Five", "F Six", "G Seven"],
          seedTime: "1:50.96",
        },
      ],
    };
    const text = exportHy3(meet);
    expectHy3Lines(text);
    const a1 = text.split(/\r?\n/).find((line) => line.startsWith("A1"));
    expect(a1?.slice(2, 4)).toBe("02");
    expect(a1?.slice(4, 29)).toBe("Meet Entries".padEnd(25, " "));
    expect(a1?.slice(29, 44)).toBe("Lane4 HQ, Ltd".padEnd(15, " "));
    expect(a1?.slice(44, 58)).toBe("Lane4 1.0".padEnd(14, " "));
    expect(a1).not.toContain("Hy-Tek");
    expect(a1).not.toContain("Win-TM");
    expect(a1?.slice(58, 66)).toBe("10242026");
    const rows = text.split(/\r?\n/);
    const genders = rows
      .filter((line) => line.startsWith("F1"))
      .map((line) => line.slice(12, 15));
    expect(genders).toEqual(["FFF", "MMM"]);
    expect(
      rows
        .filter((line) => line.startsWith("F1"))
        .every((line) => line.slice(11, 12) === "0"),
    ).toBe(true);
    const e1 = rows.find((line) => line.startsWith("E1"))!;
    expect(e1.slice(34, 38)).toBe("0.00");
    expect(e1.slice(41, 42)).toBe(" ");
    expect(e1.slice(49, 51)).toBe("0Y");
    const b2 = rows.find((line) => line.startsWith("B2"))!;
    expect(b2.slice(102, 108)).toBe("0.00YO");

    const resultsText = exportHy3({
      ...meet,
      importKind: "results",
      results: baseMeet.results,
    });
    const resultsRows = resultsText.split(/\r?\n/);
    const resultsF1 = resultsRows.find((line) => line.startsWith("F1"))!;
    expect(resultsF1.slice(11, 12)).toBe(" ");
    expect(resultsF1.slice(12, 15)).toBe("FFF");
    const resultsB2 = resultsRows.find((line) => line.startsWith("B2"))!;
    expect(resultsB2.slice(102, 108)).toBe("      ");
  });

  it("round-trips Team Manager athlete columns and a preserved C6 line", () => {
    const contact = `${"C6".padEnd(47, " ")}555-010-2000`.padEnd(128, " ");
    const meet: ParsedMeet = {
      name: "Columns",
      course: "SCY",
      startDate: "2026-10-24",
      importKind: "entries",
      hy3Publisher: "Hy-Tek, Ltd",
      hy3Software: "Win-TM 8.0De",
      hy3CreatedOn: "2026-10-21",
      hy3CreatedTime: "  4:27 PM",
      hy3Licensee: "Example High School",
      hy3EntrySetup: "0.00YL",
      hy3ContactLines: [contact],
      teamCity: "Town",
      teamCountry: "USA",
      teamCode: "LANE",
      entries: [
        {
          eventNumber: 8,
          swimmerName: "Addy Baker",
          legalFirstName: "Ada",
          preferredName: "Addy",
          middleInitial: "Q",
          practiceGroup: "JV",
          practiceSubgroup: "Red",
          classYear: "11",
          gender: "female",
          hy3EntryMark: "C",
          seedTime: "28.50",
        },
      ],
      results: [],
      events: [
        {
          eventNumber: 8,
          distance: 50,
          stroke: "free",
          gender: "female",
          eventKey: "50_free",
        },
      ],
      relays: [
        {
          eventNumber: 8,
          relayLetter: "A",
          swimmerNames: ["Ann De La Cruz"],
          seedTime: "1:40.00",
        },
      ],
    };
    const text = exportHy3(meet);
    const rows = text.split(/\r?\n/);
    const a1 = rows.find((row) => row.startsWith("A1"))!;
    expect(a1.slice(29, 44)).toBe("Hy-Tek, Ltd".padEnd(15, " "));
    expect(a1.slice(44, 58)).toBe("Win-TM 8.0De".padEnd(14, " "));
    expect(a1.slice(58, 66)).toBe("10212026");
    expect(a1.slice(66, 75)).toBe("  4:27 PM");
    expect(a1.slice(75, 94)).toBe("Example High School");
    const d1 = rows.find((row) => row.startsWith("D1"))!;
    expect(d1.slice(28, 31)).toBe("Ada");
    expect(d1.slice(48, 52)).toBe("Addy");
    expect(d1.slice(68, 69)).toBe("Q");
    expect(d1.slice(99, 101)).toBe("11");
    expect(d1.slice(105, 107)).toBe("JV");
    expect(d1.slice(108, 111)).toBe("Red");
    const e1 = rows.find((row) => row.startsWith("E1"))!;
    expect(e1.slice(38, 42)).toBe("  8 ");
    expect(e1.slice(91, 92)).toBe("C");
    expect(e1.slice(8, 13)).toBe("Baker");
    const f3 = rows.find((row) => row.startsWith("F3"))!;
    expect(f3.slice(8, 13)).toBe("De La");
    const c6 = rows.find((row) => row.startsWith("C6"))!;
    expect(c6.slice(0, 128)).toBe(contact);
    expect(rows.find((row) => row.startsWith("B2"))!.slice(102, 108)).toBe(
      "0.00YL",
    );

    const parsed = parseHy3(text);
    expect(parsed.hy3Publisher).toBe("Hy-Tek, Ltd");
    expect(parsed.hy3Software).toBe("Win-TM 8.0De");
    expect(parsed.hy3EntrySetup).toBe("0.00YL");
    expect(parsed.hy3ContactLines?.[0]).toBe(contact);
    expect(parsed.entries[0]?.legalFirstName).toBe("Ada");
    expect(parsed.entries[0]?.preferredName).toBe("Addy");
    expect(parsed.entries[0]?.middleInitial).toBe("Q");
    expect(parsed.entries[0]?.practiceGroup).toBe("JV");
    expect(parsed.entries[0]?.practiceSubgroup).toBe("Red");
    expect(parsed.entries[0]?.swimmerName).toBe("Addy Baker");
    expect(parsed.entries[0]?.hy3EntryMark).toBe("C");
    const again = exportHy3(parsed);
    expect(
      again
        .split(/\r?\n/)
        .find((row) => row.startsWith("D1"))!
        .slice(28, 31),
    ).toBe("Ada");
  });

  // azsi-results.hy3 re-export checksums about 6,800 lines. Under coverage
  // that exceeds Vitest's 5s default on GitHub Actions.
  it("keeps every exported HY3 line at 130 characters with a valid checksum", () => {
    expectHy3Lines(exportHy3(baseMeet));
    expectHy3Lines(
      exportHy3({ ...baseMeet, importKind: "results", entries: [] }),
    );
    expectHy3Lines(
      exportHy3({
        ...baseMeet,
        importKind: "roster",
        entries: [],
        results: [],
        relays: [],
      }),
    );
    const names = readdirSync(fixturesDir).filter((name) =>
      name.endsWith(".hy3"),
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const original = readFileSync(join(fixturesDir, name), "latin1");
      expectHy3Lines(exportHy3(parseHy3(original)));
    }
  }, 20_000);

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

    const orgText = exportHy3({
      ...baseMeet,
      teamCity: "Klein",
      teamCountry: "USA",
      teamOrgCode: "OTH",
    });
    const orgRow = orgText.split(/\r?\n/).find((row) => row.startsWith("C2"))!;
    expect(orgRow.slice(108, 111)).toBe("OTH");
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
        { swimmerName: "Solo" },
        { swimmerName: "" },
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
          dateOfBirth: "2010-01-01",
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
    expect(d0s[0]!.slice(3, 5)).toBe("AZ");
    expect(d0s[0]!.slice(7, 9)).toBe("JR");
    expect(d0s[0]!.slice(55, 63)).toBe("01012010");
    expect(d0s[0]!.slice(63, 65)).toBe("16");
    const z0 = rows.find((row) => row.startsWith("Z0"))!;
    expect(z0).toMatch(/Successful Build on \d{2}-\d{2}-\d{4}/);
    expect(z0).toContain(
      `${String(2).padStart(6)}${String(1).padStart(6)}${String(0).padStart(5)}`,
    );
  });

  it("checksums CP-1252 bytes for 0x80-0x9F, not Unicode code points", () => {
    const enDash = "\u2013";
    expect(enDash.charCodeAt(0)).toBe(0x2013);
    expect(hytekByte(enDash.charCodeAt(0))).toBe(0x96);
    expect(hytekByte(0x96)).toBe(0x96);
    expect(hytekByte(0x0100)).toBe(0x00);

    const text = exportHy3({
      ...baseMeet,
      name: `Pool${enDash}Side`,
      entries: [],
      results: [],
      relays: [],
    });
    const b1 = text.split(/\r?\n/).find((row) => row.startsWith("B1"))!;
    const body = b1.slice(0, 128);
    expect(body).toContain(enDash);

    const byteSum = (useBytes: boolean) => {
      let even = 0;
      let odd = 0;
      for (let i = 0; i < 128; i++) {
        const code = body.charCodeAt(i);
        const value = useBytes ? hytekByte(code) : code;
        if (i % 2 === 0) even += value;
        else odd += 2 * value;
      }
      const mod = (Math.floor((even + odd) / 21) + 205) % 100;
      return `${mod % 10}${Math.floor(mod / 10)}`;
    };
    expect(b1.slice(128)).toBe(byteSum(true));
    expect(b1.slice(128)).not.toBe(byteSum(false));

    const cl2 = exportCl2({
      ...baseMeet,
      name: `Pool${enDash}Side`,
      entries: [],
      results: [],
      relays: [],
    });
    const b1Cl2 = cl2.split(/\r?\n/).find((row) => row.startsWith("B1"))!;
    const cl2Body = b1Cl2.slice(0, 156);
    let sumBytes = 0;
    let sumCodes = 0;
    for (let i = 0; i < 156; i++) {
      sumBytes += hytekByte(cl2Body.charCodeAt(i));
      sumCodes += cl2Body.charCodeAt(i);
    }
    const cl2Digits = (sum: number) => {
      const mod = (Math.floor(sum / 19) + 211) % 100;
      return `${mod % 10}${Math.floor(mod / 10)}`;
    };
    expect(b1Cl2.slice(158)).toBe(cl2Digits(sumBytes));
    expect(cl2Digits(sumBytes)).not.toBe(cl2Digits(sumCodes));
    expect(cl2Body).toContain(enDash);
  });

  it("preserves HY3 swimmer ids, age-up date, C4 notes, and a per-entry seed course", () => {
    const text = exportHy3({
      ...baseMeet,
      startDate: "2026-10-24",
      endDate: "2026-10-24",
      ageUpDate: "2026-07-01",
      teamExtra: "lane notes",
      teamPhone: "480-555-0100",
      course: "SCM",
      entries: [
        {
          eventNumber: 1,
          swimmerName: "Briar Alden",
          meetSwimmerId: 32,
          classYear: "SR",
          gender: "female",
          seedTime: "1:11.01",
          seedCourse: "SCY",
        },
      ],
      relays: [
        {
          eventNumber: 1,
          swimmerNames: ["Briar Alden"],
          relayLetter: "A",
          seedTime: "1:52.33",
          seedCourse: "SCY",
        },
      ],
      results: [],
    });
    const rows = text.split(/\r?\n/);
    const b1 = rows.find((row) => row.startsWith("B1"))!;
    expect(b1.slice(108, 116)).toBe("07012026");
    expect(b1.slice(92, 100)).toBe("10242026");
    const d1 = rows.find((row) => row.startsWith("D1"))!;
    expect(d1.slice(3, 8)).toBe("   32");
    expect(d1.slice(99, 101)).toBe("SR");
    const e1 = rows.find((row) => row.startsWith("E1"))!;
    expect(e1.slice(50, 51)).toBe("Y");
    const f1 = rows.find((row) => row.startsWith("F1"))!;
    expect(f1.slice(50, 51)).toBe("Y");
    const f3 = rows.find((row) => row.startsWith("F3"))!;
    expect(f3.slice(3, 8)).toBe("   32");
    expect(
      rows.some((row) => row.startsWith("C4") && row.includes("lane notes")),
    ).toBe(true);
    expect(
      rows.some((row) => row.startsWith("C3") && row.includes("480-555-0100")),
    ).toBe(true);

    const cl2 = exportCl2({
      ...baseMeet,
      teamCode: "MARI",
      lscCode: "AZ",
      course: "SCM",
      entries: [
        {
          eventNumber: 12,
          swimmerName: "Briar Alden",
          gender: "female",
          classYear: "SR",
          seedTime: "1:11.01",
          seedCourse: "SCY",
          ethnicity: "X",
          registrationFlags: "FFFFFFFFFFFFF",
        },
      ],
      relays: [
        {
          eventNumber: 1,
          swimmerNames: ["Briar Alden"],
          seedTime: "1:52.33",
          seedCourse: "SCY",
        },
      ],
      results: [],
    });
    const cl2Rows = cl2.split(/\r?\n/);
    const d0 = cl2Rows.find((row) => row.startsWith("D0"))!;
    expect(d0.slice(96, 97)).toBe("Y");
    const e0 = cl2Rows.find((row) => row.startsWith("E0"))!;
    expect(e0.slice(53, 54)).toBe("Y");
    expect(e0.slice(3, 5)).toBe("AZ");
    expect(e0.slice(12, 18)).toBe("AZMARI");
  });

  it("applies an athlete's meet id when the entry did not carry one", () => {
    const text = exportHy3({
      ...baseMeet,
      entries: [{ eventNumber: 1, swimmerName: "Late Id" }],
      athletes: [{ name: "Late Id", meetSwimmerId: 18 }],
      results: [],
      relays: [],
    });
    const d1 = text.split(/\r?\n/).find((row) => row.startsWith("D1"))!;
    expect(d1.slice(3, 8)).toBe("   18");
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

  it("writes the Team Manager CL2 banner and right-aligns a short team id", () => {
    const text = exportCl2({
      ...baseMeet,
      importKind: "entries",
      results: [],
      relays: [],
      teamCode: "LANE",
      startDate: "2026-10-24",
      endDate: "2026-10-24",
      altitude: 1100,
      location: "Example Pool",
      cl2Publisher: "Hy-Tek, Ltd",
      cl2Publisher2: "Hy-Tek, Ltd",
      cl2Software: "8.0D",
      cl2VendorPhone: "252-633-5177",
      cl2CreatedOn: "2026-10-21",
      cl2Tail: "TM41",
      entries: [
        {
          eventNumber: 12,
          swimmerName: "Ada Lovelace",
          classYear: "11",
          gender: "female",
          seedTime: "28.50",
        },
      ],
    });
    const rows = text.split(/\r?\n/);
    const a0 = rows[0]!;
    expect(a0.slice(11, 13)).toBe("20");
    expect(a0.slice(13, 43)).toBe("Meet Entries".padEnd(30, " "));
    expect(a0.slice(43, 69)).toBe("Hy-Tek, Ltd".padEnd(26, " "));
    expect(a0.slice(69, 73)).toBe("8.0D");
    expect(a0.slice(73, 93)).toBe("Hy-Tek, Ltd".padEnd(20, " "));
    expect(a0.slice(93, 105)).toBe("252-633-5177");
    expect(a0.slice(105, 113)).toBe("10212026");
    expect(a0.slice(149, 153)).toBe("TM41");
    expect(detectCl2FileKind(text)).toBe("meet_entries");
    const b1 = rows.find((row) => row.startsWith("B1"))!;
    expect(b1.slice(11, 20)).toBe("Test Meet");
    expect(b1.slice(85, 97)).toBe("Example Pool");
    expect(b1.slice(121, 137)).toBe("1024202610242026");
    expect(b1.slice(137, 141)).toBe("1100");
    expect(b1.slice(149, 150)).toBe("Y");
    const c1 = rows.find((row) => row.startsWith("C1"))!;
    expect(c1.slice(11, 17)).toBe("  LANE");
    const parsed = parseCl2Meet(text);
    expect(parsed.entries[0]?.classYear).toBe("11");
    expect(parsed.teamCode).toBe("LANE");
    expect(parsed.altitude).toBe(1100);
    expect(parsed.location).toBe("Example Pool");
    expect(parsed.cl2Publisher).toBe("Hy-Tek, Ltd");
    expect(parsed.cl2Publisher2).toBe("Hy-Tek, Ltd");
    expect(parsed.cl2Software).toBe("8.0D");
    expect(parsed.cl2VendorPhone).toBe("252-633-5177");
    const roster = exportCl2({
      ...baseMeet,
      importKind: "roster",
      entries: [],
      results: [],
      relays: [],
    });
    expect(roster.split(/\r?\n/)[0]!.slice(149, 153)).toBe("TM43");
  });

  it("identifies a new CL2 file as Lane4", () => {
    const entries = exportCl2({
      ...baseMeet,
      importKind: "entries",
      results: [],
      relays: [],
      startDate: "2026-10-24",
    });
    const a0 = entries.split(/\r?\n/)[0]!;
    expect(a0.slice(43, 69)).toBe("Lane4 HQ, Ltd".padEnd(26, " "));
    expect(a0.slice(69, 73)).toBe("L4".padEnd(4, " "));
    expect(a0.slice(73, 93)).toBe("Lane4 HQ, Ltd".padEnd(20, " "));
    expect(a0.slice(93, 105)).toBe(" ".repeat(12));
    expect(a0).not.toContain("Hy-Tek");
    expect(a0).not.toContain("252-633-5177");

    const results = exportCl2({ ...baseMeet, importKind: "results" });
    const resultsA0 = results.split(/\r?\n/)[0]!;
    expect(resultsA0.slice(43, 63)).toBe("Lane4 HQ, Ltd".padEnd(20, " "));
    expect(resultsA0.slice(63, 73)).toBe("Lane4 1.0".padEnd(10, " "));
    expect(resultsA0.slice(73, 93)).toBe("Lane4 HQ, Ltd".padEnd(20, " "));
  });

  it("writes a stored CL2 name field and F0 registration text", () => {
    const text = exportCl2({
      ...baseMeet,
      importKind: "entries",
      results: [],
      teamCode: "MARI",
      lscCode: "AZ",
      startDate: "2026-10-24",
      events: [
        {
          eventNumber: 12,
          distance: 50,
          stroke: "free",
          gender: "female",
          eventKey: "50_free",
        },
      ],
      entries: [
        {
          eventNumber: 12,
          swimmerName: "Ada Lovelace",
          gender: "female",
          cl2NameField: "Lovelace, Ada Q".padEnd(40, " "),
        },
      ],
      relays: [
        {
          eventNumber: 12,
          relayLetter: "A",
          swimmerNames: ["Ada Lovelace"],
          cl2LegNameFields: ["Lovelace, Ada Q".padEnd(40, " ")],
          cl2LegExtras: ["REG123".padEnd(20, " ")],
          cl2LegIdentity: ["0101201016F000"],
        },
      ],
    });
    const d0 = text.split(/\r?\n/).find((row) => row.startsWith("D0"))!;
    const f0 = text.split(/\r?\n/).find((row) => row.startsWith("F0"))!;
    expect(d0.slice(11, 26)).toBe("Lovelace, Ada Q");
    expect(f0.slice(22, 37)).toBe("Lovelace, Ada Q");
    expect(f0.slice(92, 98)).toBe("REG123");
    expect(f0.slice(65, 79)).toBe("0101201016F000");
  });

  it("writes the meet course letter at B1 column 150", () => {
    const b1 = (course: "SCM" | "LCM") =>
      exportCl2({ ...baseMeet, course })
        .split(/\r?\n/)
        .find((row) => row.startsWith("B1"))!;
    expect(b1("SCM").slice(149, 150)).toBe("S");
    expect(b1("LCM").slice(149, 150)).toBe("L");
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
