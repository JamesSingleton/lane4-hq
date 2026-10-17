import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  type ExtractedMeetFile,
  extractAllMeetFilesFromZip,
  mergeParsedMeets,
  selectPrimaryMeetFile,
} from "../../src/meet/zip";
import type { ParsedMeet } from "../../src/types";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

function file(
  filename: string,
  content: string,
  format: ExtractedMeetFile["format"],
  depth = 0,
): ExtractedMeetFile {
  return {
    filename,
    bytes: strToU8(content),
    format,
    depth,
  };
}

describe("selectPrimaryMeetFile", () => {
  it("flags roster-only top-level packs and keeps top-level roster files", () => {
    const rosterCl2 = readFileSync(
      join(fixturesDir, "roster-swimmers.cl2"),
      "utf8",
    );
    const files = [file("roster.cl2", rosterCl2, "cl2", 0)];
    const { primary, isRosterOnly } = selectPrimaryMeetFile(files);
    expect(isRosterOnly).toBe(true);
    expect(primary.filename).toBe("roster.cl2");
  });

  it("treats nested meet files as non-roster when top-level has meet content", () => {
    const entries = readFileSync(join(fixturesDir, "mari-entries.cl2"), "utf8");
    const roster = readFileSync(
      join(fixturesDir, "roster-swimmers.cl2"),
      "utf8",
    );
    const files = [
      file("entries.cl2", entries, "cl2", 0),
      file("nested/roster.cl2", roster, "cl2", 1),
    ];
    const { primary, isRosterOnly } = selectPrimaryMeetFile(files);
    expect(isRosterOnly).toBe(false);
    expect(primary.filename).toBe("entries.cl2");
  });
});

describe("extractAllMeetFilesFromZip extras", () => {
  it("deduplicates repeated files and unpacks nested zips", () => {
    const ev3 = readFileSync(join(fixturesDir, "sonoran-events.ev3"), "utf8");
    const inner = zipSync({ "inner.ev3": strToU8(ev3) });
    const outer = zipSync({
      "meet.ev3": strToU8(ev3),
      "dup.ev3": strToU8(ev3),
      "nested.zip": inner,
    });
    const bundle = extractAllMeetFilesFromZip(outer, { maxDepth: 2 });
    expect(bundle.files.length).toBe(3);
    expect(bundle.files.some((f) => f.filename === "inner.ev3")).toBe(true);
    expect(bundle.primary.format).toBe("ev3");
  });

  it("detects roster-only HY3 and SDIF top-level archives", () => {
    const hy3 = readFileSync(join(fixturesDir, "roster-only.hy3"), "utf8");
    const hy3Bundle = extractAllMeetFilesFromZip(
      zipSync({ "roster.hy3": strToU8(hy3) }),
    );
    expect(hy3Bundle.isRosterOnly).toBe(true);

    const sdifRoster = readFileSync(
      join(fixturesDir, "roster-swimmers.cl2"),
      "utf8",
    );
    const sdifBundle = extractAllMeetFilesFromZip(
      zipSync({ "roster.sd3": strToU8(sdifRoster) }),
    );
    expect(sdifBundle.isRosterOnly).toBe(true);
  });

  it("falls back to the full file list when the filtered meet pool is empty", () => {
    const roster = readFileSync(
      join(fixturesDir, "roster-swimmers.cl2"),
      "utf8",
    );
    const { primary } = selectPrimaryMeetFile([
      file("nested/roster.cl2", roster, "cl2", 1),
    ]);
    expect(primary.filename).toBe("nested/roster.cl2");
  });

  it("falls back to the first file when no ranked format matches", () => {
    const unknown = file(
      "notes.txt",
      "hello",
      "xls" as ExtractedMeetFile["format"],
    );
    const { primary } = selectPrimaryMeetFile([
      { ...unknown, format: "bogus" as ExtractedMeetFile["format"] },
    ]);
    expect(primary.filename).toBe("notes.txt");
  });

  it("skips duplicate extracted files with the same depth, format, and name", () => {
    const ev3 = readFileSync(join(fixturesDir, "sonoran-events.ev3"), "utf8");
    const bytes = zipSync({
      "meet.ev3": strToU8(ev3),
      "folder/meet.ev3": strToU8(ev3),
    });
    const bundle = extractAllMeetFilesFromZip(bytes);
    expect(bundle.files).toHaveLength(1);
  });

  it("does not unpack nested archives when maxDepth is zero", () => {
    const ev3 = readFileSync(join(fixturesDir, "sonoran-events.ev3"), "utf8");
    const inner = zipSync({ "inner.ev3": strToU8(ev3) });
    const outer = zipSync({ "nested.zip": inner });
    expect(() => extractAllMeetFilesFromZip(outer, { maxDepth: 0 })).toThrow(
      /doesn't contain a supported meet file/,
    );
  });
});

