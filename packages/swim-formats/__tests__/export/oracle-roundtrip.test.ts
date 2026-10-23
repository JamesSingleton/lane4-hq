import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCl2Meet } from "../../src/cl2/parser";
import { parseEv3, parseHyv } from "../../src/ev3/parser";
import {
  exportCl2,
  exportEv3,
  exportHy3,
  exportHyv,
  hy3FileDate,
  hytekByte,
} from "../../src/export/meet";
import { parseHy3 } from "../../src/hy3/parser";
import type { ParsedMeet } from "../../src/types";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "latin1");
}

function columnRanges(left: string, right: string): string[] {
  const ranges: string[] = [];
  let start = -1;
  const width = Math.max(left.length, right.length);
  for (let i = 0; i <= width; i++) {
    const differs = i < width && left[i] !== right[i];
    if (differs && start < 0) start = i;
    if (!differs && start >= 0) {
      ranges.push(`${start + 1}-${i}`);
      start = -1;
    }
  }
  return ranges;
}

function recordKey(line: string, semi: boolean): string {
  if (!semi) return line.slice(0, 2);
  return "row";
}

/**
 * Byte-oriented diff grouped by record type. Column ranges are 1-based
 * and merged across lines of the same type. Semicolon files report
 * field indexes (`f0`, `f24`, …) instead of columns.
 */
export function roundTripDiff(original: string, exported: string): string {
  const left = original.split(/\r?\n/).filter((line) => line.length > 0);
  const right = exported.split(/\r?\n/).filter((line) => line.length > 0);
  const semi = original.includes(";");
  const group = (lines: string[]) => {
    const map = new Map<string, string[]>();
    for (const line of lines) {
      const key = recordKey(line, semi);
      const list = map.get(key) ?? [];
      list.push(line);
      map.set(key, list);
    }
    return map;
  };
  const a = group(left);
  const b = group(right);
  const types = [...new Set([...a.keys(), ...b.keys()])];
  const parts: string[] = [];
  if (left.length !== right.length) {
    parts.push(`lines ${left.length}->${right.length}`);
  }
  if (original.includes("\r\n") !== exported.includes("\r\n")) {
    parts.push(
      `newline crlf ${original.includes("\r\n")}->${exported.includes("\r\n")}`,
    );
  }
  for (const type of types) {
    const la = a.get(type) ?? [];
    const lb = b.get(type) ?? [];
    const cols = new Map<string, number>();
    let same = 0;
    const pairs = Math.min(la.length, lb.length);
    for (let i = 0; i < pairs; i++) {
      const x = la[i] ?? "";
      const y = lb[i] ?? "";
      if (x === y) {
        same += 1;
        continue;
      }
      if (semi) {
        const fx = x.split(";");
        const fy = y.split(";");
        const n = Math.max(fx.length, fy.length);
        for (let k = 0; k < n; k++) {
          if (fx[k] !== fy[k]) cols.set(`f${k}`, (cols.get(`f${k}`) ?? 0) + 1);
        }
      } else {
        for (const range of columnRanges(x, y)) {
          cols.set(range, (cols.get(range) ?? 0) + 1);
        }
      }
    }
    const listed = [...cols.entries()]
      .sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]))
      .slice(0, 12)
      .map(([range, count]) => `${range}(${count})`)
      .join(" ");
    const countNote =
      la.length === lb.length ? "" : ` count ${la.length}/${lb.length}`;
    parts.push(
      `${type}: ${same}/${pairs} identical${countNote}${listed ? `; ${listed}` : ""}`,
    );
  }
  return parts.join("\n");
}

function checksumOk(line: string, kind: "hy3" | "cl2"): boolean {
  if (kind === "hy3") {
    const body = line.slice(0, 128);
    let even = 0;
    let odd = 0;
    for (let i = 0; i < 128; i++) {
      const value = hytekByte(body.charCodeAt(i));
      if (i % 2 === 0) even += value;
      else odd += 2 * value;
    }
    const mod = (Math.floor((even + odd) / 21) + 205) % 100;
    return line.slice(128, 130) === `${mod % 10}${Math.floor(mod / 10)}`;
  }
  const body = line.slice(0, 156);
  let sum = 0;
  for (let i = 0; i < 156; i++) sum += hytekByte(body.charCodeAt(i));
  const mod = (Math.floor(sum / 19) + 211) % 100;
  return line.slice(156) === ` N${mod % 10}${Math.floor(mod / 10)}`;
}

