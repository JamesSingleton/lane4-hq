import { describe, expect, it } from "vitest";
import {
  decodeFrame,
  dic,
  encodeFrame,
  FrameError,
  fromHex,
  MAX_DATA_BYTES,
  toHex,
} from "../src/frame";

/** Golden vectors from CTS F397 Rev. F, pages 13 and 16–18. */
const VENDOR_VECTORS = [
  { what: "W (who are you)", data: "57", packet: "05 00 57 A3 FF" },
  { what: "S (swim data)", data: "53", packet: "05 00 53 A7 FF" },
  { what: "ACK", data: "06 00", packet: "06 00 06 00 F3 FF" },
  { what: "Rr response (sequence 7)", data: "07", packet: "05 00 07 F3 FF" },
];

describe("frame", () => {
  it.each(VENDOR_VECTORS)("encodes $what", ({ data, packet }) => {
    expect(toHex(encodeFrame(fromHex(data)))).toBe(packet);
  });

  it.each(VENDOR_VECTORS)("decodes $what", ({ data, packet }) => {
    expect(toHex(decodeFrame(fromHex(packet)))).toBe(data);
  });

  it("computes DIC by subtracting every byte from 0xFFFF", () => {
    expect(dic(fromHex("05 00 57"))).toBe(0xffa3);
    expect(dic(new Uint8Array(300).fill(0xff))).toBe(
      (0xffff - 300 * 0xff) & 0xffff,
    );
  });

  it("round-trips a long payload with a two-byte NUM", () => {
    const data = Uint8Array.from({ length: 400 }, (_, i) => i & 0xff);
    const packet = encodeFrame(data);
    expect(packet[0]).toBe(404 & 0xff);
    expect(packet[1]).toBe(404 >> 8);
    expect(decodeFrame(packet)).toEqual(data);
  });

  it("rejects empty and oversized payloads", () => {
    expect(() => encodeFrame(new Uint8Array())).toThrow(FrameError);
    expect(() => encodeFrame(new Uint8Array(MAX_DATA_BYTES + 1))).toThrow(
      /larger/,
    );
  });

  it("rejects short packets, bad lengths, and bad checksums", () => {
    const short = () => decodeFrame(fromHex("04 00 A3 FF"));
    expect(short).toThrow(FrameError);
    try {
      short();
    } catch (e) {
      expect((e as FrameError).reason).toBe("short");
    }
    expect(() => decodeFrame(fromHex("06 00 57 A3 FF"))).toThrow(/NUM says 6/);
    expect(() => decodeFrame(fromHex("05 00 57 A4 FF"))).toThrow(
      /expected 0xFFA3, got 0xFFA4/,
    );
  });

  it("parses hex with separators and rejects junk", () => {
    expect(toHex(fromHex("05,00|57 a3ff"))).toBe("05 00 57 A3 FF");
    expect(() => fromHex("0")).toThrow(/Not a hex/);
    expect(() => fromHex("zz")).toThrow(/Not a hex/);
  });
});
