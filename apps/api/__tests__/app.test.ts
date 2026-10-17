import { beforeEach, describe, expect, it, vi } from "vitest";
import { samplePublication, testLogger } from "./fixtures";

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(
      message: string,
      public status = 401,
    ) {
      super(message);
    }
  }
  return {
    AuthError,
    getSession: vi.fn(),
    handler: vi.fn(),
    requireTeamRole: vi.fn(),
    getUserTeams: vi.fn(),
    recordHeatPublication: vi.fn(),
    getHostedMeet: vi.fn(),
    getHostedMeetsForOrganization: vi.fn(),
    getPublishedHeats: vi.fn(),
    getMeets: vi.fn(),
    getMeetById: vi.fn(),
    getMeetEvents: vi.fn(),
  };
});

vi.mock("@lane4hq/auth/server", () => ({
  auth: { api: { getSession: mocks.getSession }, handler: mocks.handler },
}));
vi.mock("@lane4hq/db/authz", () => ({
  AuthError: mocks.AuthError,
  MEET_HOSTING_ROLES: ["owner", "head_coach", "assistant_coach"],
  requireTeamRole: mocks.requireTeamRole,
  getUserTeams: mocks.getUserTeams,
}));
vi.mock("@lane4hq/db/queries/hosted-meets", () => ({
  recordHeatPublication: mocks.recordHeatPublication,
  getHostedMeet: mocks.getHostedMeet,
  getHostedMeetsForOrganization: mocks.getHostedMeetsForOrganization,
  getPublishedHeats: mocks.getPublishedHeats,
}));
vi.mock("@lane4hq/db/queries/meets", () => ({
  getMeets: mocks.getMeets,
  getMeetById: mocks.getMeetById,
  getMeetEvents: mocks.getMeetEvents,
}));

const { createApp } = await import("../src/app");

const logger = testLogger();
const pingDatabase = vi.fn();
const app = createApp({
  allowedOrigins: ["https://admin.lane4hq.com"],
  logger,
  readiness: { database: pingDatabase },
});

const USER = { id: "u1", name: "Coach", email: "coach@example.com" };
const signedIn = { Authorization: "Bearer token" };

function json(body: unknown, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...signedIn, ...headers },
    body: JSON.stringify(body),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: USER, session: {} });
  mocks.requireTeamRole.mockResolvedValue({ role: "head_coach" });
});

describe("service routes", () => {
  it("answers health checks and the root", async () => {
    expect(await (await app.request("/health")).json()).toEqual({
      status: "ok",
    });
    const root = await app.request("/", { method: "HEAD" });
    expect(root.status).toBe(200);
  });

  it("returns JSON for unknown paths", async () => {
    const res = await app.request("/v1/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "not_found", message: "No such endpoint." },
    });
  });

  it("doesn't reveal which /v1 paths exist before sign-in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await app.request("/v1/nope")).status).toBe(401);
  });

  it("publishes an OpenAPI 3.1 document and docs", async () => {
    const doc = await (await app.request("/openapi.json")).json();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/v1/me",
        "/v1/teams/{teamId}/meets",
        "/v1/teams/{teamId}/meets/{meetId}/program",
        "/v1/teams/{teamId}/hosted-meets",
        "/v1/teams/{teamId}/hosted-meets/{meetId}/heats",
        "/v1/hosted-meets/{meetId}/results",
      ]),
    );
    const docs = await app.request("/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
  });

  it("hands /api/auth to Better Auth", async () => {
    mocks.handler.mockResolvedValue(new Response("ok"));
    const res = await app.request("/api/auth/device/code", { method: "POST" });
    expect(await res.text()).toBe("ok");
    expect(mocks.handler).toHaveBeenCalledOnce();
  });

  it("allows configured browser origins only", async () => {
    const preflight = (origin: string) =>
      app.request("/v1/me", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "GET",
        },
      });
    const ok = await preflight("https://admin.lane4hq.com");
    expect(ok.headers.get("access-control-allow-origin")).toBe(
      "https://admin.lane4hq.com",
    );
    const other = await preflight("https://evil.example");
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("hides unexpected errors", async () => {
    mocks.getUserTeams.mockRejectedValue(new Error("db down"));
    const res = await app.request("/v1/me", { headers: signedIn });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "internal", message: "Something went wrong." },
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0]?.[1]).toMatchObject({
      path: "/v1/me",
      requestId: expect.any(String),
    });
  });

  it("is ready only when the database answers", async () => {
    pingDatabase.mockResolvedValue(undefined);
    const ok = await app.request("/health/ready");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      status: "ok",
      checks: { database: "ok" },
    });

    pingDatabase.mockRejectedValue(new Error("password=secret"));
    const down = await app.request("/health/ready");
    expect(down.status).toBe(503);
    const body = await down.json();
    expect(body).toEqual({
      status: "unavailable",
      checks: { database: "failed" },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(logger.error).toHaveBeenCalledWith(
      "readiness check failed",
      expect.objectContaining({ check: "database" }),
    );
  });

  it("logs one line per request, with the user once signed in", async () => {
    mocks.getUserTeams.mockResolvedValue([]);
    await app.request("/v1/me", { headers: signedIn });
    expect(logger.info).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({
        method: "GET",
        path: "/v1/me",
        status: 200,
        userId: "u1",
      }),
    );
    logger.info.mockClear();
    await app.request("/health");
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("requires sign-in for every team route", async () => {
    mocks.getSession.mockResolvedValue(null);
    for (const path of [
      "/v1/teams/t1/meets",
      "/v1/teams/t1/meets/m1/program",
      "/v1/teams/t1/hosted-meets",
      "/v1/teams/t1/anything-new",
    ]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(401);
    }
  });
});

