import type { HeatPublication as EngineHeatPublication } from "@lane4hq/meet-engine/publish";
import { describe, expect, it } from "vitest";
import { HeatPublication } from "../src/schemas/heat-publication";
import { samplePublication } from "./fixtures";

describe("heat publication contract", () => {
  it("accepts what the desktop meet manager sends", () => {
    const pub: EngineHeatPublication = samplePublication();
    const parsed = HeatPublication.safeParse(JSON.parse(JSON.stringify(pub)));
    expect(parsed.error).toBeUndefined();
    expect(parsed.data?.lanes).toHaveLength(pub.lanes.length);
  });

  it("rejects a different schema version", () => {
    const pub = { ...samplePublication(), schema: "lane4.heat-results/v2" };
    expect(HeatPublication.safeParse(pub).success).toBe(false);
  });
});
