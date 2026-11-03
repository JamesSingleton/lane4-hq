import { beforeEach, describe, expect, it, vi } from "vitest";

const headerValues = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => headerValues.get(name) ?? null,
  }),
}));

const { adminAuditContext } = await import("@/lib/audit-context");

describe("adminAuditContext", () => {
  beforeEach(() => headerValues.clear());

  it("prefers X-Real-IP and records the user agent and request id", async () => {
    headerValues.set("x-real-ip", "203.0.113.7");
    headerValues.set("x-forwarded-for", "198.51.100.1, 10.0.0.1");
    headerValues.set("user-agent", "Safari");
    headerValues.set("x-vercel-id", "iad1::abc");
    expect(await adminAuditContext()).toEqual({
      source: "admin",
      ipAddress: "203.0.113.7",
      userAgent: "Safari",
      requestId: "iad1::abc",
    });
  });

  it("falls back to the first forwarded hop, then nothing", async () => {
    headerValues.set("x-forwarded-for", "198.51.100.1, 10.0.0.1");
    expect((await adminAuditContext()).ipAddress).toBe("198.51.100.1");
    headerValues.clear();
    expect(await adminAuditContext()).toEqual({
      source: "admin",
      ipAddress: null,
      userAgent: null,
      requestId: null,
    });
  });
});
