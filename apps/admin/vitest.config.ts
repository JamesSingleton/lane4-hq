import path from "node:path";
import { defineConfig } from "vitest/config";

const appRoot = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.{test,spec}.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Pure leftovers in admin (domain helpers live in swim-core).
      include: ["lib/**/*.ts", "schemas/**/*.ts"],
      exclude: [
        "app/**",
        "components/**",
        "hooks/**",
        // Client-only or env/DB wiring — covered by e2e or integration tests.
        "lib/sign-out.ts",
        "lib/auth-providers.ts",
        "lib/resolve-team-landing.ts",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(appRoot),
    },
  },
});
