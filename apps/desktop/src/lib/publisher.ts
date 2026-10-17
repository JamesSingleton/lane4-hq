import type { Meet } from "@lane4hq/meet-engine/model";
import {
  buildHeatPublication,
  markPublished,
  markPublishFailed,
  publishQueue,
  retryDelayMs,
} from "@lane4hq/meet-engine/publish";

export type PublishOutcome =
  | { key: string; revision: number; ok: true }
  | { key: string; ok: false; error: string };

export type DrainResult = {
  outcomes: PublishOutcome[];
  /** Set when draining stopped early because the service is unreachable. */
  offline: string | null;
  /** Draining stopped at a 429; the rest of the queue waits for the next pass. */
  throttled: boolean;
  /**
   * Plain-language notes for the operator. A 409 still counts as published
   * (the heat is done) and is explained here.
   */
  notices: string[];
};

/** What to tell the operator when the API already stored a newer revision. */
export function newerRevisionNotice(count: number): string {
  if (count === 1) {
    return "Lane4 already has a newer revision of this heat, so this copy was not stored.";
  }
  return `Lane4 already has a newer revision of ${count} heats, so those copies were not stored.`;
}

export type PostFn = (
  idempotencyKey: string,
  body: string,
) => Promise<{ status: number; body: string }>;

/** Throw this from `post` when there's no connection at all. */
export class OfflineError extends Error {
  constructor(message = "Offline") {
    super(message);
    this.name = "OfflineError";
  }
}

function due(meet: Meet, key: string, now: number): boolean {
  const p = meet.heatRecords[key]!.publish;
  if (p.state !== "failed" || !p.lastAttemptAt) return true;
  return Date.parse(p.lastAttemptAt) + retryDelayMs(p.attempts) <= now;
}

/**
 * Send every due heat in the queue. Returns outcomes to apply to the latest
 * meet document, since the operator may keep verifying heats meanwhile.
 */
export async function drainPublishQueue(
  meet: Meet,
  post: PostFn,
  now = Date.now(),
): Promise<DrainResult> {
  const outcomes: PublishOutcome[] = [];
  let newerRevisions = 0;
  const finish = (partial: {
    offline: string | null;
    throttled: boolean;
  }): DrainResult => ({
    outcomes,
    offline: partial.offline,
    throttled: partial.throttled,
    notices: newerRevisions > 0 ? [newerRevisionNotice(newerRevisions)] : [],
  });

  for (const item of publishQueue(meet)) {
    if (!due(meet, item.key, now)) continue;
    const publication = buildHeatPublication(meet, item.eventId, item.heat);
    let response: { status: number; body: string };
    try {
      response = await post(
        publication.idempotencyKey,
        JSON.stringify(publication),
      );
    } catch (error) {
      if (error instanceof OfflineError)
        return finish({ offline: error.message, throttled: false });
      outcomes.push({
        key: item.key,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (response.status === 429)
      return finish({ offline: null, throttled: true });
    if (response.status >= 200 && response.status < 300) {
      outcomes.push({
        key: item.key,
        revision: publication.revision,
        ok: true,
      });
      continue;
    }
    // 409: a newer revision is already stored (the same revision is 200).
    // Stop retrying — another attempt would lose again — and tell the operator.
    if (response.status === 409) {
      newerRevisions += 1;
      outcomes.push({
        key: item.key,
        revision: publication.revision,
        ok: true,
      });
      continue;
    }
    outcomes.push({
      key: item.key,
      ok: false,
      error: `HTTP ${response.status}${response.body ? `: ${response.body.slice(0, 200)}` : ""}`,
    });
  }
  return finish({ offline: null, throttled: false });
}

export function applyPublishOutcomes(
  meet: Meet,
  outcomes: PublishOutcome[],
  now = new Date(),
): Meet {
  let next = meet;
  for (const o of outcomes) {
    next = o.ok
      ? markPublished(next, o.key, o.revision, now)
      : markPublishFailed(next, o.key, o.error, now);
  }
  return next;
}

export function publishCounts(meet: Meet): {
  published: number;
  pending: number;
  failed: number;
} {
  const counts = { published: 0, pending: 0, failed: 0 };
  for (const record of Object.values(meet.heatRecords))
    counts[record.publish.state]++;
  return counts;
}
