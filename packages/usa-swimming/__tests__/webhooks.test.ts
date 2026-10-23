import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncMemberFromSwims } from "../src/sync";
import type { SwimsWebhookPayload } from "../src/types";
import {
  findOrganizationIdsByUsaSwimmingClubId,
  getSwimsWebhookDeliveryId,
  getSwimsWebhookDeliveryKey,
  handleSwimsWebhook,
  parseSwimsWebhookBody,
  processSwimsWebhook,
  verifySwimsWebhook,
} from "../src/webhooks";

const mockSelectWhere = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdateReturning = vi.fn();

vi.mock("@lane4hq/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => mockSelectWhere(),
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => mockInsertReturning(),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => mockUpdateReturning(),
        }),
      }),
    }),
  },
}));

vi.mock("../src/sync", () => ({
  syncMemberFromSwims: vi.fn().mockResolvedValue(undefined),
}));

const basePayload: SwimsWebhookPayload = {
  event: "member.register",
  clubId: "club-123",
  memberId: "member-456",
};

describe("verifySwimsWebhook", () => {
  it("accepts a matching thumbprint", () => {
    expect(verifySwimsWebhook("secret-thumb", "secret-thumb")).toBe(true);
  });

  it("rejects thumbprints with different lengths without throwing", () => {
    expect(verifySwimsWebhook("short", "much-longer-secret")).toBe(false);
  });

  it("rejects a wrong thumbprint of the same length", () => {
    expect(verifySwimsWebhook("aaaaaaaa", "bbbbbbbb")).toBe(false);
  });

  it("rejects missing values", () => {
    expect(verifySwimsWebhook(null, "expected")).toBe(false);
    expect(verifySwimsWebhook("value", "")).toBe(false);
  });
});

describe("parseSwimsWebhookBody", () => {
  it("parses Swagger SwimsEvent payloads", () => {
    expect(
      parseSwimsWebhookBody({
        eventSequence: 9001,
        eventTypeId: 3,
        eventType: "member.renew",
        clubId: "club-123",
        modifiedDatetime: "2026-09-28T12:00:00Z",
        eventData: {
          memberIds: ["member-456"],
          vendorRecordId: "rec-1",
        },
      }),
    ).toMatchObject({
      event: "member.renew",
      clubId: "club-123",
      memberId: "member-456",
      eventSequence: 9001,
      modifiedDatetime: "2026-09-28T12:00:00Z",
      recordId: "rec-1",
    });
  });
});

describe("findOrganizationIdsByUsaSwimmingClubId", () => {
  beforeEach(() => {
    mockSelectWhere.mockReset();
  });

  it("returns no ids when no organization matches", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    await expect(
      findOrganizationIdsByUsaSwimmingClubId("unknown-club"),
    ).resolves.toEqual([]);
  });

  it("returns a single organization id", async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: "org-1" }]);
    await expect(
      findOrganizationIdsByUsaSwimmingClubId("club-123"),
    ).resolves.toEqual(["org-1"]);
  });

  it("returns all matching organization ids", async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: "org-a" }, { id: "org-b" }]);
    await expect(
      findOrganizationIdsByUsaSwimmingClubId("shared-club"),
    ).resolves.toEqual(["org-a", "org-b"]);
  });
});

