// src/components/admin/LessonScormRow.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ScormUploader } from './ScormUploader';

interface Lesson {
  id: string;
  title: string;
  video_url: string | null;
  is_scorm: boolean | null;
  scorm_entry_point: string | null;
  scorm_version: string | null;
}

export function LessonScormRow({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const [showUploader, setShowUploader] = useState(false);
  const router = useRouter();

  return (
    <div className="border border-slate-100 rounded-2xl p-4 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-slate-900">{lesson.title}</p>

          {lesson.is_scorm ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              SCORM {lesson.scorm_version} — entry: {lesson.scorm_entry_point}
            </span>
          ) : lesson.video_url ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              มีวิดีโอแล้ว
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full mt-1.5">
              ยังไม่มีวิดีโอหรือ SCORM
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {lesson.is_scorm && (
            <Link
              href={`/play/${courseId}/${lesson.id}`}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white bg-blue-950 hover:bg-blue-900 px-3.5 py-2 rounded-lg transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              เล่นดูตัวอย่าง
            </Link>
          )}

          <button
            onClick={() => setShowUploader((v) => !v)}
            className="text-[12.5px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-lg transition-colors"
          >
            {lesson.is_scorm ? 'อัปโหลดใหม่' : 'อัปโหลด SCORM'}
          </button>
        </div>
      </div>

      {showUploader && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <ScormUploader
            courseId={courseId}
            lessonId={lesson.id}
            onSuccess={() => {
              setShowUploader(false);
              router.refresh(); // โหลดข้อมูลใหม่จาก server component
            }}
          />
        </div>
      )}
    </div>
  );
}