import { describe, expect, it } from "vitest";
import {
  authAuditContext,
  authAuditEvent,
  isAuditedAuthPath,
} from "../src/audit-events";

describe("auth audit events", () => {
  it("audits device approvals against the user code, with no team", () => {
    expect(
      authAuditEvent({
        path: "/device/approve",
        userId: "u1",
        body: { userCode: "ABCD-EFGH" },
      }),
    ).toEqual({
      organizationId: null,
      actorUserId: "u1",
      action: "auth.device.approve",
      resourceType: "device_code",
      resourceId: "ABCD-EFGH",
    });
    expect(
      authAuditEvent({ path: "/device/deny", userId: "u1", body: null })
        ?.resourceId,
    ).toBe("unknown");
  });

  it("logs revocations against the user, never the token", () => {
    const event = authAuditEvent({
      path: "/revoke-session",
      userId: "u1",
      body: { token: "secret-session-token" },
    });
    expect(event).toMatchObject({
      action: "auth.session.revoke",
      resourceType: "user",
      resourceId: "u1",
    });
    expect(JSON.stringify(event)).not.toContain("secret-session-token");
  });

  it("ignores other paths and anonymous calls", () => {
    expect(isAuditedAuthPath("/sign-in/email")).toBe(false);
    expect(isAuditedAuthPath("/revoke-other-sessions")).toBe(true);
    expect(
      authAuditEvent({ path: "/sign-in/email", userId: "u1", body: {} }),
    ).toBeNull();
    expect(
      authAuditEvent({ path: "/revoke-sessions", userId: undefined, body: {} }),
    ).toBeNull();
  });

  it("reads the client from proxy headers", () => {
    expect(
      authAuditContext(
        new Headers({
          "x-forwarded-for": "203.0.113.9, 10.0.0.1",
          "user-agent": "Lane4Desktop/0.1",
        }),
      ),
    ).toEqual({
      source: "auth",
      ipAddress: "203.0.113.9",
      userAgent: "Lane4Desktop/0.1",
      requestId: null,
    });
    expect(authAuditContext(undefined).ipAddress).toBeNull();
  });
});
