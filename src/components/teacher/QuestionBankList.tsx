"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { deleteQuestionBankItem } from "@/app/dashboard/teacher/question-bank/actions";

interface QuestionBankRow {
  id: string;
  questionText: string;
  category: string | null;
  difficulty: "easy" | "medium" | "hard";
  usageType: "popup" | "final";
  privacyScope: "private" | "department" | "public";
  isOwner: boolean;
  topicLabel: string;
}

const DIFFICULTY_LABEL: Record<string, string> = { easy: "ง่าย", medium: "ปานกลาง", hard: "ยาก" };
const SCOPE_LABEL: Record<string, string> = { private: "ส่วนตัว", department: "หมวดวิชา", public: "สาธารณะ" };
const USAGE_LABEL: Record<string, string> = { popup: "Pop-up", final: "Final Exam" };
const UNCATEGORIZED = "ไม่ระบุหมวดหมู่";

const SCOPE_BADGE_CLASS: Record<string, string> = {
  private: "bg-slate-100 text-slate-600",
  department: "bg-blue-50 text-blue-700",
  public: "bg-emerald-50 text-emerald-700",
};

const USAGE_BADGE_CLASS: Record<string, string> = {
  popup: "bg-violet-50 text-violet-700",
  final: "bg-orange-50 text-orange-700",
};

// ★ เพิ่มใหม่ (UI เท่านั้น): ให้ระดับความยากมีสีบอกสถานะ อ่านตาไวขึ้นแทนสีเทาเดียวเหมือนเดิม
const DIFFICULTY_BADGE_CLASS: Record<string, string> = {
  easy: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  hard: "bg-red-50 text-red-600",
};

const PAGE_SIZE = 15;

