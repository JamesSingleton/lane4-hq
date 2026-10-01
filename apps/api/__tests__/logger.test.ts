import { afterEach, describe, expect, it, vi } from "vitest";
import { runReadiness } from "../src/utils/health";
import { jsonLogger } from "../src/utils/logger";
import { testLogger } from "./fixtures";

describe("jsonLogger", () => {
  it("writes one JSON object per line, with errors spelled out", () => {
    const lines: string[] = [];
    const logger = jsonLogger((line) => lines.push(line));
    logger.info("request", { status: 200 });
    logger.warn("careful");
    logger.error("failed", { error: new TypeError("boom") });

    const [info, warn, error] = lines.map((l) => JSON.parse(l));
    expect(info).toMatchObject({
      level: "info",
      message: "request",
      status: 200,
    });
    expect(Date.parse(info.time)).not.toBeNaN();
    expect(warn).toMatchObject({ level: "warn", message: "careful" });
    expect(error.error).toMatchObject({ name: "TypeError", message: "boom" });
    expect(error.error.stack).toContain("TypeError");
  });

  it("writes to stdout by default", () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    jsonLogger().info("hello");
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/"hello"}\n$/));
    write.mockRestore();
  });
});

describe("runReadiness", () => {
  afterEach(() => vi.useRealTimers());

  it("fails a check that hangs", async () => {
    vi.useFakeTimers();
    const pending = runReadiness(
      { database: () => new Promise(() => {}) },
      testLogger(),
    );
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await pending).toEqual({
      ready: false,
      checks: { database: "failed" },
    });
  });
});
