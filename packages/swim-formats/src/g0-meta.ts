const ROUND_FROM_CODE = {
  P: "prelim",
  F: "finals",
  S: "swimoff",
} as const;

type RoundCode = keyof typeof ROUND_FROM_CODE;

function roundFromCode(
  code: string,
): "prelim" | "finals" | "swimoff" | undefined {
  return ROUND_FROM_CODE[code as RoundCode];
}

/** Championship round from Hy-Tek CL2 trailing markers or SDIF G0 column. */
export function parseResultRoundType(
  line: string,
): "prelim" | "finals" | "swimoff" | undefined {
  const trailing = line.match(/(?<![.\d])([PFS])(?:\s+(?:N\d{2}\s*)?)?$/);
  if (trailing?.[1]) {
    return roundFromCode(trailing[1]);
  }

  // SDIF G0 column 144 is the prelims/finals/swim-off code.
  if (line.length >= 144) {
    const fromSpec = roundFromCode(line.charAt(143).toUpperCase());
    if (fromSpec) return fromSpec;
  }

  const col = line.substring(115, 116).trim().toUpperCase();
  return roundFromCode(col);
}

/** Heat/lane from SDIF-style G0 fixed columns when present. */
export function parseSdifHeatLane(line: string): {
  heat?: number;
  lane?: number;
} {
  const heat =
    Number.parseInt(line.substring(93, 96).trim(), 10) ||
    Number.parseInt(line.substring(100, 103).trim(), 10);
  const lane =
    Number.parseInt(line.substring(96, 99).trim(), 10) ||
    Number.parseInt(line.substring(103, 106).trim(), 10);
  return {
    heat: Number.isFinite(heat) && heat > 0 ? heat : undefined,
    lane: Number.isFinite(lane) && lane > 0 ? lane : undefined,
  };
}

export function resultRoundCode(
  resultType: "prelim" | "finals" | "swimoff" | undefined,
): string {
  if (resultType === "prelim") return "P";
  if (resultType === "swimoff") return "S";
  if (resultType === "finals") return "F";
  return "";
}

/** Hy-Tek CL2 G0 lines often end with a spaced P/F/S before the N## checksum. */
export function cl2G0RoundSuffix(
  resultType: "prelim" | "finals" | "swimoff" | undefined,
): string {
  const code = resultRoundCode(resultType);
  if (!code) return "";
  return `                                                                ${code}             N00`;
}
