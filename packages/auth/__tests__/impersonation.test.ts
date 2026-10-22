import { describe, expect, it } from "vitest";
import {
  canStartImpersonation,
  IMPERSONATION_FORBIDDEN_MESSAGE,
  IMPERSONATION_LOCKED_MESSAGE,
  IMPERSONATION_OPERATOR_MESSAGE,
  impersonationAuditEvent,
  impersonatorId,
  isBlockedWhileImpersonating,
  packImpersonatorCookie,
  unpackImpersonatorCookie,
} from "../src/impersonation";

const operators = new Set(["ops@lane4.test"]);

describe("canStartImpersonation", () => {
  const target = { id: "user-1", email: "coach@club.test" };

  it("allows an operator to open another coach's session", () => {
    expect(
      canStartImpersonation({
        actorId: "ops-1",
        actorEmail: " Ops@Lane4.test ",
        operators,
        alreadyImpersonating: false,
        target,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects everyone who is not an operator", () => {
    expect(
      canStartImpersonation({
        actorId: "user-1",
        actorEmail: "coach@club.test",
        operators,
        alreadyImpersonating: false,
        target: { id: "user-2", email: "other@club.test" },
      }),
    ).toEqual({
      ok: false,
      status: "FORBIDDEN",
      message: IMPERSONATION_FORBIDDEN_MESSAGE,
    });
    expect(
      canStartImpersonation({
        actorId: "ops-1",
        actorEmail: "ops@lane4.test",
        operators: new Set(),
        alreadyImpersonating: false,
        target,
      }).ok,
    ).toBe(false);
  });

  it("rejects nested impersonation, missing users, self, and other operators", () => {
    expect(
      canStartImpersonation({
        actorId: "ops-1",
        actorEmail: "ops@lane4.test",
        operators,
        alreadyImpersonating: true,
        target,
      }).status,
    ).toBe("BAD_REQUEST");
    expect(
      canStartImpersonation({
        actorId: "ops-1",
        actorEmail: "ops@lane4.test",
        operators,
        alreadyImpersonating: false,
        target: null,
      }).status,
    ).toBe("NOT_FOUND");
    expect(
      canStartImpersonation({
        actorId: "ops-1",
        actorEmail: "ops@lane4.test",
        operators,
        alreadyImpersonating: false,
        target: { id: "ops-1", email: "coach@club.test" },
      }).message,
    ).toMatch(/already signed in/);
    expect(
      canStartImpersonation({
        actorId: "ops-1",
        actorEmail: "ops@lane4.test",
        operators,
        alreadyImpersonating: false,
        target: { id: "ops-2", email: "OPS@lane4.test" },
      }),
    ).toEqual({
      ok: false,
      status: "FORBIDDEN",
      message: IMPERSONATION_OPERATOR_MESSAGE,
    });
  });
});

describe("impersonation session helpers", () => {
  it("reads the operator id only from a non-empty string", () => {
    expect(impersonatorId(null)).toBeNull();
    expect(impersonatorId({})).toBeNull();
    expect(impersonatorId({ impersonatedBy: "" })).toBeNull();
    expect(impersonatorId({ impersonatedBy: 12 })).toBeNull();
    expect(impersonatorId({ impersonatedBy: "ops-1" })).toBe("ops-1");
  });

  it("blocks account security, devices, and billing while viewing as a user", () => {
    expect(isBlockedWhileImpersonating("/change-password")).toBe(true);
    expect(isBlockedWhileImpersonating("/two-factor/disable")).toBe(true);
    expect(isBlockedWhileImpersonating("/device/approve")).toBe(true);
    expect(isBlockedWhileImpersonating("/checkout")).toBe(true);
    expect(isBlockedWhileImpersonating("/customer/portal")).toBe(true);
    expect(isBlockedWhileImpersonating("/revoke-sessions")).toBe(true);
    expect(isBlockedWhileImpersonating("/get-session")).toBe(false);
    expect(isBlockedWhileImpersonating("/sign-out")).toBe(false);
    expect(IMPERSONATION_LOCKED_MESSAGE).toMatch(/Stop impersonating/);
  });

  it("round-trips the operator session cookie without keeping the token in the audit event", () => {
    const packed = packImpersonatorCookie("operator-session", "");
    expect(unpackImpersonatorCookie(packed)).toEqual({
      sessionToken: "operator-session",
      remember: "",
    });
    expect(unpackImpersonatorCookie("operator-session:true")).toBeNull();
    expect(unpackImpersonatorCookie("")).toBeNull();
    expect(unpackImpersonatorCookie("\u001fremember")).toBeNull();

    const event = impersonationAuditEvent({
      action: "auth.impersonation.start",
      actorUserId: "ops-1",
      targetUserId: "user-1",
      targetEmail: "coach@club.test",
    });
    expect(event).toEqual({
      organizationId: null,
      actorUserId: "ops-1",
      action: "auth.impersonation.start",
      resourceType: "user",
      resourceId: "user-1",
      metadata: { targetEmail: "coach@club.test" },
    });
    expect(JSON.stringify(event)).not.toContain("operator-session");
    expect(
      impersonationAuditEvent({
        action: "auth.impersonation.stop",
        actorUserId: "ops-1",
        targetUserId: "user-1",
        targetEmail: "coach@club.test",
      }).action,
    ).toBe("auth.impersonation.stop");
  });
});
