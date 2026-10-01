import type { Logger } from "./logger";

/** A dependency the API can't serve requests without. Resolves when healthy. */
export type ReadinessCheck = () => Promise<unknown>;

const CHECK_TIMEOUT_MS = 3_000;

function withTimeout(check: ReadinessCheck): Promise<unknown> {
  return Promise.race([
    check(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("timed out")),
        CHECK_TIMEOUT_MS,
      ).unref?.(),
    ),
  ]);
}

/**
 * Runs every check at once. Failures are logged, but the response only says
 * which dependency is down, never why.
 */
export async function runReadiness(
  checks: Record<string, ReadinessCheck>,
  logger: Logger,
) {
  const names = Object.keys(checks);
  const results = await Promise.allSettled(
    names.map((name) => withTimeout(checks[name] as ReadinessCheck)),
  );
  const status: Record<string, "ok" | "failed"> = {};
  results.forEach((result, i) => {
    const name = names[i] as string;
    status[name] = result.status === "fulfilled" ? "ok" : "failed";
    if (result.status === "rejected") {
      logger.error("readiness check failed", {
        check: name,
        error: result.reason,
      });
    }
  });
  const ready = results.every((r) => r.status === "fulfilled");
  return { ready, checks: status };
}
