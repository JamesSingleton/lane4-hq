import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exportSdif, parseSdif, parseTime } from "../../src/sdif/parser";
import { parseUssSdif } from "../../src/sdif/uss";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

function sdifB1Line(
  name: string,
  location: string,
  startDate: string,
  courseSuffix = " LCM",
): string {
  let line = "B11";
  line = line.padEnd(11, " ");
  line += name.padEnd(30, " ").slice(0, 30);
  line += location.padEnd(30, " ").slice(0, 30);
  line += startDate.padEnd(8, " ").slice(0, 8);
  return line + courseSuffix;
}

describe("parseSdif", () => {
  it("parses TeamUnify SD3 fixture", () => {
    const content = readFileSync(
      join(fixturesDir, "AZAZSL_ext7716201449890453768.sd3"),
    ).toString("utf8");
    const meet = parseSdif(content);

    expect(meet.name).toBe("AZSI Swimming 2026 SCY Regiona");
    expect(meet.course).toBe("SCY");
    expect(meet.startDate).toBe("2026-02-20");
    expect(meet.endDate).toBe("2026-02-22");
    expect(meet.importKind).toBe("entries");
    expect(meet.teamCode).toBe("AZAZSL");
    expect(meet.entries).toHaveLength(42);
    expect(meet.entries[0]).toMatchObject({
      swimmerName: "Ethan Armstrong",
      eventNumber: 40,
      seedTime: "4:56.31",
      seedCourse: "LCM",
      dateOfBirth: "2009-03-21",
      gender: "male",
      usaMemberId: "F6250F958AD545",
      eventSuffix: "B",
    });
    expect(meet.events.some((event) => event.eventNumber === 40)).toBe(true);
    expect(meet.relays).toBeUndefined();
  });

  it("parses synthetic SDIF records for all branches", () => {
    const content = [
      "A0V3      02Meet Entries                  Custom Title From A0",
      sdifB1Line("B1 Meet Name", "B1 Location", "01012025"),
      ...exportSdif({
        name: "unused",
        course: "SCY",
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
            distance: 100,
            stroke: "back",
            gender: "male",
            eventKey: "x",
          },
        ],
        entries: [
          {
            eventNumber: 1,
            swimmerName: "Ada Lovelace",
            seedTime: "1:05.00",
            usaMemberId: "MEMBER123456",
          },
          { eventNumber: 2, swimmerName: "Bob Smith", seedTime: "1:06.00" },
        ],
        results: [
          {
            eventNumber: 1,
            swimmerName: "Ada Lovelace",
            time: "DQ",
            place: 1,
            isDq: true,
          },
          {
            eventNumber: 2,
            swimmerName: "Bob Smith",
            time: "1:03.00",
            place: 2,
            isDq: false,
          },
        ],
      })
        .split("\r\n")
        .filter(
          (line) =>
            line.startsWith("E1") ||
            line.startsWith("D0") ||
            line.startsWith("G0"),
        ),
    ].join("\n");

    const meet = parseSdif(content);
    expect(meet.name).toBe("B1 Meet Name");
    expect(meet.location).toBe("B1 Location");
    expect(meet.startDate).toBe("2025-01-01");
    expect(meet.course).toBe("LCM");

    expect(meet.events[0]).toMatchObject({
      eventNumber: 1,
      distance: 50,
      stroke: "free",
      gender: "female",
    });
    expect(meet.events[1]?.stroke).toBe("back");

    expect(meet.entries.length).toBe(2);
    expect(meet.results.length).toBe(2);
    expect(meet.results.some((r) => r.isDq)).toBe(true);
    expect(meet.results.every((r) => r.time.length > 0)).toBe(true);
  });

  it("detects SCM course from B1 line", () => {
    const meet = parseSdif(
      "B1        SCM Meet                        Pool                          SCM",
    );
    expect(meet.course).toBe("SCM");
  });

  it("skips G0 results without a time", () => {
    const meet = parseSdif(
      "G0    0003              Empty               Time                                    ",
    );
    expect(meet.results).toEqual([]);
  });

  it("parses F0 relay records with alternate team and seed-time columns", () => {
    function fixed(len: number): string[] {
      return Array.from({ length: len }, () => " ");
    }
    function put(buf: string[], start: number, value: string) {
      for (let i = 0; i < value.length; i++) buf[start + i] = value[i]!;
    }

    const f0Primary = fixed(110);
    put(f0Primary, 0, "F0");
    put(f0Primary, 2, "0010");
    put(f0Primary, 11, "TEAM1");
    put(f0Primary, 99, "1:45.00");

    const f0Fallback = fixed(110);
    put(f0Fallback, 0, "F0");
    put(f0Fallback, 2, "0007");
    put(f0Fallback, 11, "TEAM1");
    put(f0Fallback, 72, "1:50.00");

    const meet = parseSdif(
      [f0Primary.join(""), f0Fallback.join("")].join("\n"),
    );
    expect(meet.relays).toHaveLength(2);
    expect(meet.relays?.[0]).toMatchObject({
      eventNumber: 10,
      teamCode: "TEAM1",
      seedTime: "1:45.00",
    });
    expect(meet.relays?.[1]?.seedTime).toBe("1:50.00");
  });

  it("reads F0 team codes from column 2 when column 11 is blank", () => {
    function fixed(len: number): string[] {
      return Array.from({ length: len }, () => " ");
    }
    function put(buf: string[], start: number, value: string) {
      for (let i = 0; i < value.length; i++) buf[start + i] = value[i]!;
    }

    const f0 = fixed(110);
    put(f0, 0, "F0");
    put(f0, 2, "TEAM1");
    put(f0, 9, "07  ");
    put(f0, 72, "1:50.00");

    const meet = parseSdif(f0.join(""));
    expect(meet.relays?.[0]).toMatchObject({
      eventNumber: 7,
      teamCode: "TEAM1",
      seedTime: "1:50.00",
    });
  });

  it("allows F0 relays without team code or seed time", () => {
    function fixed(len: number): string[] {
      return Array.from({ length: len }, () => " ");
    }
    function put(buf: string[], start: number, value: string) {
      for (let i = 0; i < value.length; i++) buf[start + i] = value[i]!;
    }
    const f0 = fixed(110);
    put(f0, 0, "F0");
    put(f0, 9, "12");
    const meet = parseSdif(f0.join(""));
    expect(meet.relays?.[0]).toMatchObject({
      eventNumber: 12,
      teamCode: undefined,
      seedTime: undefined,
    });
  });

  it("uses alternate G0 place and dq code columns", () => {
    function fixed(len: number): string[] {
      return Array.from({ length: len }, () => " ");
    }
    function put(buf: string[], start: number, value: string) {
      for (let i = 0; i < value.length; i++) buf[start + i] = value[i]!;
    }

    const g0 = fixed(120);
    put(g0, 0, "G0");
    put(g0, 2, "0005");
    put(g0, 11, "Doe");
    put(g0, 31, "Jane");
    put(g0, 82, "0002");
    put(g0, 99, "1:01.00");
    put(g0, 117, "Q");

    const meet = parseSdif(g0.join(""));
    expect(meet.results[0]).toMatchObject({
      eventNumber: 5,
      time: "1:01.00",
      place: 2,
      dqCode: "Q",
    });
  });

  it("uses fallback SDIF name, member id, and place fields", () => {
    function fixed(len: number, fill = " "): string[] {
      return Array.from({ length: len }, () => fill);
    }
    function put(buf: string[], start: number, value: string) {
      for (let i = 0; i < value.length; i++) buf[start + i] = value[i]!;
    }

    // Primary name fields (48–88) left blank so fallback 31–51 / 11–31 is used.
    // Seed/time at 99–107 (outside the name window).
    const d0 = fixed(120);
    put(d0, 0, "D0");
    put(d0, 11, "Smith");
    put(d0, 31, "Bob");
    put(d0, 99, "1:06.00");

    const g0 = fixed(120);
    put(g0, 0, "G0");
    put(g0, 11, "Smith");
    put(g0, 31, "Pat");
    put(g0, 99, "1:03.00");
    put(g0, 113, "2");

    const meet = parseSdif([d0.join(""), g0.join("")].join("\n"));
    expect(meet.entries[0]?.swimmerName).toBe("Bob Smith");
    expect(meet.entries[0]?.usaMemberId).toBeUndefined();
    expect(meet.results[0]?.swimmerName).toBe("Pat Smith");
    expect(meet.results[0]?.place).toBe(2);
  });

  it("covers empty A0/B1 titles and alternate E1 field offsets", () => {
    function fixed(len: number, fill = " "): string[] {
      return Array.from({ length: len }, () => fill);
    }
    function put(buf: string[], start: number, value: string) {
      for (let i = 0; i < value.length; i++) buf[start + i] = value[i]!;
    }

    const a0 = fixed(80);
    put(a0, 0, "A0");

    const b1 = fixed(80);
    put(b1, 0, "B1");
    put(b1, 71, "notadate");

    // Primary E1 slots empty → fallbacks at 16–24 / 2–6.
    const e1 = fixed(40);
    put(e1, 0, "E1");
    put(e1, 2, "0007");
    put(e1, 16, "F");
    put(e1, 17, "0100");
    put(e1, 21, "XYZ");

    // Both distance/eventNumber primary+fallback empty → distance 0, eventNumber undefined.
    const e1Sparse = fixed(40);
    put(e1Sparse, 0, "E1");
    put(e1Sparse, 16, "M");
    put(e1Sparse, 21, "FR");

    const meet = parseSdif(
      [a0.join(""), b1.join(""), e1.join(""), e1Sparse.join("")].join("\n"),
    );
    expect(meet.name).toBe("Imported Meet");
    expect(meet.location).toBeUndefined();
    expect(meet.course).toBe("SCY");
    expect(meet.events[0]).toMatchObject({
      eventNumber: 7,
      distance: 100,
      stroke: "xyz",
      gender: "female",
    });
    expect(meet.events[1]).toMatchObject({
      eventNumber: undefined,
      distance: 0,
      stroke: "free",
      gender: "male",
    });
  });
});

