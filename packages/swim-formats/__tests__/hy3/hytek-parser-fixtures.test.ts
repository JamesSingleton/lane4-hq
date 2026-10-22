import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseHy3 } from "../../src/hy3/parser";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/third-party/hytek-parser",
);

const files = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".hy3"))
  .sort();

describe("SwimComm hytek-parser HY3 fixtures (parse only)", () => {
  it("includes the upstream MIT corpus", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  for (const name of files) {
    it(`parses ${name}`, () => {
      const meet = parseHy3(readFileSync(join(fixturesDir, name), "latin1"));
      expect(meet.name.trim().length).toBeGreaterThan(0);
      const rows =
        meet.entries.length +
        meet.results.length +
        (meet.relays?.length ?? 0) +
        (meet.athletes?.length ?? 0);
      expect(rows).toBeGreaterThan(0);
    });
  }
});
