import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseHy3Roster,
  parseHy3StyleRoster,
} from "../../src/roster/hy3-style";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

describe("parseHy3Roster", () => {
  it("parses roster-only.hy3 fixture", () => {
    const content = readFileSync(join(fixturesDir, "roster-only.hy3"), "utf8");
    const rows = parseHy3Roster(content);
    expect(rows.length).toBeGreaterThan(10);
    const marlie = rows.find((r) => r.lastName === "McNamee");
    expect(marlie).toMatchObject({
      firstName: "Marlie",
      gender: "female",
      classYear: "JR",
    });
    expect(marlie?.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("parses male and female D1 lines with class year variants", () => {
    const content = [
      "A103Rosters Only             Hy-Tek, Ltd    Win-TM 8.0De  03212026 12:06 PM",
      "D1M   21Smith               John                                                                  0FR                           77",
      "D1F   27Doe                 Jane                                                                  0SO                           09",
    ].join("\n");

    const rows = parseHy3Roster(content);
    expect(rows.find((r) => r.lastName === "Smith")).toMatchObject({
      gender: "male",
      classYear: "FR",
    });
    expect(rows.find((r) => r.lastName === "Doe")).toMatchObject({
      gender: "female",
      classYear: "SO",
    });
  });

  it("skips blank D1 name lines", () => {
    const content =
      "D1M                                                                                                    77\n";
    expect(parseHy3Roster(content)).toEqual([]);
  });

  it("skips hy3-style D1 rows without class year (no DOB to merge)", () => {
    const content = [
      "A103Rosters Only             Hy-Tek",
      "D1M    9NoClass             Pat                                                                                                   98",
    ].join("\n");
    // parseHy3D1Line yields no dateOfBirth without class year; mergeSwimmer requires DOB.
    expect(parseHy3Roster(content)).toEqual([]);
  });

  it("reads SwimTopia birth dates, ids, and parent records", () => {
    function at(value: string, width: number): string {
      return value.slice(0, width).padEnd(width, " ");
    }
    function put(line: string, column: number, value: string): string {
      const chars = line.padEnd(column + value.length, " ").split("");
      for (let i = 0; i < value.length; i++) chars[column - 1 + i] = value[i]!;
      return chars.join("");
    }
    const emily = put(
      put(
        put(
          `D1F${at("395", 5)}${at("Alder", 20)}${at("Emily", 20)}${"".padEnd(20, " ")}M${at("0123456789ABCD", 14)}`,
          89,
          "01222015",
        ),
        100,
        "FR",
      ),
      1,
      "D1",
    );
    const address = `D2${at("3554 Maple Park Dr.", 30)}${at("Apt 2", 30)}${at("Kingwood", 30)}TX${at("77339", 10)}USA`;
    const admin = `D3${"".padEnd(30, " ")}${"n/a".padEnd(20, " ")}${"956-337-1962".padEnd(20, " ")}${"".padEnd(20, " ")}`;
    const parents = `DB${at("Alder", 20)}${at("Kristina", 20)}`;
    const parentPhones = `DD${at("NA", 20)}${"".padEnd(20, " ")}${at("281-912-4584", 20)}`;
    const parentEmail = `DE${at("sherrie@example.com", 36)}`;
    const henry = put(
      `D1M${at("456", 5)}${at("Barrett", 20)}${at("Henry", 20)}${at("Harry", 20)}D`,
      89,
      "01182019",
    );
    const otherParents = `DB${"".padEnd(60, " ")}${at("Barrett", 20)}${at("Renee", 20)}`;

    const rows = parseHy3Roster(
      [
        "D2ignored before a swimmer",
        emily,
        address,
        admin,
        parents,
        parentPhones,
        parentEmail,
        "D7later@example.com",
        henry,
        "D2",
        otherParents,
        "D7harry.parent@example.com",
        put(
          `D1F${at("1", 5)}${at("NoPhone", 20)}${at("Ada", 20)}`,
          89,
          "03032016",
        ),
        "DBAda",
        "D3",
        "DD",
      ].join("\n"),
    );

    expect(rows.find((row) => row.lastName === "Alder")).toMatchObject({
      firstName: "Emily",
      gender: "female",
      dateOfBirth: "2015-01-22",
      classYear: "FR",
      middleName: "M",
      usaMemberId: "0123456789ABCD",
      contacts: {
        parentName: "Kristina Alder",
        parentEmail: "sherrie@example.com",
        parentPhone: "281-912-4584",
        addressLine1: "3554 Maple Park Dr.",
        addressLine2: "Apt 2",
        city: "Kingwood",
        state: "TX",
        postalCode: "77339",
        country: "USA",
      },
    });
    expect(rows.find((row) => row.lastName === "Barrett")).toMatchObject({
      firstName: "Henry",
      preferredName: "Harry",
      middleName: "D",
      dateOfBirth: "2019-01-18",
      gender: "male",
      contacts: {
        parentName: "Renee Barrett",
        parentEmail: "harry.parent@example.com",
      },
    });
  });

  it("exports deprecated alias parseHy3StyleRoster", () => {
    expect(parseHy3StyleRoster).toBe(parseHy3Roster);
  });

  it("covers non-MF D1 lines and first/last name fallbacks", () => {
    expect(parseHy3Roster("D1X   21NotParsed          Name")).toEqual([]);

    // D1 layout: last at 8-28, first at 28-48.
    const lastOnlyLine =
      "D1M   21" +
      "OnlyLast".padEnd(20, " ") +
      "".padEnd(20, " ") +
      " ".repeat(40) +
      "0JR";
    expect(parseHy3Roster(`A103Rosters Only\n${lastOnlyLine}`)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          firstName: "Unknown",
          lastName: "OnlyLast",
          classYear: "JR",
        }),
      ]),
    );

    const firstOnlyLine =
      "D1F   27" +
      "".padEnd(20, " ") +
      "OnlyFirst".padEnd(20, " ") +
      " ".repeat(40) +
      "0SR";
    expect(parseHy3Roster(`A103Rosters Only\n${firstOnlyLine}`)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          firstName: "OnlyFirst",
          lastName: "Swimmer",
          classYear: "SR",
        }),
      ]),
    );
  });
});
