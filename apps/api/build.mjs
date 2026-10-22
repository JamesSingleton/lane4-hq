// Workspace packages export raw TypeScript, so the server ships as one bundle.
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  // Auth emails are React Email templates.
  jsx: "automatic",
  // CommonJS dependencies inside an ESM bundle still call require().
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  // posthog-node optionally imports this for trace correlation. The API does
  // not ship the OpenTelemetry SDK; the import is inside a try/catch.
  external: ["@opentelemetry/api"],
  logLevel: "info",
});
