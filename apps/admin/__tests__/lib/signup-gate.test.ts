import { describe, expect, it } from "vitest";
import { resolveSignupGate } from "@/lib/signup-gate";

describe("resolveSignupGate", () => {
  it("allows a matching beta token", () => {
    expect(
      resolveSignupGate({
        inviteToken: "token",
        betaInvite: { email: "coach@example.com" },
        callbackUrl: "/onboarding",
        teamInvite: null,
      }),
    ).toEqual({
      status: "allowed",
      email: "coach@example.com",
      source: "beta",
    });
  });

  it("rejects a beta token that does not match an open invite", () => {
    expect(
      resolveSignupGate({
        inviteToken: "missing",
        betaInvite: null,
        callbackUrl: "/onboarding",
        teamInvite: null,
      }),
    ).toEqual({ status: "denied", reason: "invalid" });
  });

  it("allows the team invitation on the accept-invite callback", () => {
    expect(
      resolveSignupGate({
        inviteToken: null,
        betaInvite: null,
        callbackUrl: "/accept-invite?id=inv_1",
        teamInvite: { email: "assistant@example.com" },
      }),
    ).toEqual({
      status: "allowed",
      email: "assistant@example.com",
      source: "team",
    });
  });

  it("rejects an accept-invite callback with no open invitation", () => {
    expect(
      resolveSignupGate({
        inviteToken: "  ",
        betaInvite: null,
        callbackUrl: "/accept-invite?id=inv_1",
        teamInvite: null,
      }),
    ).toEqual({ status: "denied", reason: "invalid" });
  });

  it("closes sign-up when there is no invite", () => {
    expect(
      resolveSignupGate({
        inviteToken: null,
        betaInvite: null,
        callbackUrl: "/onboarding",
        teamInvite: null,
      }),
    ).toEqual({ status: "denied", reason: "missing" });
  });
});
