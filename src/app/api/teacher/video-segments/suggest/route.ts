import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARACTERS = 180_000;
const SUPPORTED_FILE_EXTENSION = /\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|wav|webm)$/i;

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface AISegmentCandidate {
  start: number;
  end: number;
  title: string;
  summary: string;
  confidence: number;
}

class RouteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนใช้ AI" }, { status: 401 });

    const declaredRequestSize = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredRequestSize) && declaredRequestSize > MAX_MEDIA_BYTES + 512_000) {
      return NextResponse.json({ error: "ไฟล์สำหรับวิเคราะห์ AI ต้องมีขนาดไม่เกิน 25 MB" }, { status: 413 });
    }

    const formData = await request.formData();
    const courseId = formData.get("courseId");
    const uploadedFile = formData.get("file");
    const videoUrl = formData.get("videoUrl");

    if (typeof courseId !== "string" || !courseId) {
      return NextResponse.json({ error: "ไม่พบข้อมูลคอร์ส" }, { status: 400 });
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "teacher" && profile?.role !== "admin") {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ใช้เครื่องมือ AI นี้" }, { status: 403 });
    }

    if (profile.role === "teacher") {
      const { data: ownedCourse } = await supabase
        .from("courses")
        .select("id")
        .eq("id", courseId)
        .eq("created_by", user.id)
        .maybeSingle();
      if (!ownedCourse) return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ไขคอร์สนี้" }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY บนเซิร์ฟเวอร์" },
        { status: 503 }
      );
    }

    const mediaFile =
      uploadedFile instanceof File && uploadedFile.size > 0
        ? validateUploadedFile(uploadedFile)
        : typeof videoUrl === "string" && videoUrl
          ? await downloadTrustedVideo(videoUrl)
          : null;

    if (!mediaFile) {
      return NextResponse.json({ error: "ไม่พบไฟล์วิดีโอสำหรับวิเคราะห์" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey, maxRetries: 1, timeout: 300_000 });
    const transcription = await openai.audio.transcriptions.create({
      file: mediaFile,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      temperature: 0,
    });

    const transcriptSegments = (transcription.segments ?? [])
      .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.text.trim())
      .map((segment) => ({
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
      }));

    if (transcriptSegments.length === 0) {
      throw new RouteError("ไม่พบเสียงพูดที่ชัดเจนในวิดีโอนี้ ลองแบ่งตามเวลาหรือเปลี่ยนฉากแทน", 422);
    }

    const transcriptForModel = formatTranscript(transcriptSegments);
    if (transcriptForModel.length > MAX_TRANSCRIPT_CHARACTERS) {
      throw new RouteError("วิดีโอนี้ยาวเกินขอบเขตการวิเคราะห์ AI ในเวอร์ชันทดลอง", 413);
    }

    const duration = Math.max(
      Number(transcription.duration) || 0,
      transcriptSegments[transcriptSegments.length - 1]?.end ?? 0
    );

    const response = await openai.responses.create({
      model: process.env.OPENAI_SEGMENTATION_MODEL ?? "gpt-5.4-nano",
      store: false,
      instructions: [
        "You are an instructional-video editor.",
        "Group the timestamped transcript into coherent learning chapters based on topic changes.",
        "Normally make chapters 90-360 seconds long; a short introduction or conclusion is allowed.",
        "Cover the full video from 0 to the supplied duration without gaps or overlaps.",
        "Use boundaries grounded in the supplied transcript timestamps. Do not invent lesson content.",
        "Write concise titles and summaries in the dominant language of the transcript.",
        "Confidence is 0-1 and reflects how clear the topic boundary is.",
      ].join(" "),
      input: JSON.stringify({ duration, transcript: transcriptForModel }),
      text: {
        format: {
          type: "json_schema",
          name: "video_learning_segments",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["segments"],
            properties: {
              segments: {
                type: "array",
                minItems: 1,
                maxItems: 60,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["start", "end", "title", "summary", "confidence"],
                  properties: {
                    start: { type: "number", minimum: 0 },
                    end: { type: "number", minimum: 0 },
                    title: { type: "string", minLength: 1, maxLength: 100 },
                    summary: { type: "string", minLength: 1, maxLength: 240 },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                  },
                },
              },
            },
          },
        },
        verbosity: "low",
      },
    });

    const parsed = JSON.parse(response.output_text) as { segments?: unknown };
    const candidates = parseCandidates(parsed.segments);
    const segments = normalizeSegments(candidates, duration);

    if (segments.length === 0) {
      throw new RouteError("AI ยังแบ่งหัวข้อจากวิดีโอนี้ไม่ได้ ลองใช้การแบ่งตามเวลาแทน", 422);
    }

    return NextResponse.json({
      segments,
      transcriptLanguage: transcription.language ?? null,
      transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",
      segmentationModel: process.env.OPENAI_SEGMENTATION_MODEL ?? "gpt-5.4-nano",
    });
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof OpenAI.APIError) {
      console.error("[video-segments/suggest] OpenAI request failed", {
        status: error.status,
        code: error.code,
        type: error.type,
      });

      if (error.status === 401) {
        return NextResponse.json({ error: "OPENAI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้โมเดล" }, { status: 503 });
      }
      if (error.status === 429) {
        return NextResponse.json({ error: "AI มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่" }, { status: 429 });
      }
      return NextResponse.json({ error: "บริการ AI ประมวลผลไม่สำเร็จ กรุณาลองใหม่" }, { status: 502 });
    }

    console.error("[video-segments/suggest] Unexpected failure", error);
    return NextResponse.json({ error: "วิเคราะห์วิดีโอไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
}

function validateUploadedFile(file: File): File {
  if (file.size > MAX_MEDIA_BYTES) {
    throw new RouteError("ไฟล์สำหรับวิเคราะห์ AI ต้องมีขนาดไม่เกิน 25 MB", 413);
  }
  if (!SUPPORTED_FILE_EXTENSION.test(file.name)) {
    throw new RouteError("AI รองรับไฟล์ MP4, WebM, MP3, M4A, WAV, OGG, MPEG และ FLAC", 415);
  }
  return file;
}

async function downloadTrustedVideo(videoUrl: string): Promise<File> {
  const baseUrl = process.env.R2_PUBLIC_URL;
  if (!baseUrl || !isTrustedVideoUrl(videoUrl, baseUrl)) {
    throw new RouteError("URL วิดีโอไม่อยู่ในพื้นที่จัดเก็บที่ระบบอนุญาต", 400);
  }

  const response = await fetch(videoUrl, { cache: "no-store", redirect: "error" });
  if (!response.ok || !response.body) {
    throw new RouteError("ดาวน์โหลดวิดีโอเดิมเพื่อวิเคราะห์ไม่สำเร็จ", 502);
  }

  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_MEDIA_BYTES) {
    throw new RouteError("ไฟล์สำหรับวิเคราะห์ AI ต้องมีขนาดไม่เกิน 25 MB", 413);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_MEDIA_BYTES) {
      await reader.cancel();
      throw new RouteError("ไฟล์สำหรับวิเคราะห์ AI ต้องมีขนาดไม่เกิน 25 MB", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const pathname = new URL(videoUrl).pathname;
  const candidateName = decodeURIComponent(pathname.split("/").pop() || "lesson-video.mp4");
  const fileName = SUPPORTED_FILE_EXTENSION.test(candidateName) ? candidateName : "lesson-video.mp4";
  const contentType = response.headers.get("content-type") || "video/mp4";
  return new File([bytes.buffer], fileName, { type: contentType });
}

function isTrustedVideoUrl(candidate: string, configuredBase: string): boolean {
  try {
    const candidateUrl = new URL(candidate);
    const baseUrl = new URL(configuredBase);
    const basePath = baseUrl.pathname.replace(/\/$/, "");
    return (
      candidateUrl.protocol === "https:" &&
      candidateUrl.username === "" &&
      candidateUrl.password === "" &&
      candidateUrl.origin === baseUrl.origin &&
      (basePath === "" || candidateUrl.pathname === basePath || candidateUrl.pathname.startsWith(`${basePath}/`))
    );
  } catch {
    return false;
  }
}

function formatTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((segment) => `[${segment.start.toFixed(1)}-${segment.end.toFixed(1)}] ${segment.text}`)
    .join("\n");
}

function parseCandidates(value: unknown): AISegmentCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): AISegmentCandidate[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.start !== "number" ||
      typeof record.end !== "number" ||
      typeof record.title !== "string" ||
      typeof record.summary !== "string" ||
      typeof record.confidence !== "number"
    ) {
      return [];
    }
    return [
      {
        start: record.start,
        end: record.end,
        title: record.title.trim(),
        summary: record.summary.trim(),
        confidence: record.confidence,
      },
    ];
  });
}

function normalizeSegments(candidates: AISegmentCandidate[], duration: number): AISegmentCandidate[] {
  const safeDuration = Math.max(1, duration);
  const ordered = candidates
    .filter(
      (candidate) =>
        Number.isFinite(candidate.start) &&
        Number.isFinite(candidate.end) &&
        candidate.title.length > 0 &&
        candidate.summary.length > 0
    )
    .sort((first, second) => first.start - second.start)
    .slice(0, 60);

  const usable: AISegmentCandidate[] = [];
  for (const candidate of ordered) {
    const start = Math.min(Math.max(candidate.start, 0), safeDuration);
    if (start >= safeDuration - 1) continue;
    if (usable.length > 0 && start - usable[usable.length - 1].start < 20) continue;
    usable.push({ ...candidate, start });
  }

  return usable.map((candidate, index) => ({
    start: Number((index === 0 ? 0 : candidate.start).toFixed(1)),
    end: Number((usable[index + 1]?.start ?? safeDuration).toFixed(1)),
    title: candidate.title.slice(0, 100),
    summary: candidate.summary.slice(0, 240),
    confidence: Number(Math.min(1, Math.max(0, candidate.confidence)).toFixed(2)),
  }));
}
