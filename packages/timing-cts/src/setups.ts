/** Decoders for the read-setups structures Gen7 supports (`Rg`, `Ri`, `Rr`). */

export type PoolSetup = {
  reverseLanes: boolean;
  /** 6, 8, or 10. */
  lanesInPool: number;
  farEndSplits: boolean;
  course: "short" | "long";
  units: "yards" | "meters";
};

export type SplitsSetup = {
  cumulativeSplits: boolean;
  byLapSplits: boolean;
};

function need(data: Uint8Array, bytes: number, what: string): void {
  if (data.length < bytes) {
    throw new RangeError(`${what} needs ${bytes} bytes, got ${data.length}.`);
  }
}

export function decodePoolSetup(data: Uint8Array): PoolSetup {
  need(data, 5, "Pool setup");
  return {
    reverseLanes: data[0] !== 0,
    lanesInPool: data[1]!,
    farEndSplits: data[2] !== 0,
    course: data[3] ? "long" : "short",
    units: data[4] ? "meters" : "yards",
  };
}

export function encodePoolSetup(setup: PoolSetup): Uint8Array {
  return Uint8Array.of(
    setup.reverseLanes ? 1 : 0,
    setup.lanesInPool,
    setup.farEndSplits ? 1 : 0,
    setup.course === "long" ? 1 : 0,
    setup.units === "meters" ? 1 : 0,
  );
}

export function decodeSplitsSetup(data: Uint8Array): SplitsSetup {
  need(data, 2, "Splits setup");
  return { cumulativeSplits: data[0] !== 0, byLapSplits: data[1] !== 0 };
}

export function encodeSplitsSetup(setup: SplitsSetup): Uint8Array {
  return Uint8Array.of(
    setup.cumulativeSplits ? 1 : 0,
    setup.byLapSplits ? 1 : 0,
  );
}

/** Pool course as a Lane4 course code. */
export function poolCourse(setup: PoolSetup): "SCY" | "SCM" | "LCM" {
  if (setup.course === "long") return "LCM";
  return setup.units === "meters" ? "SCM" : "SCY";
}