describe("mergeParsedMeets", () => {
  const primary: ParsedMeet = {
    name: "Primary",
    course: "SCY",
    events: [
      {
        eventNumber: 1,
        distance: 50,
        stroke: "free",
        gender: "female",
        eventKey: "e1",
      },
    ],
    entries: [
      {
        eventNumber: 1,
        swimmerName: "Ada Lovelace",
        seedTime: undefined,
      },
    ],
    results: [
      {
        eventNumber: 1,
        swimmerName: "Ada Lovelace",
        time: "28.00",
      },
    ],
    relays: [],
    importKind: "entries",
  };

  const supplement: ParsedMeet = {
    name: "Supplement",
    course: "SCY",
    startDate: "2025-01-01",
    endDate: "2025-01-02",
    location: "Away Pool",
    address: "123 Lane",
    entryDeadline: "2024-12-31",
    entryLimits: { maxIndividual: 3 },
    skippedDiveEvents: 2,
    events: [
      {
        eventNumber: 2,
        distance: 100,
        stroke: "back",
        gender: "male",
        eventKey: "e2",
      },
    ],
    entries: [
      {
        eventNumber: 1,
        swimmerName: "Ada Lovelace",
        usaMemberId: "USA123",
        seedTime: "29.00",
      },
      {
        eventNumber: 2,
        swimmerName: "Bob Smith",
        seedTime: "1:05.00",
      },
    ],
    results: [
      {
        eventNumber: 1,
        swimmerName: "Ada Lovelace",
        time: "27.50",
      },
      {
        eventNumber: 2,
        swimmerName: "Bob Smith",
        time: "1:04.00",
      },
    ],
    relays: [
      {
        eventNumber: 10,
        swimmerNames: ["A", "B", "C", "D"],
        seedTime: "1:40.00",
      },
    ],
    importKind: "results",
  };

  it("fills missing metadata, merges unique rows, and backfills duplicate entries", () => {
    const merged = mergeParsedMeets(primary, [supplement]);
    expect(merged.name).toBe("Primary");
    expect(merged.startDate).toBe("2025-01-01");
    expect(merged.endDate).toBe("2025-01-02");
    expect(merged.location).toBe("Away Pool");
    expect(merged.address).toBe("123 Lane");
    expect(merged.entryDeadline).toBe("2024-12-31");
    expect(merged.entryLimits).toEqual({ maxIndividual: 3 });
    expect(merged.skippedDiveEvents).toBe(2);
    expect(merged.events).toHaveLength(2);
    expect(merged.entries).toHaveLength(2);
    expect(merged.results).toHaveLength(2);
    expect(merged.relays).toHaveLength(1);
    expect(merged.importKind).toBe("results");

    const ada = merged.entries.find((e) => e.swimmerName === "Ada Lovelace");
    expect(ada).toMatchObject({
      usaMemberId: "USA123",
      seedTime: "29.00",
    });
  });

  it("orders merged events by event number", () => {
    const merged = mergeParsedMeets(
      {
        name: "Primary",
        course: "SCY",
        events: [
          {
            eventNumber: 22,
            distance: 400,
            stroke: "free_relay",
            gender: "female",
            eventKey: "e22",
          },
          {
            eventNumber: 3,
            distance: 200,
            stroke: "free",
            gender: "male",
            eventKey: "e3",
          },
        ],
        entries: [],
        results: [],
      },
      [
        {
          name: "Supplement",
          course: "SCY",
          events: [
            {
              eventNumber: 1,
              distance: 200,
              stroke: "medley_relay",
              gender: "male",
              eventKey: "e1",
            },
            {
              distance: 50,
              stroke: "free",
              gender: "mixed",
              eventKey: "z-open",
            },
            {
              distance: 100,
              stroke: "free",
              gender: "mixed",
              eventKey: "a-open",
            },
          ],
          entries: [],
          results: [],
        },
      ],
    );
    expect(merged.events.map((e) => e.eventNumber ?? e.eventKey)).toEqual([
      1,
      3,
      22,
      "a-open",
      "z-open",
    ]);
  });

  it("keeps primary importKind when supplement is only entries", () => {
    const merged = mergeParsedMeets({ ...primary, importKind: undefined }, [
      { ...supplement, importKind: "entries" },
    ]);
    expect(merged.importKind).toBe("entries");
  });

  it("skips metadata already present on the primary meet and appends relays", () => {
    const merged = mergeParsedMeets(
      {
        ...primary,
        endDate: "2025-06-01",
        entryLimits: { maxIndividual: 5 },
        skippedDiveEvents: 1,
        relays: [
          {
            eventNumber: 9,
            swimmerNames: ["One"],
            seedTime: "1:30.00",
          },
        ],
      },
      [supplement],
    );
    expect(merged.endDate).toBe("2025-06-01");
    expect(merged.entryLimits).toEqual({ maxIndividual: 5 });
    expect(merged.skippedDiveEvents).toBe(1);
    expect(merged.relays).toHaveLength(2);
  });

  it("starts with undefined relays when the primary meet has none", () => {
    const merged = mergeParsedMeets({ ...primary, relays: undefined }, [
      supplement,
    ]);
    expect(merged.relays).toHaveLength(1);
  });

  it("merges companion relays that omit event number, team, and letter", () => {
    const merged = mergeParsedMeets({ ...primary, relays: undefined }, [
      {
        ...supplement,
        relays: [{ swimmerNames: ["Pat Relay"] }],
      },
    ]);
    expect(merged.relays?.[0]?.swimmerNames).toEqual(["Pat Relay"]);
  });

  it("keeps primary relay legs when a companion file repeats the same team", () => {
    const merged = mergeParsedMeets(
      {
        ...primary,
        relays: [
          {
            eventNumber: 10,
            teamCode: "AZMARI",
            relayLetter: "A",
            swimmerNames: ["Orion Chaturvedi"],
          },
        ],
      },
      [
        {
          ...supplement,
          relays: [
            {
              eventNumber: 10,
              teamCode: "AZMARI",
              relayLetter: "A",
              swimmerNames: ["Orion MARIAChaturvedi"],
              seedTime: "1:40.00",
              results: [
                {
                  time: "1:39.50",
                  place: 1,
                  resultType: "finals",
                },
              ],
            },
          ],
        },
      ],
    );
    expect(merged.relays).toHaveLength(1);
    expect(merged.relays?.[0]).toMatchObject({
      swimmerNames: ["Orion Chaturvedi"],
      seedTime: "1:40.00",
      results: [{ time: "1:39.50", place: 1, resultType: "finals" }],
    });
  });

  it("treats HY3 MARI and CL2 AZMARI as the same relay team", () => {
    const merged = mergeParsedMeets(
      {
        ...primary,
        relays: [
          {
            eventNumber: 15,
            teamCode: "MARI",
            relayLetter: "A",
            swimmerNames: ["Bennett Munkirs"],
          },
        ],
      },
      [
        {
          ...supplement,
          relays: [
            {
              eventNumber: 15,
              teamCode: "AZMARI",
              relayLetter: "A",
              swimmerNames: ["Someone Else"],
            },
          ],
        },
      ],
    );
    expect(merged.relays).toHaveLength(1);
    expect(merged.relays?.[0]?.swimmerNames).toEqual(["Bennett Munkirs"]);
  });

  it("matches CL2 AZMARI onto an HY3 MARI relay when the LSC prefix is reversed", () => {
    const merged = mergeParsedMeets(
      {
        ...primary,
        relays: [
          {
            eventNumber: 15,
            teamCode: "AZMARI",
            relayLetter: "A",
            swimmerNames: ["Bennett Munkirs"],
          },
        ],
      },
      [
        {
          ...supplement,
          relays: [
            {
              eventNumber: 15,
              teamCode: "MARI",
              relayLetter: "A",
              swimmerNames: ["Someone Else"],
            },
          ],
        },
      ],
    );
    expect(merged.relays).toHaveLength(1);
    expect(merged.relays?.[0]?.swimmerNames).toEqual(["Bennett Munkirs"]);
  });

  it("does not merge a named relay team with a team-less companion row", () => {
    const merged = mergeParsedMeets(
      {
        ...primary,
        relays: [
          {
            eventNumber: 15,
            teamCode: "MARI",
            relayLetter: "A",
            swimmerNames: ["Bennett Munkirs"],
          },
        ],
      },
      [
        {
          ...supplement,
          relays: [
            {
              eventNumber: 15,
              relayLetter: "A",
              swimmerNames: ["Someone Else"],
            },
          ],
        },
      ],
    );
    expect(merged.relays).toHaveLength(2);
  });

  it("does not merge a team-less primary relay with a named companion team", () => {
    const merged = mergeParsedMeets(
      {
        ...primary,
        relays: [
          {
            eventNumber: 15,
            relayLetter: "A",
            swimmerNames: ["Bennett Munkirs"],
          },
        ],
      },
      [
        {
          ...supplement,
          relays: [
            {
              eventNumber: 15,
              teamCode: "MARI",
              relayLetter: "A",
              swimmerNames: ["Someone Else"],
            },
          ],
        },
      ],
    );
    expect(merged.relays).toHaveLength(2);
  });

  it("matches relays that omit event number and letter on the primary row", () => {
    const merged = mergeParsedMeets(
      {
        ...primary,
        relays: [
          {
            teamCode: "MARI",
            swimmerNames: ["Bennett Munkirs"],
          },
        ],
      },
      [
        {
          ...supplement,
          relays: [
            {
              teamCode: "AZMARI",
              swimmerNames: ["Someone Else"],
              seedTime: "2:00.00",
            },
          ],
        },
      ],
    );
    expect(merged.relays).toHaveLength(1);
    expect(merged.relays?.[0]?.swimmerNames).toEqual(["Bennett Munkirs"]);
    expect(merged.relays?.[0]?.seedTime).toBe("2:00.00");
  });

  it("fills empty primary relay legs from the companion file", () => {
    const merged = mergeParsedMeets(
      {
        ...primary,
        relays: [
          {
            eventNumber: 10,
            teamCode: "AZMARI",
            relayLetter: "A",
            swimmerNames: [],
          },
        ],
      },
      [
        {
          ...supplement,
          relays: [
            {
              eventNumber: 10,
              teamCode: "AZMARI",
              relayLetter: "A",
              swimmerNames: ["Orion Chaturvedi"],
            },
          ],
        },
      ],
    );
    expect(merged.relays?.[0]?.swimmerNames).toEqual(["Orion Chaturvedi"]);
  });

  it("indexes entries and results that omit an event number", () => {
    const merged = mergeParsedMeets(primary, [
      {
        ...supplement,
        entries: [{ swimmerName: "No Event Swimmer", seedTime: "30.00" }],
        results: [{ swimmerName: "No Event Swimmer", time: "29.00" }],
      },
    ]);
    expect(
      merged.entries.some((e) => e.swimmerName === "No Event Swimmer"),
    ).toBe(true);
    expect(
      merged.results.some((r) => r.swimmerName === "No Event Swimmer"),
    ).toBe(true);
  });

  it("merges meet-roster athletes, filling identity on name match", () => {
    const merged = mergeParsedMeets(
      {
        ...primary,
        athletes: [
          { name: "Relay Only", relayOnly: true },
          { name: "Known", usaMemberId: "ID1" },
        ],
      },
      [
        {
          ...supplement,
          athletes: [
            {
              name: "Relay Only",
              dateOfBirth: "2011-01-01",
              gender: "female",
              usaMemberId: "USA9",
            },
            { name: "New Athlete", relayOnly: true },
          ],
        },
      ],
    );
    expect(merged.athletes).toHaveLength(3);
    const relayOnly = merged.athletes?.find((a) => a.name === "Relay Only");
    expect(relayOnly).toMatchObject({
      usaMemberId: "USA9",
      dateOfBirth: "2011-01-01",
      gender: "female",
      relayOnly: true,
    });
    expect(merged.athletes?.some((a) => a.name === "New Athlete")).toBe(true);
  });

  it("starts an athlete list when the primary meet has none", () => {
    const merged = mergeParsedMeets({ ...primary, athletes: undefined }, [
      { ...supplement, athletes: [{ name: "Zip Only", relayOnly: true }] },
    ]);
    expect(merged.athletes).toEqual([{ name: "Zip Only", relayOnly: true }]);
  });
});
