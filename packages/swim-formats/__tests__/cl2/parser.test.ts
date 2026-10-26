import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { detectCl2FileKind, parseCl2Meet } from "../../src/cl2/parser";
import * as cl2Roster from "../../src/roster/cl2";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

function cl2AthleteLine(
  type: "D0" | "G0",
  fields: {
    eventNumber: number;
    last: string;
    first: string;
    usa?: string;
    time?: string;
    place?: number;
  },
): string {
  let line = type + String(fields.eventNumber).padStart(4, "0");
  line = line.padEnd(11, " ");
  line += fields.last.padEnd(20, " ");
  line += fields.first.padEnd(20, " ");
  line += (fields.usa ?? "").padEnd(14, " ");
  line = line.padEnd(72, " ");
  line += (fields.time ?? "").padEnd(10, " ");
  if (type === "G0" && fields.place != null) {
    line += String(fields.place).padStart(4, "0");
  }
  return line;
}

describe("parseCl2Meet", () => {
  it("parses legacy CTCC meet results with D0-embedded times", () => {
    const content = readFileSync(
      join(fixturesDir, "ctcc-meet-results-2005.cl2"),
      "utf8",
    );
    expect(detectCl2FileKind(content)).toBe("meet_results");
    const meet = parseCl2Meet(content);
    expect(meet.name).toMatch(/CTCCvPDC/);
    expect(meet.startDate).toBe("2005-06-01");
    expect(meet.results.length).toBe(9);
    expect(meet.results[0]?.swimmerName).toMatch(/Will Burns/);
    expect(meet.results[0]?.time).toMatch(/38\.01/);
    expect(meet.results[0]?.dateOfBirth).toBe("1989-11-15");
    expect(meet.results[0]?.gender).toBe("male");
    expect(meet.results[0]?.teamCode).toMatch(/CTCC/i);
    expect(meet.events.length).toBeGreaterThan(0);
  });

  it("parses meet metadata and entries from mari-entries.cl2", () => {
    const content = readFileSync(join(fixturesDir, "mari-entries.cl2"), "utf8");
    const meet = parseCl2Meet(content);

    expect(meet.name).toMatch(/2025 Sonoran Desert Invit/);
    expect(meet.location?.length).toBeGreaterThan(0);
    expect(meet.entries.length).toBeGreaterThan(5);
    expect(meet.entries[0]?.swimmerName).toMatch(/\S+\s+\S+/);
    expect(meet.results.length).toBe(0);
    expect(meet.relays?.length).toBeGreaterThan(0);
    expect(meet.relays?.flatMap((r) => r.swimmerNames)).toContain(
      "Marlie McNamee",
    );
    expect(
      meet.relays
        ?.flatMap((r) => r.swimmerNames)
        .some((name) => /MARIA/i.test(name)),
    ).toBe(false);
    const relayNumbers = new Set(
      meet.relays?.map((r) => r.eventNumber).filter((n) => n != null),
    );
    expect(relayNumbers.has(2007)).toBe(false);
    expect(relayNumbers.has(1)).toBe(true);
    expect(meet.events.every((e) => e.eventNumber < 500)).toBe(true);
    expect(
      meet.entries.some(
        (e) =>
          e.swimmerName.includes("Marlie") &&
          e.swimmerName.includes("McNamee") &&
          e.eventNumber === 11,
      ),
    ).toBe(true);
    expect(meet.entries.every((e) => (e.eventNumber ?? 0) < 500)).toBe(true);
  });

  it("reads D0 prelim, swim-off, and finals columns when G0 splits are present", () => {
    // AZSI, CTCC, and Maricopa leave the swim-off column blank and never
    // put NT there, so this line covers those slots. A matching G0 prelim
    // must not be stored twice.
    const line = (tag: string) => `${tag}${" ".repeat(158)}`.slice(0, 160);
    const put = (raw: string, col: number, value: string) => {
      const chars = raw.split("");
      for (let i = 0; i < value.length; i++) chars[col - 1 + i] = value[i]!;
      return chars.join("");
    };
    let prelim = line("D0");
    prelim = put(prelim, 12, "Lane, Ada");
    prelim = put(prelim, 98, "   26.04");
    prelim = put(prelim, 107, "   27.50");
    prelim = put(prelim, 116, "      DQ");
    let skipped = line("D0");
    skipped = put(skipped, 12, "No, Time");
    skipped = put(skipped, 98, "      NT");
    let split = line("G0");
    split = put(split, 12, "Lane, Ada");
    split = put(split, 70, "26.04");
    split = put(split, 144, "P");
    const meet = parseCl2Meet(
      ["A01V3      02Meet Results", prelim, skipped, split].join("\n"),
    );
    const lane = meet.results.filter((result) =>
      result.swimmerName.includes("Lane"),
    );
    expect(
      lane.filter((result) => result.resultType === "prelim"),
    ).toHaveLength(1);
    expect(lane).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ time: "26.04", resultType: "prelim" }),
        expect.objectContaining({
          time: "27.50",
          resultType: "swimoff",
          isDq: false,
        }),
        expect.objectContaining({
          time: "DQ",
          resultType: "finals",
          isDq: true,
        }),
      ]),
    );
    expect(
      meet.results.some((result) => result.swimmerName.includes("Time")),
    ).toBe(false);
  });

  it("copies a D3 USA id onto a D0 result that does not have one", () => {
    const withId = cl2AthleteLine("D0", {
      eventNumber: 2,
      last: "Kept",
      first: "Ida",
      usa: "ABCD1234567890AUSA",
      time: "31.00",
    });
    const blank = cl2AthleteLine("D0", {
      eventNumber: 1,
      last: "Lane",
      first: "Ada",
      time: "30.00",
    });
    const d3Blank = `D3${"NEWMEMBERID123".padEnd(14, " ")}${"Ada".padEnd(15, " ")}`;
    const d3Kept = `D3${"ZZSHOULDNOTCOPY".padEnd(14, " ")}`;
    const meet = parseCl2Meet(
      ["A01V3      02Meet Results", blank, d3Blank, withId, d3Kept].join("\n"),
    );
    const filled = meet.results.find((result) =>
      result.swimmerName.includes("Lane"),
    );
    const kept = meet.results.find((result) =>
      result.swimmerName.includes("Kept"),
    );
    expect(filled?.usaMemberId).toBe("NEWMEMBERID123");
    expect(
      meet.entries.find((entry) => entry.swimmerName.includes("Lane"))
        ?.preferredName,
    ).toBe("Ada");
    expect(kept?.usaMemberId).toBe("ABCD1234567890");
  });

  it("reads D0 and E0 round columns from AZSI, CTCC, and Maricopa", () => {
    const azsi = parseCl2Meet(
      readFileSync(join(fixturesDir, "azsi-results.cl2"), "utf8"),
    );
    const bailey = azsi.results.filter(
      (result) =>
        result.swimmerName.includes("Bailey") &&
        result.swimmerName.includes("Dusek"),
    );
    // 200 IM: the G0 line's first colon time is a split. The official
    // round time is only on the D0 prelim/finals columns.
    expect(
      bailey.some(
        (result) => result.resultType === "prelim" && result.time === "3:02.25",
      ),
    ).toBe(true);
    expect(
      bailey.some(
        (result) => result.resultType === "finals" && result.time === "2:54.26",
      ),
    ).toBe(true);
    expect(
      azsi.results.some(
        (result) =>
          result.swimmerName.includes("Adam") &&
          result.swimmerName.includes("Botsios") &&
          result.resultType === "finals" &&
          result.time === "DQ" &&
          result.isDq,
      ),
    ).toBe(true);

    const relay = azsi.relays?.find(
      (row) =>
        row.relayLetter === "A" &&
        row.teamCode === "AZAQFO" &&
        row.eventNumber === 26,
    );
    expect(relay?.seedTime).toBe("2:23.83");
    expect(relay?.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          time: "2:21.41",
          resultType: "finals",
          isDq: false,
        }),
      ]),
    );

    const ctcc = parseCl2Meet(
      readFileSync(join(fixturesDir, "ctcc-meet-results-2005.cl2"), "utf8"),
    );
    expect(ctcc.results).toHaveLength(9);
    expect(
      ctcc.results.find((result) => result.swimmerName.includes("Will"))?.time,
    ).toMatch(/38\.01/);
    expect(ctcc.results.every((result) => result.resultType == null)).toBe(
      true,
    );

    const sonoran = parseCl2Meet(
      readFileSync(join(fixturesDir, "mari-sonoran-2026.cl2"), "utf8"),
    );
    expect(sonoran.results).toEqual([]);
    expect(sonoran.entries.length).toBeGreaterThan(0);
    expect(
      sonoran.relays?.every((row) => (row.results?.length ?? 0) === 0),
    ).toBe(true);
  });

  it("parses modern azsi results via G0 lines", () => {
    const content = readFileSync(join(fixturesDir, "azsi-results.cl2"), "utf8");
    const meet = parseCl2Meet(content);

    expect(meet.name).toMatch(/AZSI 2025 Short Course Regiona/);
    expect(meet.results.length).toBeGreaterThan(0);
    expect(meet.entries.length).toBeGreaterThan(0);
  });

  it("parses prelim and finals G0 round markers from azsi-results.cl2", () => {
    const content = readFileSync(join(fixturesDir, "azsi-results.cl2"), "utf8");
    const meet = parseCl2Meet(content);

    const bailey100Back = meet.results.filter(
      (r) =>
        r.swimmerName.includes("Bailey") &&
        r.swimmerName.includes("Dusek") &&
        (r.time.includes("1:21.91") || r.time.includes("1:20.41")),
    );
    expect(bailey100Back.some((r) => r.resultType === "prelim")).toBe(true);
    expect(bailey100Back.some((r) => r.resultType === "finals")).toBe(true);

    expect(meet.results.some((r) => r.resultType === "prelim")).toBe(true);
    expect(meet.results.some((r) => r.resultType === "finals")).toBe(true);
  });

  it("detects A0 file type labels and custom title", () => {
    const entries = parseCl2Meet(
      "A01V3      02Meet Entries                  Hy-Tek\nB11        Custom Meet Title                         Pool Name",
    );
    expect(entries.name).toBe("Custom Meet Title");
    expect(entries.location).toBe("Pool Name");

    const results = parseCl2Meet(
      "A01V3      02Meet Results                  ".padEnd(73, " "),
    );
    expect(results.name).toBe("Meet Results");
    expect(results.importKind).toBe("results");
    expect(entries.importKind).toBe("entries");
  });

  it("parses D0 entry and G0 result lines (dual-column names)", () => {
    const content = [
      "A01V3      02Meet Results                  Hy-Tek",
      cl2AthleteLine("D0", {
        eventNumber: 11,
        last: "Lovelace",
        first: "Ada",
        usa: "ABCD1234567890",
        time: "1:05.00",
      }),
      cl2AthleteLine("G0", {
        eventNumber: 11,
        last: "Smith",
        first: "Bob",
        time: "1:04.00",
        place: 2,
      }),
      cl2AthleteLine("G0", {
        eventNumber: 12,
        last: "Jones",
        first: "Pat",
        time: "NS",
        place: 0,
      }),
    ].join("\n");

    const meet = parseCl2Meet(content);
    expect(meet.entries.some((e) => e.swimmerName.includes("Ada"))).toBe(true);
    expect(meet.results[0]).toMatchObject({
      swimmerName: "Bob Smith",
      time: "1:04.00",
      isDq: false,
    });
    expect(
      meet.results.find((r) => r.swimmerName.includes("Pat")),
    ).toMatchObject({
      time: "NS",
      isDq: false,
      noSwim: true,
    });
  });

  it("keeps a D0 no-swim out of the DQ column", () => {
    const legacy = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        cl2AthleteLine("D0", {
          eventNumber: 4,
          last: "No",
          first: "Swim",
          time: "NS",
        }),
      ].join("\n"),
    );
    expect(legacy.results[0]).toMatchObject({
      time: "NS",
      isDq: false,
      noSwim: true,
    });

    const line = (tag: string) => `${tag}${" ".repeat(158)}`.slice(0, 160);
    const put = (raw: string, col: number, value: string) => {
      const chars = raw.split("");
      for (let i = 0; i < value.length; i++) chars[col - 1 + i] = value[i]!;
      return chars.join("");
    };
    let finals = line("D0");
    finals = put(finals, 12, "Lane, Nia");
    finals = put(finals, 116, "      NS");
    let split = line("G0");
    split = put(split, 12, "Lane, Nia");
    split = put(split, 56, "1 2  50C");
    const withSplits = parseCl2Meet(
      ["A01V3      02Meet Results                  Hy-Tek", finals, split].join(
        "\n",
      ),
    );
    expect(withSplits.results).toEqual([
      expect.objectContaining({
        swimmerName: "Nia Lane",
        time: "NS",
        isDq: false,
        noSwim: true,
        resultType: "finals",
      }),
    ]);

    let second = line("D0");
    second = put(second, 12, "Lane, Nia");
    second = put(second, 69, "1001 12");
    second = put(second, 116, "      NS");
    finals = put(finals, 69, "2001  4");
    const both = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        finals,
        second,
        split,
      ].join("\n"),
    );
    expect(
      both.results
        .filter((result) => result.noSwim)
        .map((result) => result.eventNumber),
    ).toEqual([4, 12]);
  });

  it("marks DQ/NS/SCR on result lines", () => {
    const content = [
      "A01V3      02Meet Results                  Hy-Tek",
      cl2AthleteLine("G0", {
        eventNumber: 11,
        last: "Doe",
        first: "Jane",
        time: "DQ",
        place: 1,
      }),
    ].join("\n");
    const meet = parseCl2Meet(content);
    expect(meet.results[0]?.isDq).toBe(true);
  });

  it("falls back to roster extraction when Meet Entries has no athlete lines", () => {
    vi.spyOn(cl2Roster, "parseCl2Roster").mockReturnValue([
      {
        firstName: "Ada",
        lastName: "Lovelace",
        dateOfBirth: "2012-04-15",
        gender: "female",
        usaMemberId: "USA123",
      },
    ]);

    const meet = parseCl2Meet(
      "A01V3      02Meet Entries                  Hy-Tek",
    );
    expect(meet.entries).toEqual([
      { swimmerName: "Ada Lovelace", usaMemberId: "USA123" },
    ]);

    vi.restoreAllMocks();
  });

  it("throws for Swimmers Only files, directing coaches to Roster import", () => {
    const content = readFileSync(
      join(fixturesDir, "roster-swimmers.cl2"),
      "utf8",
    );
    expect(detectCl2FileKind(content)).toBe("swimmers_only");
    expect(() => parseCl2Meet(content)).toThrow(/Roster import/i);
  });

  it("treats F0 as relay legs, not results", () => {
    const content = readFileSync(join(fixturesDir, "ctcc-entries.cl2"), "utf8");
    const meet = parseCl2Meet(content);
    expect(meet.results.length).toBe(0);
    expect(meet.relays?.length).toBeGreaterThan(0);
    expect(meet.relays?.[0]?.swimmerNames.length).toBeGreaterThan(0);
  });

  it("uses meet event number after Hy-Tek D0 stroke codes", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "D01AZ  JR  McNamee, Marlie                                       FF 1001 11 UNOV         1:16.69Y",
        "D01AZ  JR  Flores, Dante                                         MM 5001 13 UNOV             NT",
        "D01AZ  FR  Horner, Liem                                          MM  501  8 UNOV           51.43Y",
      ].join("\n"),
    );
    expect(
      meet.events.map((e) => e.eventNumber).toSorted((a, b) => a - b),
    ).toEqual([8, 11, 13]);
    expect(
      meet.entries
        .map((e) => e.eventNumber)
        .toSorted((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([8, 11, 13]);
    expect(meet.events.find((e) => e.eventNumber === 11)?.stroke).toBe("free");
    expect(meet.events.find((e) => e.eventNumber === 11)?.distance).toBe(100);
    expect(meet.events.find((e) => e.eventNumber === 8)?.distance).toBe(50);
    expect(meet.events.find((e) => e.eventNumber === 13)?.distance).toBe(500);
  });

  it("handles event codes with zero distance and unknown stroke digits", () => {
    const content = [
      "A01V3      02Meet Entries                  Hy-Tek",
      "D01    Smith, John                                           FF 003 17                    1:05.00",
      "D01    Jones, Pat                                            MM 1009 17                    1:06.00",
    ].join("\n");
    const meet = parseCl2Meet(content);
    expect(meet.events.some((e) => e.eventNumber === 3)).toBe(true);
    expect(meet.events.some((e) => e.eventNumber === 1009)).toBe(true);
    expect(meet.entries.length).toBe(2);
  });

  it("parses G0 results when name columns are blank but a time is present", () => {
    const line = cl2AthleteLine("G0", {
      eventNumber: 5,
      last: "",
      first: "",
      time: "1:02.00",
      place: 3,
    });
    const meet = parseCl2Meet(
      ["A01V3      02Meet Results                  Hy-Tek", line].join("\n"),
    );
    expect(meet.results[0]?.time).toBe("1:02.00");
    expect(meet.results[0]?.swimmerName).toBe("");
  });

  it("ignores F0 relay leg lines that do not match and have no swimmer name", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E00010",
        "F0",
      ].join("\n"),
    );
    expect(meet.relays ?? []).toEqual([]);
  });

  it("parses B1 end dates, SCM course flags, C1 team codes, and relay leg attachment", () => {
    const content = [
      "A01V3      02Meet Results                  Hy-Tek",
      "B11        Meet Name                         Pool Name                         0101202502022025            SCM",
      "C11GA      GACTCCCherokee Town and Country Club",
      "E01GA      AGACTCC  F 1006  1 UN06   06012002     NT",
      "F01GA        1 GACTCCAAitkens, Liz                               04291996 6F000",
      cl2AthleteLine("G0", {
        eventNumber: 11,
        last: "Solo",
        first: "Swimmer",
        time: "30.00",
        place: 1,
      }),
    ].join("\n");
    const meet = parseCl2Meet(content);
    expect(meet.startDate).toBe("2025-01-01");
    expect(meet.endDate).toBe("2025-02-02");
    expect(meet.course).toBe("SCM");
    expect(meet.results[0]?.teamCode).toMatch(/GACTCC/i);
    expect(meet.relays?.[0]?.swimmerNames).toContain("Liz Aitkens");
    expect(meet.relays?.[0]?.eventNumber).toBe(1);
  });

  it("handles D0 entries without an event code and invalid B1 end dates", () => {
    const content = [
      "A01V3      02Meet Entries                  Hy-Tek",
      "B11                                                          BADSTART BADEND00            LCM",
      "D01    Smith, John                                           1:05.00",
    ].join("\n");
    const meet = parseCl2Meet(content);
    expect(meet.startDate).toBeUndefined();
    expect(meet.endDate).toBeUndefined();
    expect(meet.course).toBe("LCM");
    expect(meet.entries).toHaveLength(1);
    expect(meet.entries[0]?.eventNumber).toBeUndefined();
  });

  it("parses F0 last, first names when team code columns are blank", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E01GA      AGACTCC  F 1006  1 UN06   06012002     NT",
        `${"F01AZ".padEnd(22, " ")}Someone, Else`,
      ].join("\n"),
    );
    expect(meet.relays?.[0]?.swimmerNames).toContain("Else Someone");
  });

  it("attaches unmatched F0 legs to the most recent relay shell", () => {
    const content = [
      "A01V3      02Meet Entries                  Hy-Tek",
      "E01GA      AGACTCC  F 1006  1 UN06   06012002     NT",
      "F01GA        9 WRONGXSomeone, Else                               04291996 6F000",
    ].join("\n");
    const meet = parseCl2Meet(content);
    expect(meet.relays?.[0]?.swimmerNames.join(" ")).toMatch(/Else/);
  });

  it("preserves the previous C1 team code when a later C1 line does not parse", () => {
    const content = [
      "A01V3      02Meet Results                  Hy-Tek",
      "C11GA      GACTCCCherokee Town and Country Club",
      "C1",
      cl2AthleteLine("G0", {
        eventNumber: 11,
        last: "Solo",
        first: "Swimmer",
        time: "30.00",
        place: 1,
      }),
    ].join("\n");
    const meet = parseCl2Meet(content);
    expect(meet.results[0]?.teamCode).toMatch(/GACTCC/i);
  });

  it("keeps relay shells with only a team code and no attached legs", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E01GA      AGACTCC  F 1006  1 UN06   06012002     NT",
      ].join("\n"),
    );
    expect(meet.relays?.[0]?.teamCode).toMatch(/GACTCC/i);
    expect(meet.relays?.[0]?.swimmerNames).toEqual([]);
  });

  it("leaves importKind unset for unknown CL2 packs and honors A0 result labels", () => {
    const unknown = parseCl2Meet(
      "A01V3      02Custom Upload                 Hy-Tek",
    );
    expect(unknown.importKind).toBeUndefined();

    const results = parseCl2Meet(
      "A01V3      02Meet Results                  ".padEnd(73, " "),
    );
    expect(results.importKind).toBe("results");
    expect(results.name).toBe("Meet Results");
  });

  it("matches F0 legs to relays by team code and relay letter", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E01GA      AGACTCC  F 1006  1 UN06   06012002     NT",
        "F01GA        1 GACTCCAAitkens, Liz                               04291996 6F000",
      ].join("\n"),
    );
    expect(meet.relays?.[0]?.swimmerNames).toContain("Liz Aitkens");
    expect(meet.relays?.[0]?.eventNumber).toBe(1);
  });

  it("uses the meet event number on E0 rows, not the Hy-Tek stroke code", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E01AZ      AAZMARI  M 2006 15 UNOV   09102026     NT",
        "F01AZ       15 AZMARIAMunkirs, Bennett                                     M000",
        "E01AZ      BAZMARI  M 4006 21 UNOV   09102026     NT",
        "F01AZ       21 AZMARIBMunkirs, Bennett                                     M000",
      ].join("\n"),
    );
    expect(
      meet.relays
        ?.map((r) => r.eventNumber)
        .toSorted((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([15, 21]);
    expect(meet.relays?.find((r) => r.eventNumber === 15)).toMatchObject({
      relayLetter: "A",
      swimmerNames: ["Bennett Munkirs"],
    });
    expect(meet.relays?.find((r) => r.eventNumber === 21)).toMatchObject({
      relayLetter: "B",
      swimmerNames: ["Bennett Munkirs"],
    });
  });

  it("parses loosely spaced E0 rows via letter/team/code/event fields", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E01AZ                     A AZMARI M 2007 12 leftover",
        "F01AZ       12 AZMARIACain, Riley                                          F000",
      ].join("\n"),
    );
    expect(meet.relays?.[0]?.eventNumber).toBe(12);
    expect(meet.relays?.[0]?.teamCode).toBe("AZMARI");
    expect(meet.relays?.[0]?.swimmerNames).toContain("Riley Cain");
  });

  it("skips event metadata on loosely spaced E0 rows and X gender codes", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E01AZ      AAZMARI  X 2007  8 UNOV   09102026     NT",
        "E01AZ      AAZMARI  M      9 UNOV   09102026     NT",
        "E01AZ                     A AZMARI M 2007 12 leftover",
      ].join("\n"),
    );
    expect(
      meet.relays
        ?.map((r) => r.eventNumber)
        .toSorted((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([8, 9, 12]);
  });

  it("ignores loosely spaced E0 rows whose meet event number is zero", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E01AZ                     A AZMARI M 2007 0 leftover",
      ].join("\n"),
    );
    expect(meet.relays ?? []).toEqual([]);
  });

  it("embeds seed and final times on legacy D0-only result files", () => {
    const content = [
      "A01V3      02Meet Results                  Hy-Tek",
      "D01    Burns, Will                                         FF 1003 17 UNOV 1:38.01Y 1:36.51Y",
    ].join("\n");
    const meet = parseCl2Meet(content);
    expect(meet.results[0]?.time).toMatch(/36\.51/);
    expect(meet.entries[0]?.seedTime).toMatch(/38\.01/);
    expect(meet.course).toBe("SCY");
  });

  it("still records entries when a meet pack includes G0 result lines", () => {
    const content = [
      "A01V3      02Meet Results                  Hy-Tek",
      cl2AthleteLine("D0", {
        eventNumber: 11,
        last: "Lovelace",
        first: "Ada",
        time: "1:05.00",
      }),
      cl2AthleteLine("G0", {
        eventNumber: 11,
        last: "Lovelace",
        first: "Ada",
        time: "1:04.00",
        place: 1,
      }),
    ].join("\n");
    const meet = parseCl2Meet(content);
    expect(meet.entries).toHaveLength(1);
    expect(meet.results).toHaveLength(1);
  });

  it("skips blank D0 lines and legacy result rows without times", () => {
    const entriesMeet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "D00011",
        cl2AthleteLine("D0", {
          eventNumber: 11,
          last: "Only",
          first: "Gender",
          time: "1:05.00",
        }),
      ].join("\n"),
    );
    expect(entriesMeet.entries).toHaveLength(1);

    const resultsMeet = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        "D01    No Time Swimmer                                     FF 1002 17",
      ].join("\n"),
    );
    expect(resultsMeet.results).toHaveLength(0);
  });

  it("ignores zero event codes and maps mixed / XF gender markers", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "D01    Event, Zero                                         FF 000 17                    1:05.00",
        "D01    Athlete, Mix                                        XF 1001 17                    1:06.00",
        "D01    Swimmer, Open                                       Mixed 1003 17                 1:07.00",
      ].join("\n"),
    );
    expect(meet.entries.some((e) => e.swimmerName.includes("Mix"))).toBe(true);
    expect(meet.events.some((e) => e.gender === "mixed")).toBe(true);
    expect(meet.events.some((e) => e.eventNumber === 0)).toBe(false);
  });

  it("attaches relay legs that omit a team code to the latest relay shell", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E01GA      AGACTCC  F 1006  1 UN06   06012002     NT",
        "F01GA        1 Someone, Else                               04291996 6F000",
      ].join("\n"),
    );
    expect(meet.relays?.[0]?.swimmerNames.join(" ")).toMatch(/Else/);
  });

  it("defaults G0 DQ rows without a parsed time and infers gender from MM/FF markers", () => {
    const dqOnly = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        cl2AthleteLine("G0", {
          eventNumber: 5,
          last: "Doe",
          first: "Jane",
          time: "DQ",
          place: 1,
        }),
      ].join("\n"),
    );
    expect(dqOnly.results[0]?.time).toBe("DQ");

    const gendered = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "D01AZ  JR  McNamee, Marlie                          1115198912MM FF 1001 11 UNOV         1:16.69Y",
      ].join("\n"),
    );
    expect(gendered.entries[0]?.swimmerName).toMatch(/Marlie/);
  });

  it("covers remaining F0/G0/D0 edge branches for leg order, event columns, and course suffixes", () => {
    const relay = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "E01GA      AGACTCC  F 1006  1 UN06   06012002     NT",
        "F00GA        0 GACTCCAAitkens, Liz                               04291996 6F000",
      ].join("\n"),
    );
    expect(relay.relays?.[0]?.swimmerNames).toContain("Liz Aitkens");

    const g0 = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        cl2AthleteLine("G0", {
          eventNumber: 12,
          last: "Lane",
          first: "Fallback",
          time: "30.00",
          place: 2,
        }),
      ].join("\n"),
    );
    expect(g0.results[0]?.eventNumber).toBe(12);

    const legacyCourse = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        "D01    Burns, Will                                         FF 1003 17 UNOV 1:38.01L",
      ].join("\n"),
    );
    expect(legacyCourse.course).toBe("LCM");
  });

  it("keeps multi-word middle names on D0 athlete lines", () => {
    const named = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "D01    Smith, John Michael                                 FF 1001 17                    1:05.00",
      ].join("\n"),
    );
    expect(named.entries[0]?.swimmerName).toMatch(/Michael/);
  });

  it("parses SDIF-style DOB when AUSA birth date is absent", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "D01    Doe, Jane                                           06151985 M FF 1001 17                    1:05.00",
      ].join("\n"),
    );
    expect(meet.entries[0]?.swimmerName).toMatch(/Jane/);
  });

  it("reads both CL2 publisher fields from an entry banner", () => {
    const a0 =
      "A01V3      20Meet Entries                  " +
      "Hy-Tek, Ltd".padEnd(26, " ") +
      "8.0G" +
      "Hy-Tek, Ltd".padEnd(20, " ") +
      "252-633-5177" +
      "10212026";
    const meet = parseCl2Meet([a0, "B11"].join("\n"));
    expect(meet.cl2Publisher).toBe("Hy-Tek, Ltd");
    expect(meet.cl2Publisher2).toBe("Hy-Tek, Ltd");
    expect(meet.cl2Software).toBe("8.0G");
    expect(meet.cl2VendorPhone).toBe("252-633-5177");
    expect(meet.cl2CreatedOn).toBe("2026-10-21");
  });

  it("keeps the D0 name field and F0 registration text", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      20Meet Entries                  Hy-Tek",
        "E01AZ      AAZMARI  F 2006 12 UNOV   10242026",
        `${"F01AZ       12 AZMARIALovelace, Ada Q".padEnd(65, " ")}0101201016F000`.padEnd(
          92,
          " ",
        ) + "REG123",
        "D01AZ  JR  Lovelace, Ada Q",
      ].join("\n"),
    );
    expect(meet.entries[0]?.cl2NameField?.startsWith("Lovelace, Ada Q")).toBe(
      true,
    );
    expect(
      meet.relays?.[0]?.cl2LegNameFields?.[0]?.startsWith("Lovelace, Ada Q"),
    ).toBe(true);
    expect(meet.relays?.[0]?.cl2LegExtras?.[0]?.startsWith("REG123")).toBe(
      true,
    );
    expect(meet.relays?.[0]?.cl2LegIdentity?.[0]).toBe("0101201016F000");
  });

  it("reads a Team Manager B1 when the end date is blank", () => {
    const line = `${"B11".padEnd(121, " ")}10242026${" ".repeat(30)}Y`;
    const meet = parseCl2Meet(
      [
        "A01V3      20Meet Entries                  Spring Invitational",
        line,
      ].join("\n"),
    );
    expect(meet.name).toBe("Spring Invitational");
    expect(meet.startDate).toBe("2026-10-24");
    expect(meet.endDate).toBeUndefined();
    expect(meet.course).toBe("SCY");
    const legacyScm = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        `${"B1".padEnd(87, " ")}S`,
      ].join("\n"),
    );
    expect(legacyScm.course).toBe("SCM");
  });

  it("reads meet course from B1 column 150, not an S inside the facility name", () => {
    const sky = `${"B11        2026 Meet                         Copper Sky Aquatic Center".padEnd(149, " ")}Y`;
    const meet = parseCl2Meet(
      ["A01V3      02Meet Entries                  Hy-Tek", sky].join("\n"),
    );
    expect(meet.course).toBe("SCY");
    expect(meet.name).toContain("2026 Meet");
    const meters = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        `${"B1".padEnd(149, " ")}S`,
      ].join("\n"),
    );
    expect(meters.course).toBe("SCM");
    const longCourse = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        `${"B1".padEnd(149, " ")}L`,
      ].join("\n"),
    );
    expect(longCourse.course).toBe("LCM");
  });

  it("keeps MARI as the team code when C1 stores AZMARI, and fills a blank D0 id from D3", () => {
    const c1 = "C11AZ      AZMARIMaricopa High School          MHS";
    const d0chars = Array.from({ length: 160 }, () => " ");
    const put = (col: number, value: string) => {
      for (let i = 0; i < value.length; i++) d0chars[col - 1 + i] = value[i]!;
    };
    put(1, "D01AZ  SR  Alden, Briar");
    put(66, "FF");
    put(69, "1001");
    put(74, "12");
    put(90, "1:11.01");
    put(97, "Y");
    const d3chars = Array.from({ length: 156 }, () => " ");
    d3chars[0] = "D";
    d3chars[1] = "3";
    const usa = "ABCD1234567890";
    for (let i = 0; i < usa.length; i++) d3chars[2 + i] = usa[i]!;
    for (const [i, ch] of [..."Bri"].entries()) d3chars[16 + i] = ch;
    d3chars[31] = "X";
    for (let i = 0; i < 13; i++) d3chars[33 + i] = "F";
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        c1,
        d0chars.join(""),
        d3chars.join(""),
      ].join("\n"),
    );
    expect(meet.teamCode).toBe("MARI");
    expect(meet.lscCode).toBe("AZ");
    expect(meet.teamName).toBe("Maricopa High School");
    expect(meet.teamShortName).toBe("MHS");
    expect(meet.entries[0]?.classYear).toBe("SR");
    expect(meet.entries[0]?.seedCourse).toBe("SCY");
    expect(meet.entries[0]?.usaMemberId).toBe(usa);
    expect(meet.entries[0]?.preferredName).toBe("Bri");
    expect(meet.entries[0]?.ethnicity).toBe("X");
    expect(meet.entries[0]?.registrationFlags).toBe("FFFFFFFFFFFFF");
  });

  it("leaves a too-short LSC prefix in place and ignores a D3 before any swimmer", () => {
    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Entries                  Hy-Tek",
        "C11AZ      AZX",
        "D3",
        "D01AZ      Doe, Jane                                           FF 1001  1                    1:05.00",
      ].join("\n"),
    );
    expect(meet.teamCode).toBe("AZX");
    expect(meet.entries[0]?.usaMemberId).toBeUndefined();
  });

  it("keeps relay splits off individual results and stores the lead-off", () => {
    const blank = (tag: string) => `${tag}${" ".repeat(159)}`.slice(0, 160);
    const put = (raw: string, col: number, value: string) => {
      const chars = raw.split("");
      for (let i = 0; i < value.length; i++) chars[col - 1 + i] = value[i]!;
      return chars.join("");
    };
    const e0 = (() => {
      let line = blank("E0");
      line = put(line, 12, "A");
      line = put(line, 13, "AZMARI");
      line = put(line, 21, "M");
      line = put(line, 23, "4006");
      line = put(line, 27, "  21");
      line = put(line, 73, " 3:46.22");
      return line;
    })();
    const leg = (name: string, order: string) => {
      let line = blank("F0");
      line = put(line, 16, "AZMARI");
      line = put(line, 22, "A");
      line = put(line, 23, name);
      line = put(line, 78, order);
      return line;
    };
    const split = (times: string) => {
      let line = blank("G0");
      line = put(line, 56, `1 8  50C ${times}`);
      line = put(line, 160, "F");
      return line;
    };
    let individual = blank("D0");
    individual = put(individual, 12, "Park, Eve");
    individual = put(individual, 69, "1004  9");
    individual = put(individual, 116, " 1:10.19");
    let individualSplit = blank("G0");
    individualSplit = put(individualSplit, 12, "Park, Eve");
    individualSplit = put(individualSplit, 56, "1 2  50C 31.93 1:10.19");
    individualSplit = put(individualSplit, 160, "F");

    const meet = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        e0,
        leg("Lane, Ada", " 1"),
        split("28.78 1:00.22"),
        leg("Lane, Bea", " 2"),
        split("1:27.59 1:56.58"),
        leg("Lane, Cleo", " 3"),
        split("2:24.42 3:00.48"),
        leg("Lane, Dot", " 4"),
        split("3:19.52 3:46.22"),
        individual,
        "D3",
        individualSplit,
      ].join("\n"),
    );

    expect(meet.results.map((result) => result.time)).toEqual(["1:10.19"]);
    expect(meet.results[0]).toMatchObject({
      swimmerName: "Eve Park",
      eventNumber: 9,
      resultType: "finals",
      splitsMs: [31_930, 70_190],
    });
    expect(meet.results.some((result) => result.time === "2:24.42")).toBe(
      false,
    );
    expect(meet.events.some((event) => event.eventNumber === 3)).toBe(false);
    expect(meet.relays?.[0]?.results?.[0]).toMatchObject({
      time: "3:46.22",
      resultType: "finals",
      legSplits: [{ legOrder: 1, time: "1:00.22" }],
    });
  });

  it("does not read a split time fragment as the meet event number", () => {
    const blank = (tag: string) => `${tag}${" ".repeat(159)}`.slice(0, 160);
    const put = (raw: string, col: number, value: string) => {
      const chars = raw.split("");
      for (let i = 0; i < value.length; i++) chars[col - 1 + i] = value[i]!;
      return chars.join("");
    };
    let dotted = blank("G0");
    dotted = put(dotted, 12, "Lane, Dot");
    dotted = put(dotted, 69, ".42   3");
    dotted = put(dotted, 80, "30.00");
    let timed = blank("G0");
    timed = put(timed, 12, "Lane, Tim");
    timed = put(timed, 69, "10013:00");
    timed = put(timed, 80, "31.00");
    const meet = parseCl2Meet(
      ["A01V3      02Meet Results                  Hy-Tek", dotted, timed].join(
        "\n",
      ),
    );
    expect(meet.results.map((result) => result.eventNumber)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("matches relay and individual checkpoints to the round that owns them", () => {
    const blank = (tag: string) => `${tag}${" ".repeat(159)}`.slice(0, 160);
    const put = (raw: string, col: number, value: string) => {
      const chars = raw.split("");
      for (let i = 0; i < value.length; i++) chars[col - 1 + i] = value[i]!;
      return chars.join("");
    };
    const relayShell = (finals: string, prelim?: string) => {
      let line = blank("E0");
      line = put(line, 12, "A");
      line = put(line, 13, "AZMARI");
      line = put(line, 21, "M");
      line = put(line, 23, "2006");
      line = put(line, 27, "  15");
      if (prelim) line = put(line, 55, prelim);
      line = put(line, 73, finals);
      return line;
    };
    const leg = (name: string, order: string) => {
      let line = blank("F0");
      line = put(line, 16, "AZMARI");
      line = put(line, 22, "A");
      line = put(line, 23, name);
      if (order) line = put(line, 78, order);
      return line;
    };
    const relaySplit = (times: string, round: string) => {
      let line = blank("G0");
      line = put(line, 56, `1 4  50C ${times}`.trimEnd());
      if (round) line = put(line, 160, round);
      return line;
    };

    const rounds = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell(" 1:48.00", " 1:50.00"),
        leg("Lane, Ada", " 1"),
        relaySplit("25.00", "P"),
        relaySplit("26.00", "F"),
        leg("Lane, Bea", " 2"),
        relaySplit("55.00", "P"),
        relaySplit("54.00", "F"),
      ].join("\n"),
    );
    const relayResults = rounds.relays?.[0]?.results ?? [];
    expect(
      relayResults.find((result) => result.resultType === "prelim")?.legSplits,
    ).toEqual([{ legOrder: 1, time: "25.00" }]);
    expect(
      relayResults.find((result) => result.resultType === "finals")?.legSplits,
    ).toEqual([{ legOrder: 1, time: "26.00" }]);

    const unmarked = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell(" 1:40.00"),
        leg("Lane, Ada", " 1"),
        relaySplit("40.00", ""),
      ].join("\n"),
    );
    expect(unmarked.relays?.[0]?.results?.[0]?.legSplits).toEqual([
      { legOrder: 1, time: "40.00" },
    ]);

    const unmarkedPair = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell(" 1:40.00", " 1:42.00"),
        leg("Lane, Ada", " 1"),
        relaySplit("40.00", ""),
      ].join("\n"),
    );
    expect(
      unmarkedPair.relays?.[0]?.results?.every(
        (result) => result.legSplits == null,
      ),
    ).toBe(true);

    const stopped = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell(" 2:00.00"),
        leg("Lane, Ada", " 1"),
        relaySplit("0.00 30.00", "F"),
        relaySplit("20.00", "F"),
        leg("Lane, Bea", " 3"),
        relaySplit("1:10.00", "F"),
        leg("Lane, Cam", " 5"),
        relaySplit("1:40.00", "F"),
      ].join("\n"),
    );
    expect(stopped.relays?.[0]?.results?.[0]?.legSplits).toEqual([
      { legOrder: 1, time: "20.00" },
    ]);

    const noLeadOff = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell(" 2:00.00"),
        leg("Lane, Bea", " 2"),
        relaySplit("55.00", "F"),
      ].join("\n"),
    );
    expect(noLeadOff.relays?.[0]?.results?.[0]?.legSplits).toBeUndefined();

    const disqualified = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell("      DQ", " 1:50.00"),
        leg("Lane, Ada", " 1"),
        relaySplit("25.00", "P"),
        relaySplit("26.00", "F"),
      ].join("\n"),
    );
    const dqResults = disqualified.relays?.[0]?.results ?? [];
    expect(
      dqResults.find((result) => result.resultType === "prelim")?.legSplits,
    ).toEqual([{ legOrder: 1, time: "25.00" }]);
    expect(
      dqResults.find((result) => result.resultType === "finals"),
    ).toMatchObject({ time: "DQ", isDq: true });
    expect(
      dqResults.find((result) => result.resultType === "finals")?.legSplits,
    ).toBeUndefined();

    const noSwimRelay = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell("      NS"),
        leg("Lane, Ada", " 1"),
        relaySplit("25.00", "F"),
      ].join("\n"),
    );
    expect(noSwimRelay.relays?.[0]?.results?.[0]).toMatchObject({
      time: "NS",
      isDq: false,
      noSwim: true,
      resultType: "finals",
    });
    expect(noSwimRelay.relays?.[0]?.results?.[0]?.legSplits).toBeUndefined();

    let bare = blank("E0");
    bare = put(bare, 12, "A");
    bare = put(bare, 13, "AZMARI");
    bare = put(bare, 23, "2006");
    bare = put(bare, 27, "  15");
    const noTeamTime = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        bare,
        leg("Lane, Ada", " 1"),
        relaySplit("30.00", "F"),
      ].join("\n"),
    );
    expect(noTeamTime.relays?.[0]?.results).toBeUndefined();
    expect(noTeamTime.results).toEqual([]);

    const noSplits = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell(" 1:40.00"),
        leg("Lane, Ada", " 1"),
      ].join("\n"),
    );
    expect(noSplits.relays?.[0]?.results?.[0]?.legSplits).toBeUndefined();

    const fallbackOrder = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell(" 1:10.00"),
        leg("Lane, Ada", ""),
        relaySplit("32.50", "F"),
        relayShell(" 1:11.00"),
        leg("Lane, Bea", " 9"),
        relaySplit("33.25", "F"),
      ].join("\n"),
    );
    expect(fallbackOrder.relays?.[0]?.results?.[0]?.legSplits).toEqual([
      { legOrder: 1, time: "32.50" },
    ]);
    expect(fallbackOrder.relays?.[1]?.results?.[0]?.legSplits).toEqual([
      { legOrder: 1, time: "33.25" },
    ]);

    const emptyRelaySplit = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        relayShell(" 1:10.00"),
        leg("Lane, Ada", " 1"),
        relaySplit("", "F"),
      ].join("\n"),
    );
    expect(
      emptyRelaySplit.relays?.[0]?.results?.[0]?.legSplits,
    ).toBeUndefined();
    expect(emptyRelaySplit.results).toEqual([]);

    let bothRounds = blank("D0");
    bothRounds = put(bothRounds, 12, "Park, Eve");
    bothRounds = put(bothRounds, 69, "1004  9");
    bothRounds = put(bothRounds, 98, " 1:12.00");
    bothRounds = put(bothRounds, 116, " 1:10.19");
    let unmarkedSplit = blank("G0");
    unmarkedSplit = put(unmarkedSplit, 56, "1 2  50C 32.00 1:11.00");
    let finalsOnly = blank("G0");
    finalsOnly = put(finalsOnly, 56, "1 2  50C 31.93 1:10.19");
    finalsOnly = put(finalsOnly, 160, "F");
    let oneRound = blank("D0");
    oneRound = put(oneRound, 12, "Park, Ida");
    oneRound = put(oneRound, 69, "1004 10");
    oneRound = put(oneRound, 116, " 1:11.00");
    let ned = blank("D0");
    ned = put(ned, 12, "Park, Ned");
    ned = put(ned, 69, "1001 11");
    ned = put(ned, 116, "   59.00");
    let emptySplit = blank("G0");
    emptySplit = put(emptySplit, 56, "1 2  50C");
    let rio = blank("D0");
    rio = put(rio, 12, "Park, Rio");
    rio = put(rio, 69, "1001 12");
    rio = put(rio, 116, "   58.00");
    let swimoff = blank("G0");
    swimoff = put(swimoff, 56, "1 2  50C 40.00");
    swimoff = put(swimoff, 160, "S");
    const withMarker = put(blank("G0"), 56, "1 2  50C 22.00");

    const individual = parseCl2Meet(
      [
        "A01V3      02Meet Results                  Hy-Tek",
        withMarker,
        bothRounds,
        unmarkedSplit,
        finalsOnly,
        oneRound,
        unmarkedSplit,
        ned,
        emptySplit,
        rio,
        swimoff,
      ].join("\n"),
    );
    const eve = individual.results.filter((result) =>
      result.swimmerName.includes("Eve"),
    );
    expect(
      eve.find((result) => result.resultType === "prelim")?.splitsMs,
    ).toBeUndefined();
    expect(
      eve.find((result) => result.resultType === "finals")?.splitsMs,
    ).toEqual([31_930, 70_190]);
    expect(
      individual.results.find((result) => result.swimmerName.includes("Ida"))
        ?.splitsMs,
    ).toEqual([32_000, 71_000]);
    expect(
      individual.results.find((result) => result.swimmerName.includes("Ned"))
        ?.splitsMs,
    ).toBeUndefined();
    expect(
      individual.results.find((result) => result.swimmerName.includes("Rio"))
        ?.splitsMs,
    ).toBeUndefined();
    expect(individual.results.some((result) => result.time === "22.00")).toBe(
      false,
    );
    expect(individual.results.some((result) => result.time === "40.00")).toBe(
      false,
    );
  });
});
