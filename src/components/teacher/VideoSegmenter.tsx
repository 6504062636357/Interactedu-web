"use client";

import { useRef, useState, type ReactElement } from "react";
import {
  CirclePlay,
  Clock3,
  Download,
  LoaderCircle,
  Plus,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";

export interface VideoSegment {
  id: string;
  start: number;
  end: number;
  title: string;
  summary?: string;
  confidence?: number;
  source?: "ai" | "manual" | "timed";
}

interface VideoSegmenterProps {
  courseId: string;
  sourceUrl: string;
  analysisVideoUrl?: string | null;
  sourceFile?: File | null;
  segments: VideoSegment[];
  onSegmentsChange: (segments: VideoSegment[]) => void;
}

type SuggestionMethod = "ai" | "manual" | "timed";

const METHODS: {
  id: SuggestionMethod;
  title: string;
  description: string;
  badge?: string;
}[] = [
  {
    id: "ai",
    title: "AI แบ่งตามเนื้อหาที่พูด",
    description: "ถอดเสียง หาจุดเปลี่ยนหัวข้อ และช่วยตั้งชื่อแต่ละช่วงให้",
    badge: "AI แนะนำ",
  },
  {
    id: "manual",
    title: "กำหนดจุดแบ่งเอง",
    description: "เลื่อนวิดีโอไปยังเวลาที่ต้องการ แล้วกดแบ่งตรงตำแหน่งนั้น",
    badge: "ควบคุมเอง",
  },
  {
    id: "timed",
    title: "แบ่งตามเวลา",
    description: "กำหนดเองว่าต้องการแบ่งทุกกี่นาที เช่น 4, 6, 7 หรือ 8 นาที",
    badge: "เลือกนาทีได้",
  },
];

function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function createSegment(
  index: number,
  start: number,
  end: number,
  source: VideoSegment["source"]
): VideoSegment {
  return {
    id: crypto.randomUUID(),
    start: Number(start.toFixed(1)),
    end: Number(end.toFixed(1)),
    title: `บทที่ ${index + 1}`,
    source,
  };
}

const GENERATED_CHAPTER_TITLE = /^(?:ช่วง|บท)ที่\s+\d+(?:\s*\(ต่อ\))*(?::\s*(.+))?$/;

function renumberDefaultChapterTitles(items: VideoSegment[]): VideoSegment[] {
  return items.map((segment, index) => {
    const generatedTitle = segment.title.trim().match(GENERATED_CHAPTER_TITLE);
    if (!generatedTitle) return segment;
    const topic = generatedTitle[1]?.trim();
    return { ...segment, title: `บทที่ ${index + 1}${topic ? `: ${topic}` : ""}` };
  });
}

export default function VideoSegmenter({
  courseId,
  sourceUrl,
  analysisVideoUrl,
  sourceFile,
  segments,
  onSegmentsChange,
}: VideoSegmenterProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [intervalMinutes, setIntervalMinutes] = useState("2");
  const [method, setMethod] = useState<SuggestionMethod>("ai");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const intervalMinutesValue = Number(intervalMinutes);
  const isIntervalValid = Number.isSafeInteger(intervalMinutesValue) && intervalMinutesValue >= 1;
  const canSplitAtCurrentTime =
    currentTime >= 1 &&
    currentTime <= duration - 1 &&
    segments.some((segment) => currentTime > segment.start + 0.9 && currentTime < segment.end - 0.9);

  function buildTimedSegments(): VideoSegment[] {
    if (!isIntervalValid) throw new Error("กรอกจำนวนนาทีเป็นเลขจำนวนเต็มตั้งแต่ 1 นาทีขึ้นไป");

    const intervalSeconds = intervalMinutesValue * 60;
    const nextSegments: VideoSegment[] = [];
    for (let start = 0; start < duration; start += intervalSeconds) {
      nextSegments.push(
        createSegment(nextSegments.length, start, Math.min(start + intervalSeconds, duration), "timed")
      );
    }
    return nextSegments;
  }

  async function suggestWithAI(): Promise<VideoSegment[]> {
    if (sourceFile && sourceFile.size > 25 * 1024 * 1024) {
      throw new Error("ไฟล์สำหรับวิเคราะห์ AI ต้องมีขนาดไม่เกิน 25 MB");
    }

    const formData = new FormData();
    formData.append("courseId", courseId);
    if (sourceFile) formData.append("file", sourceFile);
    else if (analysisVideoUrl) formData.append("videoUrl", analysisVideoUrl);
    else throw new Error("ยังไม่พบไฟล์วิดีโอสำหรับส่งให้ AI วิเคราะห์");

    const response = await fetch("/api/teacher/video-segments/suggest", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as {
      error?: string;
      segments?: Array<{
        start: number;
        end: number;
        title: string;
        summary: string;
        confidence: number;
      }>;
    };

    if (!response.ok || !payload.segments) {
      throw new Error(payload.error || "AI วิเคราะห์วิดีโอไม่สำเร็จ กรุณาลองใหม่");
    }

    return payload.segments.map((segment, index) => ({
      id: crypto.randomUUID(),
      start: segment.start,
      end: segment.end,
      title: `บทที่ ${index + 1}: ${segment.title}`,
      summary: segment.summary,
      confidence: segment.confidence,
      source: "ai",
    }));
  }

  function seekTo(seconds: number): void {
    const nextTime = Math.min(Math.max(seconds, 0), duration || seconds);
    setCurrentTime(nextTime);
    if (videoRef.current) videoRef.current.currentTime = nextTime;
  }

  function splitAtCurrentTime(): void {
    if (!duration) return;

    const splitTime = Number(currentTime.toFixed(1));
    if (splitTime < 1 || splitTime > duration - 1) {
      setAnalysisError("เลือกจุดแบ่งที่ห่างจากต้นและท้ายวิดีโออย่างน้อย 1 วินาที");
      return;
    }

    videoRef.current?.pause();
    setAnalysisError(null);

    if (segments.length === 0) {
      onSegmentsChange([
        createSegment(0, 0, splitTime, "manual"),
        createSegment(1, splitTime, duration, "manual"),
      ]);
      return;
    }

    const targetIndex = segments.findIndex(
      (segment) => splitTime > segment.start + 0.9 && splitTime < segment.end - 0.9
    );
    if (targetIndex === -1) {
      setAnalysisError("จุดนี้อยู่ใกล้ขอบช่วงเดิมเกินไป ลองเลื่อนไปอีกอย่างน้อย 1 วินาที");
      return;
    }

    const target = segments[targetIndex];
    const nextSegment = createSegment(targetIndex + 1, splitTime, target.end, "manual");
    const nextSegments = [
      ...segments.slice(0, targetIndex),
      { ...target, end: splitTime },
      nextSegment,
      ...segments.slice(targetIndex + 1),
    ];
    onSegmentsChange(renumberDefaultChapterTitles(nextSegments));
  }

  function addChapterFromList(): void {
    if (!duration) return;
    if (segments.length === 0) {
      setAnalysisError(null);
      onSegmentsChange([createSegment(0, 0, duration, "manual")]);
      return;
    }
    splitAtCurrentTime();
  }

  function resetAllSegments(): void {
    if (segments.length === 0) return;
    if (!window.confirm("รีเซ็ตและลบช่วงวิดีโอทั้งหมดใช่ไหม?")) return;
    videoRef.current?.pause();
    seekTo(0);
    setAnalysisError(null);
    onSegmentsChange([]);
  }

  async function handleGenerateSuggestions(): Promise<void> {
    if (!duration || isAnalyzing) return;

    setAnalysisError(null);
    setIsAnalyzing(true);
    try {
      const nextSegments = method === "ai" ? await suggestWithAI() : buildTimedSegments();
      onSegmentsChange(nextSegments);
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "สร้างช่วงวิดีโอไม่สำเร็จ กรุณาลองใหม่"
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function updateSegment(id: string, patch: Partial<VideoSegment>): void {
    onSegmentsChange(segments.map((segment) => (segment.id === id ? { ...segment, ...patch } : segment)));
  }

  function removeSegment(id: string): void {
    onSegmentsChange(renumberDefaultChapterTitles(segments.filter((segment) => segment.id !== id)));
  }

  function jumpTo(seconds: number): void {
    if (!videoRef.current) return;
    seekTo(seconds);
    void videoRef.current.play();
  }

  function exportSegments(): void {
    const body = JSON.stringify({ duration, segments }, null, 2);
    const blob = new Blob([body], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "video-segments.json";
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#0F1B3D]/[0.08] bg-white shadow-[0_12px_40px_rgba(15,27,61,0.06)]">
      <div className="border-b border-[#0F1B3D]/[0.06] bg-[linear-gradient(135deg,#FFF8F5_0%,#FFFFFF_58%,#F2F0FF_100%)] px-5 py-6 sm:px-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-[#FF5A3C] shadow-sm ring-1 ring-[#FF5A3C]/10">
              <Sparkles className="h-3.5 w-3.5" />
              ตัวช่วยจัดโครงสร้างบทเรียน
            </div>
            <h2 className="text-[21px] font-black tracking-[-0.03em] text-[#0F1B3D] sm:text-[24px]">
              แบ่งวิดีโอเป็นช่วงที่เรียนตามได้ง่าย
            </h2>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-[#0F1B3D]/55">
              ให้ระบบสร้างจุดเริ่ม–จบเบื้องต้น แล้วครูตรวจชื่อและเวลาแต่ละช่วงก่อนนำไปใช้จริง
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-[#0F1B3D]/[0.06]">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#0F1B3D]/35">ความยาววิดีโอ</p>
            <p className="mt-1 flex items-center gap-2 text-[16px] font-black text-[#0F1B3D]">
              <Clock3 className="h-4 w-4 text-[#7C5CFF]" />
              {duration ? formatTime(duration) : "กำลังอ่านข้อมูล..."}
            </p>
          </div>
        </div>

        <ol className="mt-6 grid gap-2 sm:grid-cols-3" aria-label="ขั้นตอนการแบ่งช่วงวิดีโอ">
          {[
            ["1", "อัปโหลดวิดีโอ", "เรียบร้อย"],
            ["2", "เลือกรูปแบบ", segments.length > 0 ? "เลือกแล้ว" : "กำลังทำ"],
            ["3", "ตรวจและแก้ไข", segments.length > 0 ? "พร้อมตรวจ" : "ขั้นถัดไป"],
          ].map(([number, label, status]) => (
            <li key={number} className="flex items-center gap-3 rounded-xl bg-white/75 px-3.5 py-3 ring-1 ring-[#0F1B3D]/[0.05]">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${number === "1" || (segments.length > 0 && (number === "2" || number === "3")) ? "bg-[#00B37E] text-white" : number === "2" ? "bg-[#FF5A3C] text-white" : "bg-[#0F1B3D]/[0.06] text-[#0F1B3D]/35"}`}>
                {number}
              </span>
              <span>
                <span className="block text-[12px] font-bold text-[#0F1B3D]">{label}</span>
                <span className="block text-[10.5px] text-[#0F1B3D]/40">{status}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
        <div>
          <p className="mb-2 text-[12px] font-bold text-[#0F1B3D]/55">ตัวอย่างวิดีโอ</p>
          <video
            ref={videoRef}
            src={sourceUrl}
            controls
            onLoadedMetadata={(event) => {
              setDuration(event.currentTarget.duration || 0);
              setCurrentTime(event.currentTarget.currentTime || 0);
            }}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
            className="aspect-video w-full rounded-2xl bg-[#0F1B3D] object-contain shadow-sm"
          />
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <WandSparkles className="h-4 w-4 text-[#FF5A3C]" />
            <h3 className="text-[13px] font-extrabold text-[#0F1B3D]">อยากแบ่งวิดีโอแบบไหน?</h3>
          </div>
          <div className="space-y-2">
            {METHODS.map((item) => {
              const selected = method === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMethod(item.id);
                    setAnalysisError(null);
                  }}
                  aria-pressed={selected}
                  className={`w-full rounded-xl border p-3.5 text-left transition ${selected ? "border-[#FF5A3C]/50 bg-[#FFF7F4] shadow-[0_4px_16px_rgba(255,90,60,0.08)]" : "border-[#0F1B3D]/[0.08] bg-white hover:border-[#0F1B3D]/20"}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[12.5px] font-extrabold text-[#0F1B3D]">
                      <span className={`h-3.5 w-3.5 rounded-full border-[4px] ${selected ? "border-[#FF5A3C]" : "border-[#0F1B3D]/20"}`} />
                      {item.title}
                    </span>
                    {item.badge && (
                      <span className={`rounded-full px-2 py-1 text-[9.5px] font-bold ${item.id === "ai" ? "bg-[#FF5A3C] text-white" : item.id === "timed" ? "bg-emerald-50 text-emerald-700" : "bg-[#7C5CFF]/10 text-[#7C5CFF]"}`}>
                        {item.badge}
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block pl-[22px] text-[11px] leading-5 text-[#0F1B3D]/45">{item.description}</span>
                </button>
              );
            })}
          </div>
          {method === "ai" && (
            <p className="mt-3 rounded-xl bg-[#7C5CFF]/[0.06] px-3 py-2.5 text-[10.5px] leading-5 text-[#5D45C7]">
              AI จะถอดเสียงและวิเคราะห์หัวข้อผ่านเซิร์ฟเวอร์ รองรับไฟล์สำหรับวิเคราะห์สูงสุด 25 MB
            </p>
          )}

          {method === "manual" && (
            <div className="mt-3 rounded-2xl border border-[#7C5CFF]/15 bg-[#F7F5FF] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11.5px] font-extrabold text-[#0F1B3D]">ตำแหน่งที่จะตัด</p>
                  <p className="mt-0.5 text-[10.5px] text-[#0F1B3D]/45">เลื่อนแถบหรือเล่นวิดีโอจนถึงจุดที่ต้องการ</p>
                </div>
                <span className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-black tabular-nums text-[#5D45C7] ring-1 ring-[#7C5CFF]/10">
                  {formatTime(currentTime)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                onChange={(event) => seekTo(Number(event.target.value))}
                aria-label="เลือกเวลาสำหรับแบ่งวิดีโอ"
                className="mt-3 w-full accent-[#FF5A3C]"
              />
              <button
                type="button"
                onClick={splitAtCurrentTime}
                disabled={!duration || currentTime < 1 || currentTime > duration - 1}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF5A3C] px-5 py-3 text-[13.5px] font-bold text-white shadow-[0_8px_20px_rgba(255,90,60,0.18)] transition hover:bg-[#EB4A2D] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Scissors className="h-4 w-4" />
                แบ่งตรง {formatTime(currentTime)}
              </button>
              <p className="mt-2 text-center text-[10px] leading-4 text-[#0F1B3D]/40">
                เป็นการแบ่งช่วงสำหรับบทเรียน ไฟล์วิดีโอต้นฉบับจะไม่ถูกตัดหรือเปลี่ยนแปลง
              </p>
            </div>
          )}

          {method === "timed" && (
            <div className="mt-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-3.5">
              <label htmlFor="segment-interval-minutes" className="block text-[11.5px] font-extrabold text-[#0F1B3D]">
                ต้องการแบ่งทุกกี่นาที?
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="segment-interval-minutes"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={intervalMinutes}
                  onChange={(event) => {
                    setIntervalMinutes(event.target.value);
                    setAnalysisError(null);
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-center text-[16px] font-black text-[#0F1B3D] outline-none transition focus:border-emerald-500"
                />
                <span className="text-[12px] font-bold text-emerald-800">นาทีต่อช่วง</span>
              </div>
              <p className="mt-2 text-[10.5px] leading-5 text-emerald-800/70">
                {isIntervalValid && duration
                  ? `วิดีโอนี้จะถูกแบ่งประมาณ ${Math.ceil(duration / (intervalMinutesValue * 60))} ช่วง`
                  : "กรอกเลขจำนวนเต็มตั้งแต่ 1 นาทีขึ้นไป"}
              </p>
            </div>
          )}

          {method !== "manual" && (
            <button
              type="button"
              onClick={handleGenerateSuggestions}
              disabled={!duration || isAnalyzing || (method === "timed" && !isIntervalValid)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FF5A3C] px-5 py-3 text-[13.5px] font-bold text-white shadow-[0_8px_20px_rgba(255,90,60,0.22)] transition hover:bg-[#EB4A2D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : method === "ai" ? (
                <WandSparkles className="h-4 w-4" />
              ) : (
                <Scissors className="h-4 w-4" />
              )}
              {isAnalyzing
                ? method === "ai"
                  ? "AI กำลังฟังและจัดหัวข้อ..."
                  : "กำลังวิเคราะห์วิดีโอ..."
                : method === "timed"
                  ? `แบ่งทุก ${intervalMinutes || "–"} นาที`
                  : segments.length > 0
                    ? "สร้างคำแนะนำใหม่"
                    : "ให้ AI แนะนำช่วง"}
            </button>
          )}
          {analysisError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[11.5px] leading-5 text-red-600">{analysisError}</p>}
        </div>
      </div>

      <div className="border-t border-[#0F1B3D]/[0.06] bg-[#F8F9FB] px-5 py-6 sm:px-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-[15px] font-black text-[#0F1B3D]">
              {segments.length > 0
                ? `${method === "manual" ? "ช่วงที่กำหนด" : "ช่วงที่แนะนำ"} ${segments.length} ช่วง`
                : method === "manual"
                  ? "ช่วงที่กำหนดเองจะอยู่ตรงนี้"
                  : "ช่วงที่แนะนำจะอยู่ตรงนี้"}
            </h3>
            <p className="mt-1 text-[11.5px] text-[#0F1B3D]/45">
              {segments.length > 0
                ? "กดเล่นเพื่อตรวจจุดเริ่ม แล้วแก้ชื่อหรือเวลาได้ทันที"
                : method === "manual"
                  ? "เลื่อนวิดีโอไปยังเวลาที่ต้องการ แล้วกด “แบ่งตรงนี้”"
                  : "เลือกรูปแบบด้านบน แล้วกด “สร้างช่วงแนะนำ”"}
            </p>
          </div>
          {segments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resetAllSegments}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[11.5px] font-bold text-red-600 transition hover:bg-red-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                รีเซ็ตช่วง
              </button>
              <button
                type="button"
                onClick={exportSegments}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#0F1B3D]/10 bg-white px-4 py-2.5 text-[11.5px] font-bold text-[#0F1B3D] transition hover:bg-[#0F1B3D]/[0.03]"
              >
                <Download className="h-3.5 w-3.5" />
                ดาวน์โหลดรายการ
              </button>
            </div>
          )}
        </div>

        {segments.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-[#0F1B3D]/15 bg-white px-5 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#7C5CFF]/10 text-[#7C5CFF]">
              <Scissors className="h-4 w-4" />
            </div>
            <p className="text-[12px] font-bold text-[#0F1B3D]/55">ยังไม่มีช่วงวิดีโอ</p>
            <p className="mt-1 text-[11px] text-[#0F1B3D]/35">
              {method === "manual"
                ? "เลือกเวลาแล้วกดแบ่ง ระบบจะสร้างช่วงก่อนและหลังจุดนั้นให้"
                : "ระบบจะสร้างเวลาเริ่ม–จบให้เป็นจุดตั้งต้น"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex h-8 overflow-hidden rounded-xl bg-white ring-1 ring-[#0F1B3D]/[0.06]" aria-label="ภาพรวมช่วงวิดีโอ">
              {segments.map((segment, index) => {
                const width = duration > 0 ? Math.max(4, ((segment.end - segment.start) / duration) * 100) : 100 / segments.length;
                return (
                  <button
                    key={segment.id}
                    type="button"
                    onClick={() => jumpTo(segment.start)}
                    title={`${segment.title} ${formatTime(segment.start)}–${formatTime(segment.end)}`}
                    style={{ width: `${width}%` }}
                    className={`border-r border-white/70 text-[10px] font-black transition hover:brightness-95 ${index % 2 === 0 ? "bg-[#FFDED6] text-[#B93C23]" : "bg-[#DDD7FF] text-[#5D45C7]"}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            {segments.map((segment, index) => (
              <article key={segment.id} className="rounded-2xl border border-[#0F1B3D]/[0.07] bg-white p-4 shadow-[0_4px_16px_rgba(15,27,61,0.03)]">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F1B3D] text-[11px] font-black text-white">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <label className="block text-[10.5px] font-bold text-[#0F1B3D]/40" htmlFor={`segment-title-${segment.id}`}>
                        ชื่อบท
                      </label>
                      {segment.source === "ai" && (
                        <span className="rounded-full bg-[#7C5CFF]/10 px-2 py-1 text-[9.5px] font-bold text-[#5D45C7]">
                          AI มั่นใจ {Math.round((segment.confidence ?? 0) * 100)}%
                        </span>
                      )}
                      {segment.source === "manual" && (
                        <span className="rounded-full bg-sky-50 px-2 py-1 text-[9.5px] font-bold text-sky-700">
                          กำหนดเอง
                        </span>
                      )}
                    </div>
                    <input
                      id={`segment-title-${segment.id}`}
                      value={segment.title}
                      onChange={(event) => updateSegment(segment.id, { title: event.target.value })}
                      placeholder={`เช่น บทที่ ${index + 1}`}
                      className="w-full rounded-lg border border-[#0F1B3D]/[0.08] bg-[#F8F9FB] px-3 py-2 text-[12.5px] font-semibold text-[#0F1B3D] outline-none transition focus:border-[#0F1B3D]/25 focus:bg-white"
                    />
                    {segment.summary !== undefined && (
                      <textarea
                        value={segment.summary}
                        onChange={(event) => updateSegment(segment.id, { summary: event.target.value })}
                        aria-label={`คำอธิบาย${segment.title || `บทที่ ${index + 1}`}`}
                        rows={2}
                        placeholder="คำอธิบายสั้น ๆ ของช่วงนี้"
                        className="mt-2 w-full resize-y rounded-lg border border-[#0F1B3D]/[0.08] bg-[#F8F9FB] px-3 py-2 text-[11.5px] leading-5 text-[#0F1B3D]/65 outline-none transition focus:border-[#0F1B3D]/25 focus:bg-white"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSegment(segment.id)}
                    aria-label={`ลบ${segment.title || `บทที่ ${index + 1}`}`}
                    className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#0F1B3D]/30 transition hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="rounded-xl bg-[#F8F9FB] px-3 py-2">
                    <span className="block text-[9.5px] font-bold text-[#0F1B3D]/35">เริ่ม (วินาที)</span>
                    <span className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={segment.end}
                        step={0.1}
                        value={segment.start}
                        onChange={(event) => updateSegment(segment.id, { start: Number(event.target.value) })}
                        className="min-w-0 flex-1 bg-transparent text-[12px] font-bold text-[#0F1B3D] outline-none"
                      />
                      <span className="text-[10.5px] font-semibold text-[#7C5CFF]">{formatTime(segment.start)}</span>
                    </span>
                  </label>
                  <label className="rounded-xl bg-[#F8F9FB] px-3 py-2">
                    <span className="block text-[9.5px] font-bold text-[#0F1B3D]/35">จบ (วินาที)</span>
                    <span className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={segment.start}
                        max={duration}
                        step={0.1}
                        value={segment.end}
                        onChange={(event) => updateSegment(segment.id, { end: Number(event.target.value) })}
                        className="min-w-0 flex-1 bg-transparent text-[12px] font-bold text-[#0F1B3D] outline-none"
                      />
                      <span className="text-[10.5px] font-semibold text-[#7C5CFF]">{formatTime(segment.end)}</span>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => jumpTo(segment.start)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#0F1B3D]/10 px-4 py-2 text-[11.5px] font-bold text-[#0F1B3D] transition hover:bg-[#0F1B3D]/[0.03]"
                  >
                    <CirclePlay className="h-4 w-4 text-[#FF5A3C]" />
                    เล่นช่วงนี้
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={addChapterFromList}
            disabled={!duration}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#7C5CFF]/35 bg-white px-5 py-4 text-[12.5px] font-extrabold text-[#5D45C7] transition hover:border-[#7C5CFF]/60 hover:bg-[#F7F5FF] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#7C5CFF] text-white">
              <Plus className="h-4 w-4" />
            </span>
            {segments.length > 0 ? `เพิ่มบทใหม่ตรง ${formatTime(currentTime)}` : "เพิ่มบทแรก"}
          </button>
          <p className="mt-2 text-center text-[10.5px] text-[#0F1B3D]/40">
            {segments.length > 0
              ? canSplitAtCurrentTime
                ? `พร้อมเพิ่มบทใหม่ที่เวลา ${formatTime(currentTime)}`
                : "เลื่อนวิดีโอไปกลางบทที่ต้องการแบ่ง แล้วกดปุ่ม + เพื่อเพิ่มบทใหม่"
              : "ระบบจะสร้างบทที่ 1 ครอบคลุมวิดีโอทั้งหมด จากนั้นครูแบ่งเพิ่มได้"}
          </p>
        </div>

        <p className="mt-4 text-[10.5px] leading-5 text-[#0F1B3D]/35">
          ครูแก้ไขชื่อและเวลาได้ทุกช่วง ไม่ว่าจะสร้างด้วย AI อัตโนมัติ หรือกำหนดเอง • ข้อมูลบทจะถูกบันทึกพร้อมฉบับร่างบทเรียน
        </p>
      </div>
    </section>
  );
}
