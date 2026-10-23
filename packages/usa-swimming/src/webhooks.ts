import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@lane4hq/db/client";
import { organization, usaSwimmingWebhookDelivery } from "@lane4hq/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { syncMemberFromSwims } from "./sync";
import type {
  SwimsEvent,
  SwimsEventData,
  SwimsWebhookEvent,
  SwimsWebhookPayload,
} from "./types";

/** When Swagger defines no delivery id and no event timestamp, only suppress identical retries briefly. */
const WEBHOOK_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

type DeliveryDedupeStrategy = "sequence" | "occurrence" | "replay_window";

export type SwimsWebhookDeliveryKey = {
  id: string;
  strategy: DeliveryDedupeStrategy;
};

export function verifySwimsWebhook(
  thumbprint: string | null,
  expectedThumbprint: string,
): boolean {
  if (!thumbprint || !expectedThumbprint) return false;
  const received = Buffer.from(thumbprint, "utf8");
  const expected = Buffer.from(expectedThumbprint, "utf8");
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

function isSwimsWebhookEvent(value: string): value is SwimsWebhookEvent {
  return (
    value === "member.register" ||
    value === "member.renew" ||
    value === "member.transfer_to" ||
    value === "member.transfer_from" ||
    value === "member.cancel"
  );
}

function mapSwimsEventType(
  eventType: string | null | undefined,
): SwimsWebhookEvent | null {
  if (!eventType?.trim()) return null;
  if (isSwimsWebhookEvent(eventType)) return eventType;

  const normalized = eventType.toLowerCase();
  if (normalized.includes("register")) return "member.register";
  if (normalized.includes("renew")) return "member.renew";
  if (normalized.includes("transfer") && normalized.includes("from")) {
    return "member.transfer_from";
  }
  if (normalized.includes("transfer") && normalized.includes("to")) {
    return "member.transfer_to";
  }
  if (normalized.includes("cancel")) return "member.cancel";
  return null;
}

function memberIdFromEventData(
  event: SwimsWebhookEvent,
  data: SwimsEventData | null | undefined,
): string | null {
  if (!data) return null;
  if (event === "member.transfer_to" && data.newMemberId?.trim()) {
    return data.newMemberId.trim();
  }
  if (event === "member.transfer_from" && data.oldMemberId?.trim()) {
    return data.oldMemberId.trim();
  }
  const fromList = data.memberIds?.find((id) => id?.trim())?.trim();
  return (
    fromList ?? data.newMemberId?.trim() ?? data.oldMemberId?.trim() ?? null
  );
}

function clubIdFromSwimsEvent(
  event: SwimsWebhookEvent,
  swimsEvent: SwimsEvent,
): string | null {
  const data = swimsEvent.eventData;
  if (event === "member.transfer_to" && data?.newClubId?.trim()) {
    return data.newClubId.trim();
  }
  if (event === "member.transfer_from" && data?.oldClubId?.trim()) {
    return data.oldClubId.trim();
  }
  if (swimsEvent.clubId?.trim()) return swimsEvent.clubId.trim();
  const fromList = data?.clubIds?.find((id) => id?.trim())?.trim();
  return fromList ?? data?.newClubId?.trim() ?? data?.oldClubId?.trim() ?? null;
}

function parseSwimsEventBody(
  raw: Record<string, unknown>,
): SwimsWebhookPayload | null {
  if (typeof raw.eventSequence !== "number" || !raw.modifiedDatetime) {
    return null;
  }

  const swimsEvent = raw as unknown as SwimsEvent;
  const eventType = swimsEvent.eventType ?? undefined;
  const event = mapSwimsEventType(eventType);
  if (!event) return null;

  const clubId = clubIdFromSwimsEvent(event, swimsEvent);
  const memberId = memberIdFromEventData(event, swimsEvent.eventData);
  if (!clubId || !memberId) return null;

  return {
    event,
    clubId,
    memberId,
    recordId: swimsEvent.eventData?.vendorRecordId?.trim() || undefined,
    eventSequence: swimsEvent.eventSequence,
    modifiedDatetime: String(swimsEvent.modifiedDatetime),
    eventType,
  };
}

function parseLegacyWebhookBody(
  raw: Record<string, unknown>,
): SwimsWebhookPayload | null {
  if (typeof raw.clubId !== "string" || typeof raw.memberId !== "string") {
    return null;
  }
  if (typeof raw.event !== "string" || !isSwimsWebhookEvent(raw.event)) {
    return null;
  }

  return {
    event: raw.event,
    clubId: raw.clubId.trim(),
    memberId: raw.memberId.trim(),
    recordId:
      typeof raw.recordId === "string" ? raw.recordId.trim() : undefined,
    eventSequence:
      typeof raw.eventSequence === "number" ? raw.eventSequence : undefined,
    modifiedDatetime:
      typeof raw.modifiedDatetime === "string"
        ? raw.modifiedDatetime
        : undefined,
    eventType: typeof raw.eventType === "string" ? raw.eventType : undefined,
  };
}

/** Parse vendor JSON (Swagger `SwimsEvent` or legacy flat test/fixture shape). */
export function parseSwimsWebhookBody(
  raw: unknown,
): SwimsWebhookPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return parseSwimsEventBody(record) ?? parseLegacyWebhookBody(record);
}