export default function QuestionBankList({ questions }: { questions: QuestionBankRow[] }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const folders = useMemo(() => {
    const map = new Map<string, QuestionBankRow[]>();
    for (const question of questions) {
      const key = question.category ?? UNCATEGORIZED;
      const list = map.get(key) ?? [];
      list.push(question);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([category, items]) => ({ category, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [questions]);

  if (activeCategory === null) {
    return <FolderGrid folders={folders} onSelect={setActiveCategory} />;
  }

  const folder = folders.find((f) => f.category === activeCategory);
  return (
    <CategoryQuestionList
      category={activeCategory}
      questions={folder?.items ?? []}
      onBack={() => setActiveCategory(null)}
    />
  );
}

function FolderGrid({
  folders,
  onSelect,
}: {
  folders: { category: string; items: QuestionBankRow[] }[];
  onSelect: (category: string) => void;
}) {
  // ★ แก้ UI: ปรับ empty state และการ์ดโฟลเดอร์ให้ดูมีมิติ/จริงจังขึ้น (ยกตัวตอน hover,
  // ไอคอนลูกศรบอกว่ากดเข้าไปได้) — ตรรกะการเลือกหมวดหมู่เหมือนเดิมทุกอย่าง
  if (folders.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[#0F1B3D]/15 bg-[#0F1B3D]/[0.015] px-6 py-16 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0F1B3D]/[0.05] text-[22px]">
          📭
        </div>
        <p className="text-[13.5px] font-medium text-[#0F1B3D]/50">ยังไม่มีคำถามในคลังข้อสอบ</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {folders.map(({ category, items }) => (
        <button
          key={category}
          type="button"
          onClick={() => onSelect(category)}
          className="group flex flex-col items-start gap-4 rounded-3xl border border-[#0F1B3D]/[0.07] bg-white p-6 text-left shadow-[0_1px_2px_rgba(15,27,61,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-[#FF5A3C]/30 hover:shadow-[0_20px_40px_-20px_rgba(15,27,61,0.22)]"
        >
          <div className="flex w-full items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF5A3C]/10 text-[20px] transition-colors group-hover:bg-[#FF5A3C]/15">
              📁
            </div>
            <span className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#0F1B3D]/[0.04] text-[#0F1B3D]/30 transition-all group-hover:translate-x-0.5 group-hover:bg-[#FF5A3C]/10 group-hover:text-[#FF5A3C]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </div>
          <div>
            <p className="text-[15px] font-extrabold text-[#0F1B3D]">{category}</p>
            <p className="mt-0.5 text-[12.5px] font-semibold text-[#0F1B3D]/45">{items.length} ข้อ</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function CategoryQuestionList({
  category,
  questions,
  onBack,
}: {
  category: string;
  questions: QuestionBankRow[];
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [usageFilter, setUsageFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return questions.filter((question) => {
      if (difficultyFilter !== "all" && question.difficulty !== difficultyFilter) return false;
      if (usageFilter !== "all" && question.usageType !== usageFilter) return false;
      if (scopeFilter !== "all" && question.privacyScope !== scopeFilter) return false;
      if (keyword && !question.questionText.toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [questions, difficultyFilter, usageFilter, scopeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectableOnPage = paged.filter((q) => q.isOwner);
  const allOnPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((q) => selectedIds.has(q.id));

  function resetPageFilters(mutator: () => void) {
    mutator();
    setPage(1);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const q of selectableOnPage) next.delete(q.id);
      } else {
        for (const q of selectableOnPage) next.add(q.id);
      }
      return next;
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("ลบคำถามนี้ออกจากคลังหรือไม่? การลบไม่มีผลย้อนหลังกับข้อสอบที่ถูกคัดลอกไปใช้แล้ว")) return;
    setDeletingId(id);
    setError(null);
    const result = await deleteQuestionBankItem(id);
    setDeletingId(null);
    if (result.error) setError(result.error);
    else setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`ลบคำถามที่เลือกไว้ ${selectedIds.size} ข้อออกจากคลังหรือไม่? การลบไม่มีผลย้อนหลังกับข้อสอบที่ถูกคัดลอกไปใช้แล้ว`)) return;
    setBulkDeleting(true);
    setError(null);
    const ids = [...selectedIds];
    const results = await Promise.all(ids.map((id) => deleteQuestionBankItem(id)));
    setBulkDeleting(false);
    const failed = results.some((r) => r.error);
    if (failed) setError("ลบบางรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    setSelectedIds(new Set());
  }

  // ★ แก้ UI: field/การ์ดหน้านี้เดิมใช้ border บางๆ ล้วน ปรับให้มีพื้นหลังจางๆ + โฟกัสชัดขึ้น
  // และห่อแถบค้นหา/ตัวกรองไว้ในกล่องเดียวให้ดูเป็นส่วนควบคุมที่จริงจัง (ตรรกะ filter เดิมทุกอย่าง)
  const selectClass =
    "rounded-xl border border-[#0F1B3D]/10 bg-[#F8FAFC] px-3.5 py-2.5 text-[13px] font-medium text-[#0F1B3D] outline-none transition-colors focus:border-[#FF5A3C]/50 focus:bg-white";

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#0F1B3D]/50 transition-colors hover:text-[#0F1B3D]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        กลับไปหมวดหมู่ทั้งหมด
      </button>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[17px] font-extrabold text-[#0F1B3D]">{category}</h2>
        <span className="rounded-full bg-[#0F1B3D]/[0.05] px-2.5 py-1 text-[12px] font-bold text-[#0F1B3D]/50">{filtered.length} ข้อ</span>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#0F1B3D]/[0.06] bg-[#0F1B3D]/[0.015] p-3">
        <input
          type="text"
          value={search}
          onChange={(e) => resetPageFilters(() => setSearch(e.target.value))}
          placeholder="ค้นหาคำถาม..."
          className="min-w-[200px] flex-1 rounded-xl border border-[#0F1B3D]/10 bg-[#F8FAFC] px-3.5 py-2.5 text-[13px] font-medium text-[#0F1B3D] outline-none transition-colors placeholder:text-[#0F1B3D]/35 focus:border-[#FF5A3C]/50 focus:bg-white"
        />
        <select value={difficultyFilter} onChange={(e) => resetPageFilters(() => setDifficultyFilter(e.target.value))} className={selectClass}>
          <option value="all">ทุกระดับความยาก</option>
          <option value="easy">ง่าย</option>
          <option value="medium">ปานกลาง</option>
          <option value="hard">ยาก</option>
        </select>
        <select value={usageFilter} onChange={(e) => resetPageFilters(() => setUsageFilter(e.target.value))} className={selectClass}>
          <option value="all">ทุกประเภทการใช้งาน</option>
          <option value="popup">Pop-up Quiz</option>
          <option value="final">Final Exam</option>
        </select>
        {/* <select value={scopeFilter} onChange={(e) => resetPageFilters(() => setScopeFilter(e.target.value))} className={selectClass}>
          <option value="all">ทุกสิทธิ์การเข้าถึง</option>
          <option value="private">ส่วนตัว</option>
          <option value="department">หมวดวิชา</option>
          <option value="public">สาธารณะ</option>
        </select> */}
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-[#0F1B3D]/[0.08] bg-[#0F1B3D]/[0.03] px-4 py-3">
          <span className="text-[13px] font-semibold text-[#0F1B3D]">เลือกไว้ {selectedIds.size} ข้อ</span>
          <button
            type="button"
            disabled={bulkDeleting}
            onClick={handleBulkDelete}
            className="rounded-full border border-red-200 px-3.5 py-1.5 text-[12.5px] font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {bulkDeleting ? "กำลังลบ..." : "ลบที่เลือกทั้งหมด"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#0F1B3D]/15 bg-[#0F1B3D]/[0.015] px-6 py-16 text-center">
          <p className="text-[13.5px] font-medium text-[#0F1B3D]/50">ไม่พบคำถามตามเงื่อนไขที่เลือก</p>
        </div>
      ) : (
        <>
          <div className="mb-2.5 flex items-center gap-2 px-1">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleSelectAllOnPage}
              disabled={selectableOnPage.length === 0}
              className="h-4 w-4 rounded border-[#0F1B3D]/20 accent-[#FF5A3C]"
            />
            <span className="text-[12px] font-semibold text-[#0F1B3D]/45">เลือกทั้งหมดในหน้านี้</span>
          </div>

          <div className="space-y-2.5">
            {paged.map((question) => (
              <div
                key={question.id}
                className="flex items-start gap-3 rounded-2xl border border-[#0F1B3D]/[0.07] bg-white p-4 transition-shadow hover:shadow-[0_8px_20px_-14px_rgba(15,27,61,0.28)]"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(question.id)}
                  disabled={!question.isOwner}
                  onChange={() => toggleSelect(question.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-[#0F1B3D]/20 accent-[#FF5A3C] disabled:opacity-30"
                />
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold leading-snug text-[#0F1B3D]">{question.questionText}</p>
                    {question.topicLabel && (
                      <p className="mt-1.5 text-[12px] font-semibold text-[#0F1B3D]/45">📍 {question.topicLabel}</p>
                    )}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${DIFFICULTY_BADGE_CLASS[question.difficulty]}`}>{DIFFICULTY_LABEL[question.difficulty]}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${USAGE_BADGE_CLASS[question.usageType]}`}>{USAGE_LABEL[question.usageType]}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${SCOPE_BADGE_CLASS[question.privacyScope]}`}>{SCOPE_LABEL[question.privacyScope]}</span>
                      {!question.isOwner && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">ของครูท่านอื่น</span>}
                    </div>
                  </div>
                {question.isOwner ? (
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/dashboard/teacher/question-bank/${question.id}/edit`}
                      className="rounded-full border border-[#0F1B3D]/15 px-3.5 py-1.5 text-[12.5px] font-bold text-[#0F1B3D] transition-colors hover:bg-[#0F1B3D]/[0.04]"
                    >
                      แก้ไข
                    </Link>
                    <button
                      type="button"
                      disabled={deletingId === question.id}
                      onClick={() => handleDelete(question.id)}
                      className="rounded-full border border-red-200 px-3.5 py-1.5 text-[12.5px] font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === question.id ? "กำลังลบ..." : "ลบ"}
                    </button>
                  </div>
                ) : (
                  <CopyButton questionId={question.id} />
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full border border-[#0F1B3D]/15 px-3.5 py-1.5 text-[12.5px] font-bold text-[#0F1B3D] transition-colors hover:bg-[#0F1B3D]/[0.04] disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ก่อนหน้า
              </button>
              <span className="text-[12.5px] font-semibold text-[#0F1B3D]/50">หน้า {currentPage} / {totalPages}</span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-full border border-[#0F1B3D]/15 px-3.5 py-1.5 text-[12.5px] font-bold text-[#0F1B3D] transition-colors hover:bg-[#0F1B3D]/[0.04] disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ถัดไป
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CopyButton({ questionId }: { questionId: string }) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      disabled={copying || copied}
      onClick={async () => {
        setCopying(true);
        const { copyQuestionBankItem } = await import("@/app/dashboard/teacher/question-bank/actions");
        const result = await copyQuestionBankItem(questionId);
        setCopying(false);
        if (!result.error) setCopied(true);
      }}
      className="shrink-0 rounded-full bg-[#0F1B3D] px-3.5 py-1.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#182852] disabled:opacity-50 disabled:hover:bg-[#0F1B3D]"
    >
      {copied ? "คัดลอกแล้ว ✓" : copying ? "กำลังคัดลอก..." : "คัดลอกมาใช้"}
    </button>
  );
}