describe("parseSwimsWebhookBody edges", () => {
  const swims = (overrides: Record<string, unknown> = {}) =>
    parseSwimsWebhookBody({
      eventSequence: 1,
      eventTypeId: 1,
      modifiedDatetime: "2026-01-01T00:00:00Z",
      eventType: "member.register",
      clubId: "club",
      eventData: { memberIds: ["m1"] },
      ...overrides,
    });

  it("rejects values that are not a webhook object", () => {
    expect(parseSwimsWebhookBody(null)).toBeNull();
    expect(parseSwimsWebhookBody("nope")).toBeNull();
    expect(parseSwimsWebhookBody(1)).toBeNull();
    expect(swims({ modifiedDatetime: "" })).toBeNull();
    expect(swims({ eventType: "   " })).toBeNull();
    expect(swims({ eventType: null })).toBeNull();
    expect(swims({ eventType: "workshop" })).toBeNull();
  });

  it("maps vendor event type phrases onto member events", () => {
    expect(swims({ eventType: "Member Registered" })?.event).toBe(
      "member.register",
    );
    expect(swims({ eventType: "RENEWAL" })?.event).toBe("member.renew");
    expect(swims({ eventType: "Transfer From Club" })?.event).toBe(
      "member.transfer_from",
    );
    expect(swims({ eventType: "Transfer To Club" })?.event).toBe(
      "member.transfer_to",
    );
    expect(swims({ eventType: "Cancellation" })?.event).toBe("member.cancel");
  });

  it("reads transfer club and member ids before the generic fields", () => {
    expect(
      swims({
        eventType: "member.transfer_to",
        clubId: "old-club",
        eventData: {
          newClubId: " new-club ",
          newMemberId: " new-member ",
          memberIds: ["ignored"],
        },
      }),
    ).toMatchObject({ clubId: "new-club", memberId: "new-member" });

    expect(
      swims({
        eventType: "member.transfer_from",
        clubId: null,
        eventData: {
          oldClubId: " old-club ",
          oldMemberId: " old-member ",
        },
      }),
    ).toMatchObject({ clubId: "old-club", memberId: "old-member" });
  });

  it("falls through blank transfer ids to lists and then either id", () => {
    expect(
      swims({
        eventType: "member.transfer_to",
        clubId: "  ",
        eventData: {
          newMemberId: "   ",
          memberIds: [null, " ", " listed "],
          clubIds: ["", " listed-club "],
        },
      } as never),
    ).toMatchObject({ clubId: "listed-club", memberId: "listed" });

    expect(
      swims({
        clubId: null,
        eventData: { newMemberId: " from-new ", newClubId: " from-new-club " },
      }),
    ).toMatchObject({ clubId: "from-new-club", memberId: "from-new" });

    expect(
      swims({
        clubId: null,
        eventData: { oldMemberId: " from-old ", oldClubId: " from-old-club " },
      }),
    ).toMatchObject({ clubId: "from-old-club", memberId: "from-old" });

    expect(swims({ clubId: "club", eventData: null })).toBeNull();
    expect(swims({ clubId: null, eventData: {} })).toBeNull();
    expect(
      swims({
        eventData: { vendorRecordId: "   " },
      })?.recordId,
    ).toBeUndefined();
  });

  it("parses the legacy flat shape when the vendor body does not apply", () => {
    expect(
      parseSwimsWebhookBody({
        clubId: " c ",
        memberId: " m ",
        event: "member.register",
        recordId: " r ",
        eventSequence: "not-a-number",
        modifiedDatetime: 1,
        eventType: 1,
      }),
    ).toEqual({
      event: "member.register",
      clubId: "c",
      memberId: "m",
      eventSequence: undefined,
      modifiedDatetime: undefined,
      eventType: undefined,
      recordId: "r",
    });

    expect(
      parseSwimsWebhookBody({
        clubId: "c",
        memberId: "m",
        event: "member.renew",
        recordId: 4,
      })?.recordId,
    ).toBeUndefined();

    expect(
      parseSwimsWebhookBody({
        clubId: "c",
        memberId: "m",
        event: "nope",
      }),
    ).toBeNull();
    expect(parseSwimsWebhookBody({ clubId: 1, memberId: "m" })).toBeNull();

    expect(
      parseSwimsWebhookBody({
        clubId: "c",
        memberId: "m",
        event: "member.cancel",
        eventSequence: 9,
        eventType: "member.cancel",
      }),
    ).toMatchObject({ eventSequence: 9, eventType: "member.cancel" });
    expect(
      parseSwimsWebhookBody({
        clubId: "c",
        memberId: "m",
        event: "member.transfer_to",
        modifiedDatetime: "2026-04-01T00:00:00Z",
      })?.modifiedDatetime,
    ).toBe("2026-04-01T00:00:00Z");
  });
});

