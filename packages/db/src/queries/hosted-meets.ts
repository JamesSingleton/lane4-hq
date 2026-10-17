import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { type AuditContext, writeAuditLog } from "../audit";
import { db } from "../client";
import { hostedMeets, publishedHeats } from "../schema/index";

export type HostedMeetInput = {
  id: string;
  name: string;
  startDate?: string;
  course: string;
  location?: string;
};

export type HeatPublicationInput = {
  eventNumber: number;
  round: string;
  heat: number;
  revision: number;
  idempotencyKey: string;
  event: Record<string, unknown>;
  lanes: Record<string, unknown>[];
  verifiedAt: Date;
};

/**
 * - `created` / `updated`: stored as the heat's latest revision.
 * - `duplicate`: this exact revision was already stored.
 * - `stale`: a newer revision is already stored.
 * - `meet_taken`: another team already publishes a meet with this id.
 */
export type RecordHeatOutcome =
  | "created"
  | "updated"
  | "duplicate"
  | "stale"
  | "meet_taken";

export async function recordHeatPublication(input: {
  organizationId: string;
  userId: string;
  meet: HostedMeetInput;
  heat: HeatPublicationInput;
  audit: AuditContext;
}): Promise<RecordHeatOutcome> {
  const { organizationId, userId, meet, heat, audit } = input;
  return db.transaction(async (tx) => {
    const now = new Date();
    const [owner] = await tx
      .insert(hostedMeets)
      .values({
        id: meet.id,
        organizationId,
        name: meet.name,
        startDate: meet.startDate ?? null,
        course: meet.course,
        location: meet.location ?? null,
        lastPublishedAt: now,
      })
      .onConflictDoUpdate({
        target: hostedMeets.id,
        set: {
          name: meet.name,
          startDate: meet.startDate ?? null,
          course: meet.course,
          location: meet.location ?? null,
          lastPublishedAt: now,
          updatedAt: now,
        },
        setWhere: eq(hostedMeets.organizationId, organizationId),
      })
      .returning({
        id: hostedMeets.id,
        inserted: sql<boolean>`(xmax = 0)`,
      });
    if (!owner) return "meet_taken";
    if (owner.inserted) {
      await writeAuditLog(
        {
          organizationId,
          actorUserId: userId,
          action: "meet.hosting.claimed",
          resourceType: "hosted_meet",
          resourceId: meet.id,
          metadata: { name: meet.name },
          context: audit,
        },
        tx,
      );
    }

    const id = randomUUID();
    const [stored] = await tx
      .insert(publishedHeats)
      .values({
        id,
        hostedMeetId: meet.id,
        eventNumber: heat.eventNumber,
        round: heat.round,
        heat: heat.heat,
        revision: heat.revision,
        idempotencyKey: heat.idempotencyKey,
        event: heat.event,
        lanes: heat.lanes,
        verifiedAt: heat.verifiedAt,
        publishedByUserId: userId,
        receivedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          publishedHeats.hostedMeetId,
          publishedHeats.eventNumber,
          publishedHeats.round,
          publishedHeats.heat,
        ],
        set: {
          revision: heat.revision,
          idempotencyKey: heat.idempotencyKey,
          event: heat.event,
          lanes: heat.lanes,
          verifiedAt: heat.verifiedAt,
          publishedByUserId: userId,
          receivedAt: now,
        },
        setWhere: sql`excluded.revision > ${publishedHeats.revision}`,
      })
      .returning({ id: publishedHeats.id });
    if (stored) {
      const outcome = stored.id === id ? "created" : "updated";
      await writeAuditLog(
        {
          organizationId,
          actorUserId: userId,
          action: "results.heat.publish",
          resourceType: "published_heat",
          resourceId: stored.id,
          metadata: {
            hostedMeetId: meet.id,
            eventNumber: heat.eventNumber,
            round: heat.round,
            heat: heat.heat,
            revision: heat.revision,
            outcome,
          },
          context: audit,
        },
        tx,
      );
      return outcome;
    }

    const [existing] = await tx
      .select({ revision: publishedHeats.revision })
      .from(publishedHeats)
      .where(
        and(
          eq(publishedHeats.hostedMeetId, meet.id),
          eq(publishedHeats.eventNumber, heat.eventNumber),
          eq(publishedHeats.round, heat.round),
          eq(publishedHeats.heat, heat.heat),
        ),
      )
      .limit(1);
    return existing?.revision === heat.revision ? "duplicate" : "stale";
  });
}

export async function getHostedMeet(meetId: string) {
  const [meet] = await db
    .select()
    .from(hostedMeets)
    .where(eq(hostedMeets.id, meetId))
    .limit(1);
  return meet ?? null;
}

export async function getHostedMeetsForOrganization(organizationId: string) {
  return db
    .select()
    .from(hostedMeets)
    .where(eq(hostedMeets.organizationId, organizationId))
    .orderBy(desc(hostedMeets.startDate), desc(hostedMeets.createdAt));
}

/** Published heats in meet order: prelims and timed finals, then finals. */
export async function getPublishedHeats(hostedMeetId: string) {
  return db
    .select()
    .from(publishedHeats)
    .where(eq(publishedHeats.hostedMeetId, hostedMeetId))
    .orderBy(
      sql`case when ${publishedHeats.round} = 'final' then 1 else 0 end`,
      asc(publishedHeats.eventNumber),
      asc(publishedHeats.heat),
    );
}