describe("USS SDIF v3", () => {
  function record(
    code: string,
    fields: Array<[number, string]>,
    length = 160,
  ): string {
    const chars = Array.from({ length }, () => " ");
    function put(column: number, value: string) {
      for (let i = 0; i < value.length; i++) {
        const at = column - 1 + i;
        if (at >= 0 && at < chars.length) chars[at] = value[i]!;
      }
    }
    put(1, code);
    for (const [column, value] of fields) put(column, value);
    return chars.join("");
  }

  function individual(options: {
    name: string;
    dob: string;
    sex?: string;
    eventSex?: string;
    distance?: string;
    stroke?: string;
    event?: string;
    age?: string;
    seed?: string;
    course?: string;
    uss?: string;
  }): string {
    return record("D0", [
      [3, "1"],
      [12, options.name],
      [40, options.uss ?? ""],
      [56, options.dob],
      [66, options.sex ?? "F"],
      [67, options.eventSex ?? options.sex ?? "F"],
      [68, (options.distance ?? "50").padStart(4, " ")],
      [72, options.stroke ?? "1"],
      [73, options.event ?? ""],
      [77, options.age ?? ""],
      [89, options.seed ?? ""],
      [97, options.course ?? ""],
    ]);
  }

  it("parses SwimTopia-style entries, relays, and swimmer info", () => {
    const content = [
      record("D3", [[3, "EARLYID"]]),
      record("F0", [[23, "Nobody, Yet"]]),
      record("A0", [
        [3, "1"],
        [4, "V3"],
        [12, "01"],
      ]),
      record("B1", [
        [12, "2026 BTA Summer Champs"],
        [86, "Kingwood"],
        [106, "TX"],
        [122, "06072026"],
        [130, "06072026"],
        [150, "Y"],
      ]),
      record("C1", [[18, "Ghost Team"]]),
      record("C1", [[12, "  BB  "]]),
      record("C1", [
        [12, "BB"],
        [18, "Bear Branch Swim Team"],
        [48, "Bear Branch"],
        [64, "2261 Northpark Dr"],
        [86, "#122"],
        [108, "Kingwood"],
        [128, "TX"],
        [130, "77339"],
        [140, "USA"],
      ]),
      individual({
        name: "Barrett, Henry D",
        dob: "01182019",
        sex: "M",
        distance: "25",
        stroke: "9",
        event: "8",
        seed: "NT",
        uss: "ABCDEF123456",
      }),
      individual({
        name: "Alder, Emily M",
        dob: "01222015",
        distance: "50",
        stroke: "2",
        event: "42A",
        age: "1111",
        seed: "49.17",
        course: "Y",
      }),
      record("D3", [[17, "Em"]]),
      record("D3", [[3, "99999999999999"]]),
      record("D3", []),
      individual({
        name: "Alder, Emily M",
        dob: "01222015",
        distance: "25",
        stroke: "1",
        event: "27B",
        age: "1111",
        seed: "23.00",
        course: "Y",
      }),
      individual({
        name: "Barrett, Henry D",
        dob: "01182019",
        sex: "M",
        distance: "25",
        stroke: "9",
        event: "8",
        seed: "30.00",
        uss: "ABCDEF123456",
      }),
      individual({
        name: "No, Event",
        dob: "",
        sex: "X",
        distance: "0",
        stroke: "1",
        event: "",
        seed: "",
      }),
      individual({
        name: "Letter, Only",
        dob: "01012010",
        distance: "0",
        stroke: "1",
        event: "A",
        seed: "",
      }),
      record("D3", [[3, "ONLYUSA1234567"]]),
      record("E0", [
        [12, "A"],
        [13, "  BB  "],
        [21, "X"],
        [22, " 200"],
        [26, "7"],
        [27, "  3"],
        [31, "1112"],
        [46, "1:45.00"],
        [54, "Y"],
      ]),
      record("F0", [
        [23, "West, Josette G"],
        [66, "01012010"],
        [76, "F"],
        [77, "222"],
      ]),
      record("F0", [
        [23, "Alder, Emily M"],
        [66, "01222015"],
        [76, "F"],
        [77, "111"],
      ]),
      record("F0", [[23, ""]]),
      record("E0", [
        [21, "F"],
        [22, " 100"],
        [26, "9"],
        [31, "UN06"],
        [46, "NT"],
        [54, "S"],
      ]),
      record("F0", [
        [23, "Only, Relay"],
        [76, "F"],
        [77, "   "],
      ]),
      record("E0", [
        [22, "   0"],
        [26, "6"],
      ]),
    ].join("\r\n");

    const meet = parseSdif(content);
    expect(meet).toMatchObject({
      name: "2026 BTA Summer Champs",
      course: "SCY",
      startDate: "2026-06-07",
      endDate: undefined,
      location: "Kingwood, TX",
      importKind: "entries",
      teamCode: "BB",
      teamName: "Bear Branch Swim Team",
      teamShortName: "Bear Branch",
      teamAddressLine1: "2261 Northpark Dr",
      teamAddressLine2: "#122",
      teamCity: "Kingwood",
      teamRegion: "TX",
      teamPostalCode: "77339",
      teamCountry: "USA",
    });
    expect(meet.entries[0]).toMatchObject({
      swimmerName: "Henry Barrett",
      seedTime: undefined,
      gender: "male",
      seedCourse: "SCY",
      usaMemberId: "ABCDEF123456",
    });
    expect(meet.entries[1]).toMatchObject({
      swimmerName: "Em Alder",
      eventNumber: 42,
      eventSuffix: "A",
      seedTime: "49.17",
      seedCourse: "SCY",
      gender: "female",
      dateOfBirth: "2015-01-22",
      usaMemberId: "99999999999999",
    });
    expect(meet.entries[2]?.swimmerName).toBe("Em Alder");
    expect(meet.entries[2]?.eventSuffix).toBe("B");
    expect(
      meet.entries.find((entry) => entry.swimmerName === "Only Letter"),
    ).toMatchObject({ eventNumber: undefined, eventSuffix: "A" });
    expect(meet.entries[2]?.usaMemberId).toBe("99999999999999");
    expect(meet.entries[4]?.gender).toBeUndefined();
    expect(meet.entries[4]?.dateOfBirth).toBeUndefined();
    expect(meet.events.map((event) => event.stroke)).toEqual(
      expect.arrayContaining(["back", "free", "medley_relay", "free_relay"]),
    );
    expect(
      meet.events.find((event) => event.eventNumber === 42)?.ageGroup,
    ).toBe("11-11");
    expect(meet.relays?.[0]).toMatchObject({
      eventNumber: 3,
      relayLetter: "A",
      teamCode: "BB",
      seedTime: "1:45.00",
      seedCourse: "SCY",
      swimmerNames: ["Emily Alder", "Josette West"],
    });
    expect(meet.relays?.[1]).toMatchObject({
      seedTime: undefined,
      seedCourse: "SCM",
      teamCode: "BB",
      swimmerNames: ["Relay Only"],
    });
    expect(meet.relays?.[2]?.swimmerNames).toEqual([]);
    expect(
      meet.athletes?.find((athlete) => athlete.name === "Relay Only"),
    ).toMatchObject({ relayOnly: true, gender: "female" });
    expect(
      meet.athletes?.find((athlete) => athlete.name === "Em Alder")?.relayOnly,
    ).toBe(false);
  });

  it("reads the other meet, course, and file-code branches", () => {
    const dob = individual({
      name: "Lane, Ada",
      dob: "01012010",
      distance: "100",
      stroke: "1",
      event: "1",
      course: "L",
    });
    const results = parseSdif(
      [
        record("D0", [
          [3, "1"],
          [12, "NoComma Name"],
          [56, "01012010"],
        ]),
        record("D0", [
          [3, "1"],
          [56, "BAD"],
        ]),
        record("A0", [
          [4, "V3"],
          [12, "02"],
        ]),
        record("B1", [
          [12, "City Only Meet"],
          [86, "Austin"],
          [150, "L"],
        ]),
        dob,
      ].join("\n"),
    );
    expect(results.importKind).toBe("results");
    expect(results.location).toBe("Austin");
    expect(results.course).toBe("LCM");
    expect(results.startDate).toBeUndefined();

    const stateOnly = parseSdif(
      [
        record("A0", [
          [4, "V3"],
          [12, "99"],
        ]),
        record("B1", [
          [106, "TX"],
          [150, "S"],
        ]),
        dob,
      ].join("\n"),
    );
    expect(stateOnly.importKind).toBeUndefined();
    expect(stateOnly.name).toBe("Imported Meet");
    expect(stateOnly.location).toBe("TX");
    expect(stateOnly.course).toBe("SCM");

    const bare = parseSdif([record("B1", [[122, "notadate"]]), dob].join("\n"));
    expect(bare.importKind).toBeUndefined();
    expect(bare.location).toBeUndefined();
    expect(bare.endDate).toBeUndefined();
    expect(bare.course).toBe("SCY");
    expect(parseUssSdif("B1\n").athletes).toBeUndefined();
    expect(parseUssSdif("B1\n").relays).toBeUndefined();
  });
});

describe("sdif re-exports", () => {
  it("re-exports exportSdif and parseTime", () => {
    expect(typeof exportSdif).toBe("function");
    expect(parseTime("1:05.00")).toBeGreaterThan(0);
  });
});
