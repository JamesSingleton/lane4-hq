import { createPolar, type Polar } from "@polar-sh/sdk/2026-10";

let polarClient: Polar | null = null;

export function getPolar(): Polar | null {
  // Polar checkout is configured via `@lane4hq/auth/keys` (Better Auth plugin).
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) return null;
  if (!polarClient) {
    polarClient = createPolar({
      accessToken,
      environment:
        process.env.POLAR_SERVER === "production" ? "production" : "sandbox",
    });
  }
  return polarClient;
}

export const POLAR_PRODUCTS = {
  pro: process.env.POLAR_PRODUCT_PRO ?? "",
  enterprise: process.env.POLAR_PRODUCT_ENTERPRISE ?? "",
} as const;

/** Server-side usage ingest for AI generations (Polar meters). */
export async function ingestAiGenerationEvent(input: {
  externalCustomerId: string;
  organizationId: string;
  kind: "workout" | "relay";
}) {
  const polar = getPolar();
  if (!polar) return;

  try {
    await polar.events.ingest({
      events: [
        {
          name: "ai_generation",
          external_customer_id: input.externalCustomerId,
          metadata: {
            kind: input.kind,
            organizationId: input.organizationId,
          },
        },
      ],
    });
  } catch (error) {
    console.error("Polar AI usage ingest failed:", error);
  }
}
