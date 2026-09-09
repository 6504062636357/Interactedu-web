"use client";

import { useMemo, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { submitCourseReview } from "@/app/courses/[slug]/review-actions";
import { REVIEW_TAGS, type ReviewTagKey } from "@/app/courses/[slug]/review-constants";

export interface CourseReviewItem {
  id: string;
  rating: number;
  meetsExpectation: boolean;
  likedTags: string[];
  comment: string | null;
  createdAt: string;
  studentId: string;
  studentName: string;
  studentAvatarUrl: string | null;
}

interface CourseReviewsProps {
  courseId: string;
  slug: string;
  reviews: CourseReviewItem[];
  canReview: boolean;
  currentUserId: string | null;
}

type SortMode = "newest" | "highest" | "lowest";

function Stars({ value, size = 16 }: { value: number; size?: number }): ReactElement {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} จาก 5 ดาว`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fillPct = Math.max(0, Math.min(1, value - (star - 1))) * 100;
        return (
          <span key={star} className="relative inline-block" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="absolute inset-0">
              <path
                d="M12 2.5l2.9 6.2 6.7.7-5 4.6 1.4 6.6L12 17.6 6 20.6l1.4-6.6-5-4.6 6.7-.7L12 2.5z"
                fill="#E9E5FA"
              />
            </svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fillPct}%` }}>
              <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2.5l2.9 6.2 6.7.7-5 4.6 1.4 6.6L12 17.6 6 20.6l1.4-6.6-5-4.6 6.7-.7L12 2.5z"
                  fill="#FFB020"
                />
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (next: number) => void }): ReactElement {
  return (
    <span className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          aria-label={`ให้ ${star} ดาว`}
          className="p-0.5"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2.5l2.9 6.2 6.7.7-5 4.6 1.4 6.6L12 17.6 6 20.6l1.4-6.6-5-4.6 6.7-.7L12 2.5z"
              fill={star <= value ? "#FFB020" : "#E9E5FA"}
            />
          </svg>
        </button>
      ))}
    </span>
  );
}

function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

