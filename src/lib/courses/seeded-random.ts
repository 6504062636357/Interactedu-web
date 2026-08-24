import "server-only";

// Deterministic PRNG (mulberry32) — seed เดียวกันให้ผลลัพธ์เดียวกันเสมอ
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hash string (เช่น enrollment_id) เป็น 32-bit int สำหรับใช้เป็น seed
export function seedFromString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return hash;
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// สุ่มเลือก n รายการจาก pool แบบ deterministic (ใช้ shuffle แล้วตัด)
export function seededSample<T>(pool: T[], count: number, seed: number): T[] {
  return seededShuffle(pool, seed).slice(0, count);
}