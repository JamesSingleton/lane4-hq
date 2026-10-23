import { describe, expect, it } from "vitest";
import { hy3FileDate } from "../../src/export/meet";
import { exportRosterHy3 } from "../../src/roster/hy3-export";
import { parseHy3Roster } from "../../src/roster/hy3-style";

describe("exportRosterHy3", () => {
  const today = new Date(2026, 9, 23);

  it("writes a Meet Manager roster with Lane4 HQ software", () => {
    const text = exportRosterHy3(
      [
        {
          firstName: "Ada",
          lastName: "Lane",
          preferredName: "Addy",
          middleName: "Quinn",
          dateOfBirth: "2015-01-01",
          gender: "female",
          usaMemberId: "USS123",
          classYear: "FR",
          practiceGroup: "JV",
          contacts: {
            parentName: "Pat Lane",
            parentEmail: "pat@example.com",
            parentPhone: "555-0100",
            emergencyPhone: "555-0199",
            addressLine1: "1 Main",
            addressLine2: "Apt 2",
            city: "Kingwood",
            state: "tx",
            postalCode: "77339",
          },
        },
        {
          firstName: "Bo",
          lastName: "Young",
          dateOfBirth: "2015-12-31",
          gender: "M",
          classYear: "11",
          contacts: { parentName: "Sam" },
        },
        {
          firstName: "Cy",
          lastName: "Old",
          dateOfBirth: "2015-10-31",
          gender: "male",
        },
        {
          firstName: "Dee",
          lastName: "Early",
          dateOfBirth: "2015-10-01",
          gender: "female",
          contacts: { addressLine1: "9 Oak", country: "MX" },
        },
        {
          firstName: "Future",
          lastName: "Kid",
          dateOfBirth: "2099-01-01",
          gender: "female",
        },
        { firstName: "Skip", lastName: "NoDob", gender: "female" },
        { firstName: "Skip", lastName: "NoGender", dateOfBirth: "2015-01-01" },
        { firstName: "", lastName: "", dateOfBirth: "2015-01-01", gender: "F" },
      ],
      {
        name: "Bear Branch",
        code: "bb",
        lscCode: "gu",
        addressLine1: "2261 Northpark Dr",
        city: "Kingwood",
        region: "tx",
        postalCode: "77339",
        email: "coach@example.com",
        contactName: "Coach",
        country: "USA",
      },
      { today },
    );

    const lines = text.split("\r\n").filter(Boolean);
    expect(lines.every((line) => line.length === 130)).toBe(true);
    const a1 = lines[0]!;
    expect(a1.slice(2, 4)).toBe("03");
    expect(a1.slice(4, 16)).toBe("Rosters Only");
    expect(a1.slice(29, 44).trim()).toBe("Hy-Tek, Ltd");
    expect(a1.slice(44, 58).trim()).toBe("Lane4 HQ");
    expect(a1.slice(58, 66)).toBe(hy3FileDate());
    expect(a1).not.toContain("Swimtopia");
    expect(lines.some((line) => line.startsWith("C1"))).toBe(true);
    expect(lines.some((line) => line.startsWith("C2"))).toBe(true);
    expect(lines.some((line) => line.startsWith("C3"))).toBe(true);
    const d5 = lines.find((line) => line.startsWith("D5"))!;
    expect(d5.slice(72, 87)).toBe("X FFFFFFFFFFFFF");
    const df = lines.find((line) => line.startsWith("DF"))!;
    expect(df.slice(2, 7)).toBe("Quinn");
    expect(lines.filter((line) => line.startsWith("D1"))).toHaveLength(5);
    expect(lines.some((line) => line.startsWith("DE"))).toBe(true);

    const parsed = parseHy3Roster(text);
    const ada = parsed.find((row) => row.lastName === "Lane");
    expect(ada?.preferredName).toBe("Addy");
    expect(ada?.dateOfBirth).toBe("2015-01-01");
    expect(ada?.gender).toBe("female");
    expect(ada?.usaMemberId).toBe("USS123");
    expect(ada?.contacts?.parentName).toBe("Pat Lane");
    expect(ada?.contacts?.parentEmail).toBe("pat@example.com");
    expect(ada?.contacts?.parentPhone).toBe("555-0100");
    expect(ada?.contacts?.addressLine1).toBe("1 Main");
    expect(ada?.contacts?.city).toBe("Kingwood");
    expect(ada?.contacts?.state).toBe("TX");
  });

  it("omits team address lines when the club has no address or contact", () => {
    const text = exportRosterHy3(
      [
        {
          firstName: "Ada",
          lastName: "Lane",
          dateOfBirth: "2015-01-01",
          gender: "female",
        },
      ],
      { phone: "555-0100", city: "Town" },
    );
    const lines = text.split(/\r?\n/);
    expect(lines.some((line) => line.startsWith("C2"))).toBe(true);
    expect(lines.some((line) => line.startsWith("C3"))).toBe(true);
    expect(lines.find((line) => line.startsWith("C1"))?.slice(2, 6)).toBe(
      "TEAM",
    );
    expect(lines.find((line) => line.startsWith("DF"))?.slice(2, 4)).toBe("NA");
    expect(parseHy3Roster(text)).toHaveLength(1);
  });

  it("writes C2 from a region or postal code and skips an empty club", () => {
    const swimmer = {
      firstName: "Ada",
      lastName: "Lane",
      dateOfBirth: "2015-01-01",
      gender: "F",
    };
    const regionOnly = exportRosterHy3([swimmer], { region: "tx" }, { today });
    const regionC2 = regionOnly
      .split("\r\n")
      .find((line) => line.startsWith("C2"));
    expect(regionC2?.slice(92, 94)).toBe("TX");
    expect(regionOnly.includes("C3")).toBe(false);

    const postalOnly = exportRosterHy3(
      [swimmer],
      { postalCode: "77339" },
      { today },
    );
    expect(
      postalOnly
        .split("\r\n")
        .find((line) => line.startsWith("C2"))
        ?.slice(94, 104),
    ).toBe("77339".padEnd(10, " "));

    const empty = exportRosterHy3([swimmer], {}, { today });
    expect(empty.includes("C2")).toBe(false);
    expect(empty.includes("C3")).toBe(false);
  });
});
