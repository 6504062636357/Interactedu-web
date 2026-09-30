export function formatStudyTime(seconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  if (seconds > 0 && totalMinutes === 0) return `${Math.floor(seconds)} วินาที`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} นาที`;
  return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
}

export function formatCourseVideoDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return formatStudyTime(Math.ceil(seconds / 60) * 60);
}
