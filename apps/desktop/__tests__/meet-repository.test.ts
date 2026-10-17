import { createMeet } from "@lane4hq/meet-engine/create";
import type { Meet } from "@lane4hq/meet-engine/model";
import { describe, expect, it } from "vitest";
import {
  createBrowserRepository,
  createSaveQueue,
  parseMeet,
  type SaveState,
} from "../src/lib/meet-repository";

function meet(name: string, updatedAt: string): Meet {
  return {
    ...createMeet({ name, course: "SCY" }, { newId: () => name.toLowerCase() }),
    updatedAt,
  };
}

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("browser repository", () => {
  it("saves, lists newest first, loads, and removes", async () => {
    const storage = fakeStorage();
    const repo = createBrowserRepository(storage);
    await repo.save(meet("Alpha", "2026-01-01"));
    await repo.save(meet("Beta", "2026-02-01"));
    await repo.save(meet("Alpha", "2026-03-01"));
    expect((await repo.list()).map((m) => m.name)).toEqual(["Alpha", "Beta"]);
    expect((await repo.load("beta")).name).toBe("Beta");
    await repo.appendCapture("beta", "{}");
    await repo.appendCapture("beta", "{}");
    expect(storage.map.get("lane4.captures.v1:beta")).toBe("{}\n{}\n");
    expect(await repo.readJournal("beta")).toBe("{}\n{}\n");
    await expect(repo.restoreBackup("beta")).rejects.toThrow(/desktop app/);
    await repo.remove("beta");
    await expect(repo.load("beta")).rejects.toThrow(/not found/);
    expect(await repo.list()).toHaveLength(1);
  });

  it("works without storage and survives quota errors", async () => {
    const memoryOnly = createBrowserRepository(null);
    await memoryOnly.save(meet("Gamma", "2026-01-01"));
    expect(await memoryOnly.list()).toHaveLength(1);
    await memoryOnly.remove("gamma");

    const full = createBrowserRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    });
    await full.save(meet("Delta", "2026-01-01"));
    expect((await full.load("delta")).name).toBe("Delta");
  });

  it("rejects documents that aren't Lane4 meets", () => {
    expect(() => parseMeet('{"schemaVersion":2,"id":"x"}')).toThrow(
      /Lane4 meet/,
    );
    expect(() => parseMeet("null")).toThrow(/Lane4 meet/);
  });
});

describe("save queue", () => {
  it("coalesces saves and always writes the newest document", async () => {
    const written: string[] = [];
    const states: SaveState[] = [];
    let release: () => void = () => {};
    const queue = createSaveQueue(
      (m) =>
        new Promise<void>((resolve) => {
          written.push(m.name);
          release = resolve;
        }),
      (s) => states.push(s),
    );
    queue.push(meet("one", "1"));
    queue.push(meet("two", "2"));
    queue.push(meet("three", "3"));
    release();
    await new Promise((r) => setTimeout(r, 0));
    release();
    await queue.flush();
    expect(written).toEqual(["one", "three"]);
    expect(states.at(-1)).toEqual({ status: "saved", at: "3" });
    await createSaveQueue(
      async () => {},
      () => {},
    ).flush();
  });

  it("reports failures", async () => {
    const states: SaveState[] = [];
    const queue = createSaveQueue(
      async () => {
        throw new Error("Disk full");
      },
      (s) => states.push(s),
    );
    await queue.push(meet("x", "1"));
    expect(states.at(-1)).toEqual({ status: "error", message: "Disk full" });
    const odd = createSaveQueue(
      async () => {
        throw "nope";
      },
      (s) => states.push(s),
    );
    await odd.push(meet("y", "1"));
    expect(states.at(-1)).toEqual({ status: "error", message: "nope" });
  });
});
