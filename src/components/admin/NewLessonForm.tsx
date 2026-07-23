'use client';

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { uploadVideoToR2 } from '@/lib/uploadVideoToR2';

export function NewLessonForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleVideoChange(e: ChangeEvent<HTMLInputElement>) {
    setVideoFile(e.target.files?.[0] ?? null);
    setUploadProgress(0);
  }

  // แปล error ทางเทคนิคจาก Postgres/Supabase ให้เป็นข้อความที่ user เข้าใจได้
  function toFriendlyError(message: string): string {
    if (message.includes('lessons_module_id_order_index_key')) {
      return 'เกิดการชนกันของลำดับบทเรียน กรุณาลองกดบันทึกอีกครั้ง';
    }
    if (message.includes('duplicate key')) {
      return 'ข้อมูลนี้มีอยู่ในระบบแล้ว';
    }
    if (message.includes('violates row-level security')) {
      return 'คุณไม่มีสิทธิ์ทำรายการนี้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง';
    }
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
      return 'เชื่อมต่อเครือข่ายไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
    }
    return message;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError(null);

    try {
      let videoUrl: string | null = null;

      if (videoFile) {
        setSavingStep('กำลังอัปโหลดวิดีโอ...');
        videoUrl = await uploadVideoToR2(videoFile, (percent) => {
          setUploadProgress(percent);
        });
      }

      setSavingStep('กำลังเตรียมบทเรียน...');
      let moduleId: string;

      const { data: existingModule } = await supabase
        .from('modules')
        .select('id')
        .eq('course_id', courseId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingModule) {
        moduleId = existingModule.id;
      } else {
        const { data: newModule, error: moduleError } = await supabase
          .from('modules')
          .insert({ course_id: courseId, title: 'บทเรียนทั้งหมด' })
          .select('id')
          .single();

        if (moduleError) throw new Error(`สร้าง module ไม่สำเร็จ: ${moduleError.message}`);
        moduleId = newModule.id;
      }

      setSavingStep('กำลังบันทึกบทเรียน...');

      // หา order_index ล่าสุดของ module นี้ แล้ว +1 เพื่อไม่ให้ชนกับบทเรียนที่มีอยู่แล้ว
      // (ป้องกัน error 409 duplicate key จาก unique constraint lessons_module_id_order_index_key)
      const { data: lastLesson } = await supabase
        .from('lessons')
        .select('order_index')
        .eq('module_id', moduleId)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrderIndex = (lastLesson?.order_index ?? -1) + 1;

      const { error: insertError } = await supabase.from('lessons').insert({
        course_id: courseId,
        module_id: moduleId,
        title,
        video_url: videoUrl,
        order_index: nextOrderIndex,
      });

      if (insertError) throw new Error(insertError.message);

      setTitle('');
      setVideoFile(null);
      setUploadProgress(0);
      router.refresh();
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
      setError(toFriendlyError(rawMessage));
    } finally {
      setSaving(false);
      setSavingStep(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div className="flex flex-col sm:flex-row gap-2.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ชื่อบทเรียนใหม่ เช่น บทที่ 1 - แนะนำ SCORM"
          className="flex-1 px-3.5 py-2.5 text-[13.5px] bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-950 focus:bg-white transition-colors"
        />
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-950 hover:bg-blue-900 text-white text-[13.5px] font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shadow-sm"
        >
          {saving ? (savingStep ?? 'กำลังเพิ่ม...') : '+ เพิ่มบทเรียน'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer text-[12.5px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-lg transition-colors">
          {videoFile ? videoFile.name : 'เลือกวิดีโอ'}
          <input type="file" accept="video/*" onChange={handleVideoChange} className="hidden" />
        </label>
        <span className="text-[12px] text-slate-400">
          ไม่บังคับ — เว้นว่างได้ถ้าจะอัปโหลด SCORM แทนทีหลัง
        </span>
      </div>

      {saving && videoFile && (
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-950 transition-all"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {error && (
        <p className="text-[12.5px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </form>
  );
}