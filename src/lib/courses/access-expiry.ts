const DAY_MS = 24 * 60 * 60 * 1000;

export function formatRemainingAccess(expiresAt: string, now: Date = new Date()): string | null {
  const remainingMs = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(remainingMs)) return null;
  if (remainingMs <= 0) return "หมดอายุแล้ว";
  if (remainingMs < DAY_MS) return "เหลือไม่ถึง 1 วัน";
  return `เหลืออีก ${Math.ceil(remainingMs / DAY_MS)} วัน`;
}
