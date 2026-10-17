import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseMeetFilesFromBytes } from "@lane4hq/swim-formats/meet";

const FIXTURES = fileURLToPath(
  new URL("../../swim-formats/fixtures/", import.meta.url),
);

export function fixture(name: string) {
  return parseMeetFilesFromBytes([
    { filename: name, bytes: new Uint8Array(readFileSync(FIXTURES + name)) },
  ]);
}

export function counterIds(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export const NOW = new Date("2026-10-25T16:00:00.000Z");