export function getSwimsWebhookDeliveryKey(
  payload: SwimsWebhookPayload,
): SwimsWebhookDeliveryKey {
  if (payload.eventSequence != null) {
    return {
      id: `seq:${payload.eventSequence}`,
      strategy: "sequence",
    };
  }

  if (payload.modifiedDatetime) {
    const material = JSON.stringify({
      event: payload.event,
      eventType: payload.eventType ?? null,
      clubId: payload.clubId,
      memberId: payload.memberId,
      modifiedDatetime: payload.modifiedDatetime,
    });
    return {
      id: `occ:${createHash("sha256").update(material).digest("hex")}`,
      strategy: "occurrence",
    };
  }

  const material = JSON.stringify({
    event: payload.event,
    clubId: payload.clubId,
    memberId: payload.memberId,
    recordId: payload.recordId ?? null,
  });
  return {
    id: `replay:${createHash("sha256").update(material).digest("hex")}`,
    strategy: "replay_window",
  };
}

/** @deprecated Use getSwimsWebhookDeliveryKey */
export function getSwimsWebhookDeliveryId(
  payload: SwimsWebhookPayload,
): string {
  return getSwimsWebhookDeliveryKey(payload).id;
}

export async function findOrganizationIdsByUsaSwimmingClubId(
  clubId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.usaSwimmingClubId, clubId));
  return rows.map((row) => row.id);
}

export type SwimsWebhookProcessResult =
  | { kind: "duplicate" }
  | { kind: "unknown_club"; clubId: string }
  | {
      kind: "processed";
      organizationIds: string[];
      failedOrganizationIds: string[];
    };

async function claimWebhookDelivery(
  key: SwimsWebhookDeliveryKey,
  payload: SwimsWebhookPayload,
): Promise<boolean> {
  const inserted = await db
    .insert(usaSwimmingWebhookDelivery)
    .values({
      id: key.id,
      event: payload.event,
      clubId: payload.clubId,
    })
    .onConflictDoNothing()
    .returning({ id: usaSwimmingWebhookDelivery.id });

  if (inserted.length > 0) return true;
  if (key.strategy !== "replay_window") return false;

  const replayCutoff = new Date(Date.now() - WEBHOOK_REPLAY_WINDOW_MS);
  const updated = await db
    .update(usaSwimmingWebhookDelivery)
    .set({
      processedAt: new Date(),
      event: payload.event,
      clubId: payload.clubId,
    })
    .where(
      and(
        eq(usaSwimmingWebhookDelivery.id, key.id),
        lt(usaSwimmingWebhookDelivery.processedAt, replayCutoff),
      ),
    )
    .returning({ id: usaSwimmingWebhookDelivery.id });

  return updated.length > 0;
}

export async function handleSwimsWebhook(
  payload: SwimsWebhookPayload,
  organizationId: string,
): Promise<void> {
  switch (payload.event) {
    case "member.register":
    case "member.renew":
    case "member.transfer_to":
      await syncMemberFromSwims(
        organizationId,
        payload.clubId,
        payload.memberId,
      );
      break;
    case "member.transfer_from":
    case "member.cancel":
      await syncMemberFromSwims(
        organizationId,
        payload.clubId,
        payload.memberId,
        {
          inactive: payload.event === "member.cancel",
        },
      );
      break;
  }
}

export async function processSwimsWebhook(
  payload: SwimsWebhookPayload,
): Promise<SwimsWebhookProcessResult> {
  const deliveryKey = getSwimsWebhookDeliveryKey(payload);
  const claimed = await claimWebhookDelivery(deliveryKey, payload);
  if (!claimed) {
    return { kind: "duplicate" };
  }

  const organizationIds = await findOrganizationIdsByUsaSwimmingClubId(
    payload.clubId,
  );

  if (organizationIds.length === 0) {
    console.warn(
      "SWIMS webhook: no organization linked to clubId",
      payload.clubId,
      deliveryKey.id,
    );
    return { kind: "unknown_club", clubId: payload.clubId };
  }

  const failedOrganizationIds: string[] = [];
  for (const organizationId of organizationIds) {
    try {
      await handleSwimsWebhook(payload, organizationId);
    } catch (error) {
      failedOrganizationIds.push(organizationId);
      console.error(
        "SWIMS webhook org processing error:",
        organizationId,
        error,
      );
    }
  }

  return {
    kind: "processed",
    organizationIds,
    failedOrganizationIds,
  };
}
