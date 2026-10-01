import { randomUUID } from "node:crypto";
import { db } from "./client";
import { auditLog } from "./schema/index";

/** Where the change was made. The user agent tells desktop from mobile. */
export type AuditSource = "admin" | "api" | "auth";

/** Who made the request and from where; attach to every event in a request. */
export type AuditContext = {
  source: AuditSource;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export type AuditEvent = {
  /** Null for account events (sign-ins, sessions) that belong to no team. */
  organizationId: string | null;
  actorUserId: string;
  /** `area.thing.verb`, e.g. `results.heat.publish`. */
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  context?: AuditContext;
};

type Executor = Pick<typeof db, "insert">;

/**
 * Append one audit event. Rows are never updated or deleted. Pass a
 * transaction as `executor` so the event commits or rolls back with the
 * change it records.
 */
export async function writeAuditLog(
  event: AuditEvent,
  executor: Executor = db,
): Promise<void> {
  const context = event.context;
  await executor.insert(auditLog).values({
    id: randomUUID(),
    organizationId: event.organizationId,
    actorUserId: event.actorUserId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    metadata: event.metadata ?? null,
    ipAddress: event.ipAddress ?? context?.ipAddress ?? null,
    source: context?.source ?? "admin",
    userAgent: context?.userAgent ?? null,
    requestId: context?.requestId ?? null,
  });
}