describe("GET /v1/me", () => {
  it("needs a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await app.request("/v1/me");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  it("lists teams and which can host meets", async () => {
    mocks.getUserTeams.mockResolvedValue([
      { id: "t1", name: "Mesa", slug: "mesa", role: "head_coach" },
      { id: "t2", name: "Gilbert", slug: null, role: "member" },
    ]);
    const res = await app.request("/v1/me", { headers: signedIn });
    expect(await res.json()).toEqual({
      user: USER,
      teams: [
        {
          id: "t1",
          name: "Mesa",
          slug: "mesa",
          role: "head_coach",
          canHostMeets: true,
        },
        {
          id: "t2",
          name: "Gilbert",
          slug: null,
          role: "member",
          canHostMeets: false,
        },
      ],
    });
  });
});

describe("POST /v1/teams/{teamId}/hosted-meets/{meetId}/heats", () => {
  const pub = samplePublication();
  const url = `/v1/teams/t1/hosted-meets/${pub.meet.id}/heats`;
  const key = { "Idempotency-Key": pub.idempotencyKey };

  it("stores the first revision as created", async () => {
    mocks.recordHeatPublication.mockResolvedValue("created");
    const res = await app.request(url, json(pub, key));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "created" });
    expect(mocks.requireTeamRole).toHaveBeenCalledWith("u1", "t1", [
      "owner",
      "head_coach",
      "assistant_coach",
    ]);
    const call = mocks.recordHeatPublication.mock.calls[0]![0];
    expect(call).toMatchObject({
      organizationId: "t1",
      userId: "u1",
      heat: { eventNumber: 1, round: "timed_final", heat: 1, revision: 1 },
    });
    expect(call.heat.verifiedAt).toBeInstanceOf(Date);
  });

  it("passes who and where to the audit log", async () => {
    mocks.recordHeatPublication.mockResolvedValue("created");
    const res = await app.request(
      url,
      json(pub, {
        ...key,
        "User-Agent": "Lane4Desktop/0.1",
        "X-Real-IP": "203.0.113.9",
        "X-Request-Id": "req-123",
      }),
    );
    expect(res.headers.get("X-Request-Id")).toBe("req-123");
    expect(mocks.recordHeatPublication.mock.calls[0]![0].audit).toEqual({
      source: "api",
      ipAddress: "203.0.113.9",
      userAgent: "Lane4Desktop/0.1",
      requestId: "req-123",
    });

    await app.request(url, json(pub, key));
    expect(mocks.recordHeatPublication.mock.calls[1]![0].audit).toMatchObject({
      ipAddress: null,
      requestId: expect.any(String),
    });
  });

  it("answers retries and corrections with 200", async () => {
    for (const status of ["updated", "duplicate"] as const) {
      mocks.recordHeatPublication.mockResolvedValue(status);
      const res = await app.request(url, json(pub));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status });
    }
  });

  it("rejects an older revision with 409", async () => {
    mocks.recordHeatPublication.mockResolvedValue("stale");
    const res = await app.request(url, json(pub, key));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("stale_revision");
  });

  it("won't let a second team publish the same meet", async () => {
    mocks.recordHeatPublication.mockResolvedValue("meet_taken");
    const res = await app.request(url, json(pub, key));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("meet_taken");
  });

  it("checks the URL and header against the body", async () => {
    const wrongMeet = await app.request(
      "/v1/teams/t1/hosted-meets/other/heats",
      json(pub),
    );
    expect((await wrongMeet.json()).error.code).toBe("meet_mismatch");
    const wrongKey = await app.request(
      url,
      json(pub, { "Idempotency-Key": "x" }),
    );
    expect(wrongKey.status).toBe(400);
    expect((await wrongKey.json()).error.code).toBe("idempotency_key_mismatch");
    expect(mocks.recordHeatPublication).not.toHaveBeenCalled();
  });

  it("validates the publication", async () => {
    const res = await app.request(
      url,
      json({ ...pub, schema: "other", heat: 0 }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain("schema");
  });

  it("maps team permission errors", async () => {
    mocks.requireTeamRole.mockRejectedValue(
      new mocks.AuthError("Not a coach", 403),
    );
    const forbidden = await app.request(url, json(pub));
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).error).toEqual({
      code: "forbidden",
      message: "Not a coach",
    });
    mocks.requireTeamRole.mockRejectedValue(new mocks.AuthError("Who?"));
    expect((await app.request(url, json(pub))).status).toBe(401);
  });
});

