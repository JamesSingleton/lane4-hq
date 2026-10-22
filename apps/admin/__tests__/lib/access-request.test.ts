import { describe, expect, it } from "vitest";
import { parseAccessRequest } from "@/lib/access-request";

const valid = {
  name: "  Ada Lovelace ",
  email: "Ada@Example.com",
  team: "  Example High School ",
  reason: "We retype seed times the night before every dual.",
};

describe("parseAccessRequest", () => {
  it("trims fields and lowercases the email", () => {
    expect(parseAccessRequest(valid)).toEqual({
      ok: true,
      honeypot: false,
      value: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        team: "Example High School",
        reason: "We retype seed times the night before every dual.",
      },
    });
  });

  it("accepts a reason of 20 characters", () => {
    const result = parseAccessRequest({
      ...valid,
      reason: "12345678901234567890",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a short reason, a short name, and a bad email", () => {
    expect(parseAccessRequest({ ...valid, reason: "Too short." }).ok).toBe(
      false,
    );
    expect(parseAccessRequest({ ...valid, name: "A" }).ok).toBe(false);
    expect(parseAccessRequest({ ...valid, email: "not-an-email" }).ok).toBe(
      false,
    );
    expect(parseAccessRequest({ ...valid, team: "X" }).ok).toBe(false);
  });

  it("rejects fields that are too long", () => {
    expect(parseAccessRequest({ ...valid, name: "A".repeat(81) }).ok).toBe(
      false,
    );
    expect(parseAccessRequest({ ...valid, team: "T".repeat(121) }).ok).toBe(
      false,
    );
    expect(parseAccessRequest({ ...valid, reason: "R".repeat(2001) }).ok).toBe(
      false,
    );
  });

  it("pretends a filled honeypot succeeded", () => {
    expect(
      parseAccessRequest({ ...valid, name: "", website: "https://spam.test" }),
    ).toEqual({ ok: true, honeypot: true });
  });

  it("ignores a blank honeypot", () => {
    const result = parseAccessRequest({ ...valid, website: "   " });
    expect(result).toMatchObject({ ok: true, honeypot: false });
  });
});
