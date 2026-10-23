/**
 * Short codes PostHog may store on an exception. The coach-facing message
 * stays separate. Codes never include names, ids, or response bodies.
 */
export const EXCEPTION_REASONS = [
  "openai_unconfigured",
  "plan_feature",
  "templates_schema",
  "swims_unconfigured",
  "swims_unreachable",
  "swimmer_missing",
  "relay_ineligible",
  "relay_double",
  "relay_limit",
] as const;

export type ExceptionReason = (typeof EXCEPTION_REASONS)[number];

const REASON_SET = new Set<string>(EXCEPTION_REASONS);

export function tagException(error: Error, reason: ExceptionReason): Error {
  Object.defineProperty(error, "lane4Reason", {
    value: reason,
    enumerable: false,
  });
  return error;
}

export function exceptionReason(error: unknown): ExceptionReason | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as { lane4Reason?: unknown }).lane4Reason;
  if (typeof value !== "string" || !REASON_SET.has(value)) return undefined;
  return value as ExceptionReason;
}
