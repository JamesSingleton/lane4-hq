import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Pure role helpers only — Better Auth server/client/session need runtime mocks.
      include: [
        "src/roles.ts",
        "src/device-clients.ts",
        "src/device-session.ts",
      ],
      exclude: [
        "src/index.ts",
        "src/client.ts",
        "src/server.ts",
        "src/session.ts",
        "src/organization-ac.ts",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
