import { describe, expect, it } from "vitest";
import {
  formatTime,
  formatTypedSwimTime,
  isFasterTime,
  parseTime,
} from "../src/times";

describe("parseTime", () => {
  it("returns 0 for empty input", () => {
    expect(parseTime("")).toBe(0);
    expect(parseTime("   ")).toBe(0);
  });

  it("parses bare seconds", () => {
    expect(parseTime("23.45")).toBe(23450);
    expect(parseTime("59.12")).toBe(59120);
  });

  it("parses mm:ss", () => {
    expect(parseTime("1:23.45")).toBe(83450);
  });

  it("parses times without hundredths", () => {
    expect(parseTime("2:39")).toBe(159_000);
    expect(parseTime("1:02")).toBe(62_000);
    expect(parseTime("58")).toBe(58_000);
  });

  it("parses hh:mm:ss and bare minutes", () => {
    expect(parseTime("1:02:03.50")).toBe(3723500);
    expect(parseTime("2:03.50")).toBe(123500);
  });
});

describe("formatTypedSwimTime", () => {
  it("fills hundredths from the right", () => {
    expect(formatTypedSwimTime("")).toBe("");
    expect(formatTypedSwimTime("abc")).toBe("");
    expect(formatTypedSwimTime("2")).toBe("2");
    expect(formatTypedSwimTime("23")).toBe("23");
    expect(formatTypedSwimTime("237")).toBe("2.37");
    expect(formatTypedSwimTime("2375")).toBe("23.75");
    expect(formatTypedSwimTime("23752")).toBe("2:37.52");
    expect(formatTypedSwimTime("5234")).toBe("52.34");
    expect(formatTypedSwimTime("123456")).toBe("12:34.56");
    expect(formatTypedSwimTime("1234567")).toBe("1:23:45.67");
    expect(formatTypedSwimTime("2:37.52")).toBe("2:37.52");
    expect(formatTypedSwimTime("12a3b45678")).toBe("1:23:45.67");
  });
});

describe("formatTime", () => {
  it("returns NT for zero or negative", () => {
    expect(formatTime(0)).toBe("NT");
    expect(formatTime(-100)).toBe("NT");
  });

  it("formats under 60 seconds", () => {
    expect(formatTime(23450)).toBe("23.45");
  });

  it("formats 60 seconds or more", () => {
    expect(formatTime(83450)).toBe("1:23.45");
  });
});

describe("isFasterTime", () => {
  it("compares swim times", () => {
    expect(isFasterTime(0, 1000)).toBe(false);
    expect(isFasterTime(1000, 0)).toBe(true);
    expect(isFasterTime(500, 600)).toBe(true);
    expect(isFasterTime(600, 500)).toBe(false);
  });
});