describe("hosted meets and live results", () => {
  const meetRow = {
    id: "meet-1",
    name: "Desert Duals",
    startDate: "2026-10-25",
    course: "SCY",
    location: null,
    lastPublishedAt: new Date("2026-10-25T17:00:00Z"),
  };

  it("lists a team's hosted meets", async () => {
    mocks.getHostedMeetsForOrganization.mockResolvedValue([
      meetRow,
      { ...meetRow, id: "m2", lastPublishedAt: null },
    ]);
    const res = await app.request("/v1/teams/t1/hosted-meets", {
      headers: signedIn,
    });
    const { meets } = await res.json();
    expect(
      meets.map((m: { lastPublishedAt: string | null }) => m.lastPublishedAt),
    ).toEqual(["2026-10-25T17:00:00.000Z", null]);
  });

  it("returns 404 before anything is published", async () => {
    mocks.getHostedMeet.mockResolvedValue(undefined);
    const res = await app.request("/v1/hosted-meets/meet-1/results");
    expect(res.status).toBe(404);
  });

  it("serves results publicly without birthdays or member ids", async () => {
    const pub = samplePublication();
    mocks.getSession.mockResolvedValue(null);
    mocks.getHostedMeet.mockResolvedValue(meetRow);
    mocks.getPublishedHeats.mockResolvedValue([
      {
        event: pub.event,
        heat: 1,
        revision: 1,
        verifiedAt: new Date(pub.verifiedAt),
        lanes: [
          ...pub.lanes,
          {
            lane: 6,
            teamCode: "AAA",
            relay: {
              letter: "A",
              legs: [
                { firstName: "A", lastName: "B", dateOfBirth: "2010-01-01" },
              ],
            },
            status: "ok",
            timeMs: 1000,
            splitsMs: [],
            place: 1,
            exhibition: false,
            dive: { dives: [], total: 250.5 },
          },
        ],
      },
    ]);
    const res = await app.request("/v1/hosted-meets/meet-1/results");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("dateOfBirth");
    expect(text).not.toContain("usaMemberId");
    const { heats } = JSON.parse(text);
    const lanes = heats[0].lanes;
    expect(lanes[0].athlete).toEqual(
      pub.lanes[0]!.athlete && {
        firstName: pub.lanes[0]!.athlete.firstName,
        lastName: pub.lanes[0]!.athlete.lastName,
      },
    );
    expect(lanes.find((l: { dqCode?: string }) => l.dqCode)?.status).toBe("dq");
    expect(lanes.at(-1)).toMatchObject({
      relay: { letter: "A", legs: [{ firstName: "A", lastName: "B" }] },
      diveTotal: 250.5,
    });
  });
});

describe("downloading a meet", () => {
  const meetRow = {
    id: "m1",
    name: "Invite",
    startDate: new Date("2026-11-07T00:00:00Z"),
    endDate: null,
    course: "SCY",
    location: "Tempe",
  };

  it("lists the team's meets", async () => {
    mocks.getMeets.mockResolvedValue([meetRow]);
    const res = await app.request("/v1/teams/t1/meets", { headers: signedIn });
    expect(await res.json()).toEqual({
      meets: [
        {
          id: "m1",
          name: "Invite",
          startDate: "2026-11-07",
          endDate: null,
          course: "SCY",
          location: "Tempe",
        },
      ],
    });
  });

  it("returns numbered events in order", async () => {
    mocks.getMeetById.mockResolvedValue(meetRow);
    mocks.getMeetEvents.mockResolvedValue([
      {
        eventNumber: 3,
        distance: 1,
        stroke: "free",
        gender: "female",
        ageGroup: null,
        eventKind: "dive",
        diveCount: 6,
      },
      {
        eventNumber: null,
        distance: 100,
        stroke: "back",
        gender: "male",
        ageGroup: null,
        eventKind: "swim",
        diveCount: null,
      },
      {
        eventNumber: 1,
        distance: 200,
        stroke: "medley",
        gender: "mixed",
        ageGroup: "15-18",
        eventKind: "swim",
        diveCount: null,
      },
    ]);
    const res = await app.request("/v1/teams/t1/meets/m1/program", {
      headers: signedIn,
    });
    const program = await res.json();
    expect(program.schema).toBe("lane4.meet-program/v1");
    expect(program.meet.startDate).toBe("2026-11-07");
    expect(
      program.events.map((e: { number: number; stroke: string }) => [
        e.number,
        e.stroke,
      ]),
    ).toEqual([
      [1, "medley"],
      [3, "dive"],
    ]);
    expect(mocks.getMeetById).toHaveBeenCalledWith("m1", "t1");
  });

  it("404s for another team's meet", async () => {
    mocks.getMeetById.mockResolvedValue(undefined);
    const res = await app.request("/v1/teams/t1/meets/m1/program", {
      headers: signedIn,
    });
    expect(res.status).toBe(404);
  });
});
