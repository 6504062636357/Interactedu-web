export interface PlusPlanDetails {
  durationMonths: 1 | 12;
  startsAt: string;
  expiresAt: string;
}

export function selectPlusPlans(rows: PlusPlanDetails[], now: Date = new Date()): {
  current: PlusPlanDetails | null;
  upcoming: PlusPlanDetails | null;
} {
  const nowMs = now.getTime();
  const valid = rows.filter((row) => new Date(row.expiresAt).getTime() > nowMs);
  const current = valid
    .filter((row) => new Date(row.startsAt).getTime() <= nowMs)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())[0] ?? null;
  const upcoming = valid
    .filter((row) => new Date(row.startsAt).getTime() > nowMs)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0] ?? null;
  return { current, upcoming };
}