describe("getSwimsWebhookDeliveryKey", () => {
  it("uses eventSequence when documented on the payload", () => {
    expect(
      getSwimsWebhookDeliveryKey({
        ...basePayload,
        eventSequence: 42,
      }),
    ).toEqual({ id: "seq:42", strategy: "sequence" });
  });

  it("includes modifiedDatetime so repeat renewals are not deduped together", () => {
    const key2025 = getSwimsWebhookDeliveryKey({
      ...basePayload,
      event: "member.renew",
      modifiedDatetime: "2025-09-01T00:00:00Z",
    });
    const key2026 = getSwimsWebhookDeliveryKey({
      ...basePayload,
      event: "member.renew",
      modifiedDatetime: "2026-09-01T00:00:00Z",
    });
    expect(key2025.id).not.toEqual(key2026.id);
    expect(key2025.strategy).toBe("occurrence");
    expect(
      getSwimsWebhookDeliveryKey({
        ...basePayload,
        modifiedDatetime: "2026-09-01T00:00:00Z",
        eventType: "member.renew",
      }).id,
    ).not.toEqual(key2026.id);
  });

  it("hashes a short replay window when the vendor sent no sequence or time", () => {
    const key = getSwimsWebhookDeliveryKey(basePayload);
    expect(key.strategy).toBe("replay_window");
    expect(key.id.startsWith("replay:")).toBe(true);
    expect(getSwimsWebhookDeliveryId(basePayload)).toBe(key.id);
    expect(
      getSwimsWebhookDeliveryKey({ ...basePayload, recordId: "rec-1" }).id,
    ).not.toEqual(key.id);
  });
});

describe("handleSwimsWebhook", () => {
  it("syncs the member and marks cancellations inactive", async () => {
    const sync = vi.mocked(syncMemberFromSwims);
    sync.mockClear();
    await handleSwimsWebhook(basePayload, "org-1");
    await handleSwimsWebhook(
      { ...basePayload, event: "member.renew" },
      "org-1",
    );
    await handleSwimsWebhook(
      { ...basePayload, event: "member.transfer_to" },
      "org-1",
    );
    await handleSwimsWebhook(
      { ...basePayload, event: "member.transfer_from" },
      "org-1",
    );
    await handleSwimsWebhook(
      { ...basePayload, event: "member.cancel" },
      "org-1",
    );
    expect(sync).toHaveBeenCalledWith("org-1", "club-123", "member-456");
    expect(sync).toHaveBeenCalledWith("org-1", "club-123", "member-456", {
      inactive: false,
    });
    expect(sync).toHaveBeenCalledWith("org-1", "club-123", "member-456", {
      inactive: true,
    });
  });
});

describe("processSwimsWebhook", () => {
  beforeEach(() => {
    mockSelectWhere.mockReset();
    mockInsertReturning.mockReset();
    mockUpdateReturning.mockReset();
  });

  it("skips duplicate deliveries when eventSequence was already processed", async () => {
    mockInsertReturning.mockResolvedValueOnce([]);

    await expect(
      processSwimsWebhook({
        ...basePayload,
        eventSequence: 100,
      }),
    ).resolves.toEqual({ kind: "duplicate" });

    expect(mockSelectWhere).not.toHaveBeenCalled();
  });

  it("reports a club that is not linked to an organization", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockInsertReturning.mockResolvedValueOnce([]);
    mockUpdateReturning.mockResolvedValueOnce([{ id: "replay" }]);
    mockSelectWhere.mockResolvedValueOnce([]);

    await expect(processSwimsWebhook(basePayload)).resolves.toEqual({
      kind: "unknown_club",
      clubId: "club-123",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still treats a recent replay as a duplicate", async () => {
    mockInsertReturning.mockResolvedValueOnce([]);
    mockUpdateReturning.mockResolvedValueOnce([]);
    await expect(processSwimsWebhook(basePayload)).resolves.toEqual({
      kind: "duplicate",
    });
  });

  it("processes every linked organization and records the ones that fail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const sync = vi.mocked(syncMemberFromSwims);
    sync.mockResolvedValueOnce(undefined);
    sync.mockRejectedValueOnce(new Error("boom"));
    mockInsertReturning.mockResolvedValueOnce([{ id: "seq:7" }]);
    mockSelectWhere.mockResolvedValueOnce([{ id: "org-1" }, { id: "org-2" }]);

    await expect(
      processSwimsWebhook({ ...basePayload, eventSequence: 7 }),
    ).resolves.toEqual({
      kind: "processed",
      organizationIds: ["org-1", "org-2"],
      failedOrganizationIds: ["org-2"],
    });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