function ReviewForm({
  courseId,
  slug,
  existingReview,
}: {
  courseId: string;
  slug: string;
  existingReview: CourseReviewItem | null;
}): ReactElement {
  const router = useRouter();
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 0);
  const [meetsExpectation, setMeetsExpectation] = useState<boolean>(existingReview?.meetsExpectation ?? true);
  const [likedTags, setLikedTags] = useState<string[]>(existingReview?.likedTags ?? []);
  const [comment, setComment] = useState<string>(existingReview?.comment ?? "");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  function toggleTag(tag: ReviewTagKey): void {
    setLikedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit(): Promise<void> {
    if (rating < 1) {
      setError("กรุณาเลือกจำนวนดาวก่อนส่งรีวิว");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const result = await submitCourseReview({ courseId, slug, rating, meetsExpectation, likedTags, comment });

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <div className="mb-8 rounded-2xl border border-[#0F1B3D]/[0.08] bg-[#F8F9FB] p-5 sm:p-6">
      <p className="text-[14px] font-extrabold text-[#0F1B3D] mb-4">
        {existingReview ? "แก้ไขรีวิวของคุณ" : "รีวิวคอร์สนี้"}
      </p>

      <div className="mb-4">
        <p className="text-[12px] font-bold text-[#0F1B3D]/50 mb-2">ให้คะแนน</p>
        <StarPicker value={rating} onChange={setRating} />
      </div>

      <div className="mb-4">
        <p className="text-[12px] font-bold text-[#0F1B3D]/50 mb-2">คอร์สนี้ตรงตามที่คาดหวังไหม</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMeetsExpectation(true)}
            className={`rounded-full px-4 py-2 text-[12.5px] font-bold transition ${
              meetsExpectation
                ? "bg-[#00B37E] text-white"
                : "bg-white text-[#0F1B3D]/50 ring-1 ring-[#0F1B3D]/10"
            }`}
          >
            ตรงตามความคาดหวัง
          </button>
          <button
            type="button"
            onClick={() => setMeetsExpectation(false)}
            className={`rounded-full px-4 py-2 text-[12.5px] font-bold transition ${
              !meetsExpectation
                ? "bg-[#0F1B3D] text-white"
                : "bg-white text-[#0F1B3D]/50 ring-1 ring-[#0F1B3D]/10"
            }`}
          >
            ยังไม่ตรงเท่าไหร่
          </button>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[12px] font-bold text-[#0F1B3D]/50 mb-2">สิ่งที่ชอบมากที่สุด (เลือกได้หลายข้อ)</p>
        <div className="flex flex-wrap gap-2">
          {REVIEW_TAGS.map((tag) => (
            <button
              key={tag.key}
              type="button"
              onClick={() => toggleTag(tag.key)}
              className={`rounded-full px-4 py-2 text-[12.5px] font-bold transition ${
                likedTags.includes(tag.key)
                  ? "bg-[#FF5A3C] text-white"
                  : "bg-white text-[#0F1B3D]/50 ring-1 ring-[#0F1B3D]/10"
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[12px] font-bold text-[#0F1B3D]/50 mb-2">ความคิดเห็นเพิ่มเติม (ไม่บังคับ)</p>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="เล่าประสบการณ์เรียนคอร์สนี้ให้เพื่อนๆ ฟังหน่อย"
          className="w-full resize-y rounded-xl border border-[#0F1B3D]/[0.1] bg-white px-3.5 py-2.5 text-[13.5px] text-[#0F1B3D] outline-none transition focus:border-[#0F1B3D]/25"
        />
      </div>

      {error && <p className="mb-3 text-[12.5px] font-semibold text-red-500">{error}</p>}
      {success && !error && (
        <p className="mb-3 text-[12.5px] font-semibold text-[#00B37E]">บันทึกรีวิวเรียบร้อยแล้ว ขอบคุณครับ</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FF5A3C] px-6 py-3 text-[13.5px] font-bold text-white transition hover:bg-[#EB4A2D] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "กำลังบันทึก..." : existingReview ? "อัปเดตรีวิว" : "ส่งรีวิว"}
      </button>
    </div>
  );
}

export default function CourseReviews({
  courseId,
  slug,
  reviews,
  canReview,
  currentUserId,
}: CourseReviewsProps): ReactElement {
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;
  const meetsExpectationPercent =
    reviewCount > 0
      ? Math.round((reviews.filter((r) => r.meetsExpectation).length / reviewCount) * 100)
      : 0;

  const tagStats = useMemo(() => {
    return REVIEW_TAGS.map((tag) => {
      const count = reviews.filter((r) => r.likedTags.includes(tag.key)).length;
      const percent = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;
      return { ...tag, percent };
    }).sort((a, b) => b.percent - a.percent);
  }, [reviews, reviewCount]);

  const sortedReviews = useMemo(() => {
    const copy = [...reviews];
    if (sortMode === "highest") return copy.sort((a, b) => b.rating - a.rating);
    if (sortMode === "lowest") return copy.sort((a, b) => a.rating - b.rating);
    return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [reviews, sortMode]);

  const existingReview = currentUserId ? reviews.find((r) => r.studentId === currentUserId) ?? null : null;

  return (
    <section className="mt-10 rounded-3xl bg-white border border-[#0F1B3D]/[0.06] p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-[19px] font-extrabold text-[#0F1B3D]">รีวิวจากผู้เรียน</h2>
        {reviewCount > 0 && (
          <div className="flex items-center gap-2">
            <Stars value={avgRating} size={18} />
            <span className="text-[16px] font-extrabold text-[#0F1B3D]">{avgRating.toFixed(1)}</span>
            <span className="text-[12.5px] text-[#0F1B3D]/40 font-medium">({reviewCount} รีวิว)</span>
          </div>
        )}
      </div>

      {reviewCount > 0 && (
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <div className="rounded-2xl bg-[#F7F8FA] p-5">
            <p className="text-[12.5px] font-bold text-[#0F1B3D]/50 mb-2">ความคาดหวังของผู้เรียน</p>
            <p className="text-[28px] font-extrabold text-[#0F1B3D]">{meetsExpectationPercent}%</p>
            <p className="mt-1 text-[12px] text-[#0F1B3D]/40 font-medium">
              ของรีวิวบอกว่าคอร์สนี้ตรงตามความคาดหวัง
            </p>
          </div>
          <div className="rounded-2xl bg-[#F7F8FA] p-5">
            <p className="text-[12.5px] font-bold text-[#0F1B3D]/50 mb-3">สิ่งที่ผู้เรียนชอบมากที่สุด</p>
            <div className="space-y-2.5">
              {tagStats.map((tag) => (
                <div key={tag.key} className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] font-semibold text-[#0F1B3D]/70">{tag.label}</span>
                  <span className="text-[12.5px] font-bold text-[#0F1B3D]">{tag.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {canReview && <ReviewForm courseId={courseId} slug={slug} existingReview={existingReview} />}

      {reviewCount === 0 ? (
        <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีรีวิวสำหรับคอร์สนี้ เป็นคนแรกที่รีวิวสิ!</p>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[13.5px] font-bold text-[#0F1B3D]">ความคิดเห็น ({reviewCount})</p>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="rounded-full border border-[#0F1B3D]/10 bg-white px-3.5 py-2 text-[12px] font-semibold text-[#0F1B3D]/70 outline-none"
            >
              <option value="newest">ล่าสุด</option>
              <option value="highest">คะแนนสูงสุด</option>
              <option value="lowest">คะแนนต่ำสุด</option>
            </select>
          </div>

          <div className="divide-y divide-[#0F1B3D]/[0.06]">
            {sortedReviews.map((review) => (
              <article key={review.id} className="py-5 first:pt-0">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0F1B3D]/10 text-[13px] font-bold text-[#0F1B3D]/60">
                    {review.studentAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={review.studentAvatarUrl} alt={review.studentName} className="h-full w-full object-cover" />
                    ) : (
                      review.studentName.trim().charAt(0).toUpperCase() || "?"
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13.5px] font-bold text-[#0F1B3D]">{review.studentName}</p>
                      <Stars value={review.rating} size={13} />
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-[#0F1B3D]/35 font-medium">
                      {formatReviewDate(review.createdAt)}
                    </p>
                    {review.comment && (
                      <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#0F1B3D]/70 whitespace-pre-line">
                        {review.comment}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}