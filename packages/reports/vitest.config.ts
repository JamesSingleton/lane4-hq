import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/meet-entries/**/*.ts",
        "src/split-sheet/**/*.ts",
        "src/team-best-times/**/*.ts",
        "src/meet-program/build.ts",
        "src/types.ts",
      ],
      exclude: ["src/templates/**"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 70,
        statements: 90,
      },
    },
  },
});
