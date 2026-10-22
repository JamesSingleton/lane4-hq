/** Browser URL that opens a coach account on the coach app. */
export function supportHandoffUrl(
  adminBase: string,
  token: string,
): string | null {
  const base = adminBase.trim().replace(/\/$/, "");
  const trimmed = token.trim();
  if (!base || !trimmed) return null;
  return `${base}/support/handoff?token=${encodeURIComponent(trimmed)}`;
}

export function handoffIsOpen(
  row: { usedAt: Date | null; expiresAt: Date },
  now: Date,
): boolean {
  return row.usedAt === null && row.expiresAt.getTime() > now.getTime();
}
