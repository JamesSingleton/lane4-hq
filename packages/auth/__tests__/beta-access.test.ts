import { describe, expect, it } from "vitest";
import {
  INVITE_REQUIRED_CODE,
  isBetaOperator,
  isOpenInvite,
  normalizeSignupEmail,
  parseOperatorEmails,
  signupAllowed,
} from "../src/beta-access";

const future = new Date("2026-11-01T00:00:00Z");
const now = new Date("2026-10-21T00:00:00Z");
const past = new Date("2026-10-01T00:00:00Z");

describe("normalizeSignupEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeSignupEmail("  Coach@Example.com ")).toBe(
      "coach@example.com",
    );
  });
});

describe("isOpenInvite", () => {
  it("accepts a pending invite that has not expired", () => {
    expect(isOpenInvite({ status: "pending", expiresAt: future }, now)).toBe(
      true,
    );
    expect(
      isOpenInvite({
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toBe(true);
  });

  it("rejects missing, closed, and expired invites", () => {
    expect(isOpenInvite(null, now)).toBe(false);
    expect(isOpenInvite(undefined, now)).toBe(false);
    expect(isOpenInvite({ status: "accepted", expiresAt: future }, now)).toBe(
      false,
    );
    expect(isOpenInvite({ status: "revoked", expiresAt: future }, now)).toBe(
      false,
    );
    expect(isOpenInvite({ status: "pending", expiresAt: now }, now)).toBe(
      false,
    );
    expect(isOpenInvite({ status: "pending", expiresAt: past }, now)).toBe(
      false,
    );
  });
});

describe("signupAllowed", () => {
  it("allows either an open beta invite or an open team invite", () => {
    const open = { status: "pending", expiresAt: future };
    const closed = { status: "accepted", expiresAt: future };
    expect(signupAllowed({ beta: open, team: null, now })).toBe(true);
    expect(signupAllowed({ beta: null, team: open, now })).toBe(true);
    expect(signupAllowed({ beta: closed, team: null, now })).toBe(false);
    expect(signupAllowed({ beta: null, team: null, now })).toBe(false);
    expect(signupAllowed({ beta: open, team: null })).toBe(true);
  });
});

describe("parseOperatorEmails", () => {
  it("returns an empty set when unset or blank", () => {
    expect(parseOperatorEmails(undefined).size).toBe(0);
    expect(parseOperatorEmails("").size).toBe(0);
    expect(parseOperatorEmails(" , ").size).toBe(0);
  });

  it("normalizes a comma-separated list", () => {
    const operators = parseOperatorEmails(" A@B.com, , c@d.com ");
    expect(operators.has("a@b.com")).toBe(true);
    expect(operators.has("c@d.com")).toBe(true);
    expect(operators.size).toBe(2);
  });
});

describe("isBetaOperator", () => {
  it("matches operator emails case-insensitively", () => {
    const operators = parseOperatorEmails("coach@example.com");
    expect(isBetaOperator(" Coach@Example.com ", operators)).toBe(true);
    expect(isBetaOperator("other@example.com", operators)).toBe(false);
  });
});

describe("invite error code", () => {
  it("stays stable for the sign-in redirect", () => {
    expect(INVITE_REQUIRED_CODE).toBe("INVITE_REQUIRED");
  });
});
