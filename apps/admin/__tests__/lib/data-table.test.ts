import type { Column } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";
import { getColumnPinningStyle } from "../../lib/data-table";
import {
  type DataTableFeatures,
  dataTableFeatures,
} from "../../lib/data-table-features";

function mockColumn(partial: {
  pinned?: false | "start" | "end";
  lastStart?: boolean;
  firstEnd?: boolean;
  start?: number;
  after?: number;
  size?: number;
}): Column<DataTableFeatures, unknown> {
  return {
    id: "column",
    table: {
      store: {
        state: {
          columnPinning: {
            start:
              partial.pinned === "start" && partial.lastStart ? ["column"] : [],
            end: partial.pinned === "end" && partial.firstEnd ? ["column"] : [],
          },
        },
      },
    },
    getIsPinned: () => partial.pinned ?? false,
    getIsLastColumn: (side: string) =>
      side === "start" ? Boolean(partial.lastStart) : false,
    getIsFirstColumn: (side: string) =>
      side === "end" ? Boolean(partial.firstEnd) : false,
    getStart: () => partial.start ?? 0,
    getAfter: () => partial.after ?? 0,
    getSize: () => partial.size ?? 120,
  } as unknown as Column<DataTableFeatures, unknown>;
}

describe("data table features", () => {
  it("loads the shared table feature set", () => {
    expect(dataTableFeatures).toBeTruthy();
  });
});

describe("getColumnPinningStyle", () => {
  it("styles unpinned columns", () => {
    expect(getColumnPinningStyle({ column: mockColumn({}) })).toMatchObject({
      opacity: 1,
      position: "relative",
      width: 120,
    });
  });

  it("styles start-pinned columns with optional border", () => {
    const style = getColumnPinningStyle({
      column: mockColumn({ pinned: "start", lastStart: true, start: 40 }),
      withBorder: true,
    });
    expect(style.insetInlineStart).toBe("40px");
    expect(style.position).toBe("sticky");
    expect(style.boxShadow).toContain("inset");
  });

  it("styles end-pinned columns with optional border", () => {
    const style = getColumnPinningStyle({
      column: mockColumn({ pinned: "end", firstEnd: true, after: 16 }),
      withBorder: true,
    });
    expect(style.insetInlineEnd).toBe("16px");
    expect(style.boxShadow).toContain("inset");
  });

  it("uses no pinned ids when the border is on and the column is not pinned", () => {
    const style = getColumnPinningStyle({
      column: mockColumn({ pinned: false }),
      withBorder: true,
    });
    expect(style.boxShadow).toBeUndefined();
    expect(style.position).toBe("relative");
  });

  it("omits border shadow when withBorder is false", () => {
    const style = getColumnPinningStyle({
      column: mockColumn({ pinned: "start", lastStart: true }),
    });
    expect(style.boxShadow).toBeUndefined();
  });

  it("omits border shadow for pinned columns that are not edge-pinned", () => {
    const style = getColumnPinningStyle({
      column: mockColumn({ pinned: "start", lastStart: false }),
      withBorder: true,
    });
    expect(style.boxShadow).toBeUndefined();
    expect(style.insetInlineStart).toBe("0px");
  });
});

// silence unused if tree-shaken
void vi;
