import { readFileSync } from "node:fs";
import { posthogHosts } from "@lane4hq/analytics";
import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(
    new URL("../src-tauri/tauri.conf.json", import.meta.url),
    "utf8",
  ),
);

describe("tauri.conf.json", () => {
  it("lets the webview reach the default analytics host", () => {
    const connect = config.app.security.csp["connect-src"].split(" ");
    expect(connect).toContain(posthogHosts().ingest);
  });
});
