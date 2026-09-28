import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime-types';
import { isLessonComplete } from '@/lib/courses/student-progress';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return 'UnknownError';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}


// หน้าแจ้งเตือน "บทนี้ยังล็อคอยู่" ที่โผล่ในกรอบ iframe เนื้อหาบทเรียน (แทนข้อความ plain text
// เดิม) — ปรับโทนสี/ฟอนต์ให้กลืนกับธีมมืดของหน้า /play (#07101F พื้นหลัง, #FF5A3C สีแบรนด์)
const LOCKED_LESSON_HTML = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>บทเรียนนี้ยังไม่ปลดล็อค</title>
<!-- ใช้ฟอนต์เดียวกับทั้งเว็ป (Noto Sans Thai + Noto Sans) ตามที่ตั้งไว้ใน src/app/layout.tsx —
     หน้านี้เสิร์ฟจาก API route แยกต่างหาก ไม่ผ่าน Next.js layout จึงโหลดจาก Google Fonts เอง -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  html, body {
    height: 100%;
    margin: 0;
    background: #07101F;
    font-family: "Noto Sans Thai", "Noto Sans", system-ui, sans-serif;
  }
  .wrap {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    box-sizing: border-box;
  }
  .card {
    max-width: 380px;
    text-align: center;
  }
  .icon {
    width: 56px;
    height: 56px;
    margin: 0 auto 20px;
    border-radius: 16px;
    background: rgba(255, 90, 60, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h1 {
    margin: 0 0 10px;
    font-size: 18px;
    font-weight: 800;
    color: #FFFFFF;
    letter-spacing: -0.01em;
  }
  p {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.6;
    color: #94A3B8;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF5A3C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <h1>บทเรียนนี้ยังไม่ปลดล็อค</h1>
      <p>กรุณาเรียนบทเรียนก่อนหน้าให้จบก่อน<br />ถึงจะเข้าบทนี้ได้</p>
    </div>
  </div>
</body>
</html>`;

async function fetchFromR2(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });
  const response = await r2.send(command);
  if (!response.Body) throw new Error('Empty body');
  const byteArray = await response.Body.transformToByteArray();
  return Buffer.from(byteArray);
}


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; lessonId: string; path: string[] }> }
) {
  // 1. เช็คสิทธิ์การเข้าถึงผ่านตัวจัดการของโปรเจกต์
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { courseId, lessonId, path } = await params;

  // 2. บังคับล็อคลำดับบทเรียนฝั่งเซิร์ฟเวอร์ — กันไม่ให้นักเรียนข้ามไปโหลดเนื้อหาบทถัดไปตรงๆ
  // ผ่าน URL ทั้งที่ยังเรียนบทก่อนหน้าไม่จบ (ฝั่ง UI ล็อคปุ่มไว้แล้ว แต่ URL ยังยิงตรงเข้ามาได้ถ้าไม่เช็คที่นี่ด้วย)
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const { data: course } = await supabase.from('courses').select('created_by').eq('id', courseId).maybeSingle();
  const isOwnerOrAdmin = profile?.role === 'admin' || course?.created_by === user.id;

  if (!isOwnerOrAdmin) {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('student_id', user.id)
      .eq('course_id', courseId)
      .eq('status', 'approved')
      .maybeSingle();
    if (!enrollment) return new NextResponse('Forbidden', { status: 403 });

    const { data: modules } = await supabase
      .from('modules')
      .select('order_index, lessons(id, order_index, is_published)')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true });

    const orderedLessonIds = (modules ?? [])
      .flatMap((m) => {
        const moduleLessons = (m.lessons ?? []) as { id: string; order_index: number; is_published: boolean }[];
        return [...moduleLessons]
          .filter((l) => l.is_published)
          .sort((a, b) => a.order_index - b.order_index)
          .map((l) => l.id);
      });

    const currentIndex = orderedLessonIds.indexOf(lessonId);
    // เจอบทเรียนนี้ในลำดับ และไม่ใช่บทแรก ถึงจะต้องเช็คว่าบทก่อนหน้าจบหรือยัง
    if (currentIndex > 0) {
      const priorLessonId = orderedLessonIds[currentIndex - 1];
      const { data: priorTracking } = await supabase
        .from('scorm_tracking')
        .select('lesson_id, lesson_status, video_completed')
        .eq('enrollment_id', enrollment.id)
        .eq('lesson_id', priorLessonId)
        .maybeSingle();
      if (!isLessonComplete(priorTracking ?? undefined)) {
        return new NextResponse(LOCKED_LESSON_HTML, {
          status: 403,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    }
  }

  const filePath = path.join('/');
  const basePath = `scorm-packages/${courseId}/${lessonId}`;
  const primaryPath = `${basePath}/${filePath}`;

  try {
    let buffer: Buffer;

    
    try {
      buffer = await fetchFromR2(primaryPath);
    } catch (error: unknown) {
      if (errorName(error) === 'NoSuchKey') {
        const filename = filePath.substring(filePath.lastIndexOf('/') + 1);
        buffer = await fetchFromR2(`${basePath}/shared/${filename}`);
      } else {
        throw error;
      }
    }
   

    const mimeType = mime.lookup(filePath);
    const actualContentType = typeof mimeType === 'string' ? mimeType : 'application/octet-stream';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': actualContentType,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: unknown) {
    const name = errorName(error);
    const message = errorMessage(error);
    console.error('R2 Proxy Error:', {
      primaryPath,
      name,
      message,
    });
    return new NextResponse(
      JSON.stringify({ error: name, message, storagePath: primaryPath }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
