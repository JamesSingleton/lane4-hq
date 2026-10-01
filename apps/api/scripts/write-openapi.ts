// Writes openapi.json for client generators (desktop, Expo, partners).
import { writeFileSync } from "node:fs";

// Building the document never queries; postgres-js connects lazily.
process.env.SKIP_ENV_VALIDATION ??= "true";
process.env.DATABASE_URL ??= "postgres://openapi@localhost/openapi";

const { createApp } = await import("../src/app");
const { OPENAPI_INFO } = await import("../src/app");

const doc = createApp({ allowedOrigins: [] }).getOpenAPI31Document(
  OPENAPI_INFO,
);
writeFileSync(
  new URL("../openapi.json", import.meta.url),
  `${JSON.stringify(doc, null, 2)}\n`,
);
console.log("Wrote apps/api/openapi.json");
process.exit(0);
