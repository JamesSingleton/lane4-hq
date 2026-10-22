import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/client", () => ({
  db: { select: vi.fn() },
}));

const { supportUserSearchPattern, searchUsersForSupport } = await import(
  "../src/queries/support-users"
);

describe("support user search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a bounded LIKE pattern and escapes wildcards", () => {
    expect(supportUserSearchPattern("  Abby ")).toBe("%abby%");
    expect(supportUserSearchPattern("a_b%c\\d")).toBe("%a\\_b\\%c\\\\d%");
    expect(supportUserSearchPattern("ab")).toBeNull();
    expect(supportUserSearchPattern("a".repeat(200))).toHaveLength(202);
    expect(supportUserSearchPattern("a".repeat(201))).toBeNull();
  });

  it("skips the query when the search is too short", async () => {
    const { db } = await import("../src/client");
    await expect(searchUsersForSupport("ab")).resolves.toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });
});