const fixed = [
  "mari-sonoran-2026.hy3",
  "mari-sonoran-2026.cl2",
  "mari-charger-2024.hy3",
  "mari-charger-2024.cl2",
  "mari-az-roster.hy3",
  "mari-az-roster.cl2",
];

describe("scrubbed Maricopa fixture checksums", () => {
  for (const name of fixed) {
    it(`${name} recomputes from CP-1252 bytes`, () => {
      const kind = name.endsWith(".hy3") ? "hy3" : "cl2";
      const lines = readFixture(name)
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
      expect(lines.every((line) => checksumOk(line, kind))).toBe(true);
      expect(
        lines.every((line) => line.length === (kind === "hy3" ? 130 : 160)),
      ).toBe(true);
    });
  }
});

type OracleCase = {
  file: string;
  parse: (text: string) => ParsedMeet;
  exportText: (meet: ParsedMeet) => string;
};

const oracles: OracleCase[] = [
  { file: "mari-az-roster.hy3", parse: parseHy3, exportText: exportHy3 },
  { file: "mari-sonoran-2026.cl2", parse: parseCl2Meet, exportText: exportCl2 },
  { file: "mari-charger-2024.cl2", parse: parseCl2Meet, exportText: exportCl2 },
  {
    file: "charger-2024-invitational.ev3",
    parse: parseEv3,
    exportText: exportEv3,
  },
  {
    file: "charger-2024-invitational.hyv",
    parse: parseHyv,
    exportText: exportHyv,
  },
  {
    file: "croswhite-2026-invite-rev.ev3",
    parse: parseEv3,
    exportText: exportEv3,
  },
  {
    file: "croswhite-2026-invite-rev.hyv",
    parse: parseHyv,
    exportText: exportHyv,
  },
];

/** A1 columns 59–75 and the checksum. Export always stamps the current moment. */
function withoutA1Stamp(text: string): string {
  return text.replace(
    /^(A1.{56}).{17}(.{53}).{2}/m,
    (_match, head: string, licensee: string) =>
      `${head}${" ".repeat(17)}${licensee}00`,
  );
}

describe("Hy-Tek entry HY3 files", () => {
  for (const file of ["mari-sonoran-2026.hy3", "mari-charger-2024.hy3"]) {
    it(`${file} re-exports every column except the new creation stamp`, () => {
      const original = readFixture(file);
      const exported = exportHy3(parseHy3(original));
      expect(withoutA1Stamp(exported)).toBe(withoutA1Stamp(original));
      const a1 = exported.split(/\r?\n/).find((line) => line.startsWith("A1"));
      expect(a1?.slice(58, 66)).toBe(hy3FileDate());
      expect(a1?.slice(66, 75)).toMatch(/^ {1,2}\d{1,2}:\d{2} [AP]M$/);
    });
  }
});

describe("Hy-Tek oracle round-trips", () => {
  for (const oracle of oracles) {
    it.fails(`${oracle.file} re-exports byte-for-byte`, () => {
      const original = readFixture(oracle.file);
      const exported = oracle.exportText(oracle.parse(original));
      const diff = roundTripDiff(original, exported);
      // roundTripDiff lists every record type, including matches, so this
      // message is never empty while any line differs. Summary as of the
      // Team Manager layout change:
      // HY3 roster: export inserts B1/B2 and reorders D1, so only 3/20 D1
      //   lines match in file order. C1–C3 match.
      // CL2 entries: A0, B1, C1, D0, D3, and F0 match. Sonoran E0 matches.
      //   One Charger E0 with no numeric seed differs at columns 47–48
      //   and 51–52. Z0 still carries today's build date.
      // EV3/HYV: minimal exporter; header and event fields still differ,
      //   including the unknown trailing checksum token.
      expect(diff, diff).toBe("");
    });
  }

  it.fails("mari-az-roster.cl2 is a swimmers-only roster, not a meet export", () => {
    const original = readFixture("mari-az-roster.cl2");
    expect(() => parseCl2Meet(original)).not.toThrow();
    const exported = exportCl2(parseCl2Meet(original));
    expect(roundTripDiff(original, exported)).toBe("");
  });
});
