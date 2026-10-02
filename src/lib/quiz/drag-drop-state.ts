/**
 * state ของ UI เติมคำแบบลาก-วาง (pure functions — ใช้ทั้งตอนลาก, แตะ และคีย์บอร์ด)
 * placements: blank_id -> word_id (เฉพาะช่องที่เติมแล้ว ช่องว่างไม่มี key)
 */
export type Placements = Record<string, string>;

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** ช่องที่ถือคำนี้อยู่ (ถ้ามี) */
export function blankHoldingWord(placements: Placements, wordId: string): string | null {
  for (const blankId of Object.keys(placements)) if (placements[blankId] === wordId) return blankId;
  return null;
}

/**
 * วางคำลงช่อง: ถ้าคำอยู่ช่องอื่นอยู่แล้ว = ย้าย, ถ้าช่องปลายทางมีคำอื่น = สลับ (ถ้าคำมาจากช่อง)
 * หรือคืนคำเดิมกลับคลัง (ถ้าคำมาจากคลัง)
 */
export function moveWord(placements: Placements, wordId: string, targetBlankId: string): Placements {
  const from = blankHoldingWord(placements, wordId);
  if (from === targetBlankId) return placements;
  const displaced = has(placements, targetBlankId) ? placements[targetBlankId] : null;
  const next: Placements = { ...placements };
  if (from) delete next[from];
  next[targetBlankId] = wordId;
  if (from && displaced) next[from] = displaced;
  return next;
}

/** เอาคำออกจากช่อง (คืนกลับคลัง) */
export function clearBlank(placements: Placements, blankId: string): Placements {
  if (!has(placements, blankId)) return placements;
  const next = { ...placements };
  delete next[blankId];
  return next;
}

/** ช่องว่างช่องแรกที่ยังไม่ได้เติม */
export function firstEmptyBlank(blankIds: string[], placements: Placements): string | null {
  return blankIds.find((id) => !has(placements, id)) ?? null;
}

/** แตะคำในคลัง: ใส่ช่องที่เลือกไว้ (ถ้าว่าง) ไม่งั้นใส่ช่องว่างช่องแรก — ไม่มีช่องว่างเหลือ = ไม่ทำอะไร */
export function tapWord(
  blankIds: string[],
  placements: Placements,
  wordId: string,
  activeBlankId: string | null
): Placements {
  if (blankHoldingWord(placements, wordId)) return placements;
  const target =
    activeBlankId && blankIds.includes(activeBlankId) && !has(placements, activeBlankId)
      ? activeBlankId
      : firstEmptyBlank(blankIds, placements);
  return target ? moveWord(placements, wordId, target) : placements;
}

export function isComplete(blankIds: string[], placements: Placements): boolean {
  return blankIds.length > 0 && blankIds.every((id) => has(placements, id));
}

/** คำในคลังที่ยังไม่ถูกวาง (ลำดับตามคลังเดิม) */
export function unusedWords<T extends { id: string }>(words: T[], placements: Placements): T[] {
  const used = new Set(Object.values(placements));
  return words.filter((w) => !used.has(w.id));
}

/** ตัด key/ค่าที่ไม่อยู่ในโจทย์ออก ก่อนส่งให้ server */
export function sanitizePlacements(blankIds: string[], wordIds: string[], placements: Placements): Placements {
  const words = new Set(wordIds);
  const out: Placements = {};
  for (const b of blankIds) {
    if (has(placements, b) && words.has(placements[b])) out[b] = placements[b];
  }
  return out;
}
