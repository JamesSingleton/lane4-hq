/**
 * CTS "general form of transmission": `NUM (u16 LE) | DATA | DIC (u16 LE)`.
 *
 * NUM counts every byte in the packet (NUM + DATA + DIC). DIC is 0xFFFF minus
 * each byte of NUM and DATA, truncated to 16 bits.
 */

export const FRAME_OVERHEAD = 4;
/** Smallest packet the timer ever sends on purpose (one DATA byte). */
export const MIN_PACKET_BYTES = 5;
/** NUM is a u16, so DATA can never exceed this. */
export const MAX_DATA_BYTES = 0xffff - FRAME_OVERHEAD;

export class FrameError extends Error {
  constructor(
    message: string,
    readonly reason: "short" | "length" | "checksum" | "too-large",
  ) {
    super(message);
    this.name = "FrameError";
  }
}

/** Data integrity check over `bytes` (NUM + DATA). */
export function dic(bytes: Uint8Array): number {
  let sum = 0xffff;
  for (const byte of bytes) sum = (sum - byte) & 0xffff;
  return sum;
}

/** Wrap a command (or response) payload in NUM and DIC. */
export function encodeFrame(data: Uint8Array): Uint8Array {
  if (data.length === 0) {
    throw new FrameError("A packet needs at least one data byte.", "short");
  }
  if (data.length > MAX_DATA_BYTES) {
    throw new FrameError(
      "Packet is larger than NUM can describe.",
      "too-large",
    );
  }
  const total = data.length + FRAME_OVERHEAD;
  const packet = new Uint8Array(total);
  packet[0] = total & 0xff;
  packet[1] = total >> 8;
  packet.set(data, 2);
  const check = dic(packet.subarray(0, total - 2));
  packet[total - 2] = check & 0xff;
  packet[total - 1] = check >> 8;
  return packet;
}

/** Verify a complete packet and return its DATA bytes. */
export function decodeFrame(packet: Uint8Array): Uint8Array {
  if (packet.length < MIN_PACKET_BYTES) {
    throw new FrameError(
      `Packet is ${packet.length} bytes; the timer never sends fewer than ${MIN_PACKET_BYTES}.`,
      "short",
    );
  }
  const num = packet[0]! | (packet[1]! << 8);
  if (num !== packet.length) {
    throw new FrameError(
      `NUM says ${num} bytes but ${packet.length} arrived.`,
      "length",
    );
  }
  const expected = dic(packet.subarray(0, num - 2));
  const actual = packet[num - 2]! | (packet[num - 1]! << 8);
  if (expected !== actual) {
    throw new FrameError(
      `Checksum mismatch (expected ${hex16(expected)}, got ${hex16(actual)}).`,
      "checksum",
    );
  }
  return packet.slice(2, num - 2);
}

function hex16(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** `"05 00 57 A3 FF"` → bytes. Whitespace and commas are ignored. */
export function fromHex(text: string): Uint8Array {
  const clean = text.replace(/[\s,|]/g, "");
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error(`Not a hex byte string: "${text}"`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Bytes → `"05 00 57 A3 FF"`. */
export function toHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}
