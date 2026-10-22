import { describe, expect, it } from "vitest";
import {
  canStartStaffView,
  IMPERSONATION_LOCKED_MESSAGE,
  impersonationAuditEvent,
  impersonatorId,
  isBlockedWhileImpersonating,
  packImpersonatorCookie,
  supportViewer,
  unpackImpersonatorCookie,
} from "../src/impersonation";

describe("canStartStaffView", () => {
  it("allows a staff account to open a coach session", () => {
    expect(
      canStartStaffView({
        alreadyImpersonating: false,
        target: { id: "user-1" },
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a nested view and a missing coach", () => {
    expect(
      canStartStaffView({
        alreadyImpersonating: true,
        target: { id: "user-1" },
      }).status,
    ).toBe("BAD_REQUEST");
    expect(
      canStartStaffView({
        alreadyImpersonating: false,
        target: null,
      }).status,
    ).toBe("NOT_FOUND");
  });
});

describe("impersonation session helpers", () => {
  it("reads the support viewer from staff first, then a legacy coach id", () => {
    expect(supportViewer(null)).toBeNull();
    expect(supportViewer({})).toBeNull();
    expect(supportViewer({ impersonatedBy: "" })).toBeNull();
    expect(supportViewer({ impersonatedBy: 12 })).toBeNull();
    expect(supportViewer({ impersonatedByStaffId: "staff-1" })).toEqual({
      kind: "staff",
      id: "staff-1",
    });
    expect(
      supportViewer({
        impersonatedBy: "user-1",
        impersonatedByStaffId: "staff-1",
      })?.kind,
    ).toBe("staff");
    expect(supportViewer({ impersonatedBy: "user-1" })).toEqual({
      kind: "user",
      id: "user-1",
    });
    expect(impersonatorId(null)).toBeNull();
    expect(impersonatorId({ impersonatedBy: "user-1" })).toBe("user-1");
    expect(impersonatorId({ impersonatedByStaffId: "staff-1" })).toBeNull();
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
    expect(
      impersonationAuditEvent({
        action: "auth.impersonation.start",
        actorStaffId: "staff-1",
        targetUserId: "user-1",
        targetEmail: "coach@club.test",
      }),
    ).toMatchObject({ actorStaffId: "staff-1" });
  });
});
