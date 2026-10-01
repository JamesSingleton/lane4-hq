import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/lib/**/*.ts"],
      // Thin wrappers over Tauri IPC; exercised by running the app.
      exclude: ["src/lib/native.ts", "src/lib/tauri-repository.ts"],
    },
  },
});
