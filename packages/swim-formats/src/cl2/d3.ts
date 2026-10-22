/**
 * CL2/SDIF D3 individual-info record.
 *
 * Column layout is the SDIF v3 D3 record as documented by tunas
 * (https://github.com/ajoe2/tunas/blob/main/docs/formats/cl2_format.md):
 * cols 3–16 USS#, 17–31 preferred first name, 32–33 ethnicity, and
 * yes/no flags from col 34. Maricopa entry files confirm the flag
 * region (a run of `F` starting at col 34) and a one-character
 * ethnicity at col 32; their USS# and preferred-name fields are blank.
 */
export interface Cl2D3Fields {
  usaMemberId?: string;
  preferredName?: string;
  ethnicity?: string;
  registrationFlags?: string;
}

export function parseCl2D3Fields(line: string): Cl2D3Fields {
  const usaMemberId = line.slice(2, 16).trim() || undefined;
  const preferredName = line.slice(16, 31).trim() || undefined;
  const ethnicity = line.slice(31, 33).trim() || undefined;
  const registrationFlags = line.slice(33, 156).trim() || undefined;
  return { usaMemberId, preferredName, ethnicity, registrationFlags };
}
