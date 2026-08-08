// src/app/play/[courseId]/[lessonId]/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Scorm12API, Scorm2004API } from 'scorm-again';

interface PlayProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

interface ScormMenuItem {
  identifier: string;
  title: string;
  href: string | null;
  children: ScormMenuItem[];
  completed?: boolean;
  type?: 'lesson' | 'quiz';
  kind?: 'lesson' | 'quiz';
}

interface ScormManifest {
  organizationTitle: string;
  items: ScormMenuItem[];
}

interface CourseMaterial {
  id: string;
  file_name: string;
  file_url: string;
}

interface CourseLessonRef {
  id: string;
  title: string;
  moduleTitle: string;
  completed: boolean;
}

interface ScormApiLike {
  on(event: string, callback: () => void): void;
  cmi: {
    completion_status?: string;
    score?: { raw?: string | number };
    suspend_data?: string;
    core?: { lesson_status?: string; score?: { raw?: string | number } };
  };
  currentState: unknown;
  STATE_INITIALIZED: unknown;
  LMSFinish?: (value: string) => unknown;
  Terminate?: (value: string) => unknown;
}

type ScormWindow = Window & { API?: ScormApiLike; API_1484_11?: ScormApiLike };

// เดินทุกกิ่งของเมนู แปลงเป็น flat list ตามลำดับ ไว้ใช้ทำปุ่มก่อนหน้า/ถัดไป
function flattenPlayableItems(items: ScormMenuItem[]): ScormMenuItem[] {
  const result: ScormMenuItem[] = [];
  for (const item of items) {
    if (item.href) result.push(item);
    if (item.children && item.children.length > 0) {
      result.push(...flattenPlayableItems(item.children));
    }
  }
  return result;
}

export default function StandaloneScormPlayer({ params }: PlayProps) {
  const { courseId, lessonId } = use(params);
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [scormVersion, setScormVersion] = useState<'1.2' | '2004' | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ScormManifest | null>(null);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // เอกสารประกอบ
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  // รายชื่อบทเรียนทั้งหมดในคอร์ส (ไว้สลับเลสสันโดยไม่ต้องออกจากห้องเรียน)
  const [courseLessons, setCourseLessons] = useState<CourseLessonRef[]>([]);
  const [lessonListOpen, setLessonListOpen] = useState(true);

  // ความคืบหน้าราย SCO ของเลสสันปัจจุบัน
  const [completedScos, setCompletedScos] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.matchMedia('(min-width: 1024px)').matches) setSidebarOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // --- Effect ที่ 1: ดึงข้อมูล scorm-info (รันใหม่ทุกครั้งที่ lessonId เปลี่ยน คือตอนสลับบทเรียน) ---
  useEffect(() => {
    async function loadInfo() {
      try {
        setLoadError(null);
        setCurrentPath(null);
        const res = await fetch(`/api/lessons/${lessonId}/scorm-info`);
        if (!res.ok) throw new Error('Failed to fetch scorm info');
        const data = await res.json();

        setCurrentPath(data.entryPoint);
        setManifest(data.manifest ?? null);
        setCourseTitle(data.courseTitle ?? null);
        setLessonTitle(data.lessonTitle ?? null);
        setScormVersion(data.scormVersion === '2004' ? '2004' : '1.2');
      } catch (err) {
        console.error('SCORM Init Failed', err);
        setLoadError(err instanceof Error ? err.message : 'โหลดเนื้อหาไม่สำเร็จ');
      }
    }
    loadInfo();
  }, [lessonId]);

  // --- Effect ที่ 2: สร้าง API instance ใหม่ทุกครั้งที่สลับ SCO ---
  useEffect(() => {
    if (!scormVersion || !currentPath) return;

    const settings = { autocommit: true, autocommitSeconds: 15, logLevel: 2 };
    const is2004 = scormVersion === '2004';
    let apiInstance: ScormApiLike;
    const scormWindow = window as ScormWindow;

    if (is2004) {
      apiInstance = new Scorm2004API(settings) as unknown as ScormApiLike;
      setupCommitHook(apiInstance, true);
      scormWindow.API_1484_11 = apiInstance;
    } else {
      apiInstance = new Scorm12API(settings) as unknown as ScormApiLike;
      setupCommitHook(apiInstance, false);
      scormWindow.API = apiInstance;
    }

    function setupCommitHook(scormInstance: ScormApiLike, isScorm2004: boolean) {
      scormInstance.on('LMSCommit', () => {
        const lessonStatus = isScorm2004
          ? scormInstance.cmi.completion_status
          : scormInstance.cmi.core?.lesson_status;

        const scoreRaw = isScorm2004
          ? scormInstance.cmi.score?.raw
          : scormInstance.cmi.core?.score?.raw;

        const suspendData = scormInstance.cmi.suspend_data;

        const scoType = currentPath?.includes('quiz') ? 'quiz' : 'lesson';
        const thisCompleted = scoType === 'quiz' ? lessonStatus === 'passed' : lessonStatus === 'completed';

        fetch('/api/scorm/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId,
            courseId,
            lessonStatus: lessonStatus || 'incomplete',
            scoreRaw: scoreRaw || 0,
            suspendData: suspendData || '',
            scoType,
            scoIdentifier: currentPath,
          }),
        }).then(() => {
          // อัปเดต progress ใน state ทันที ไม่ต้องรอ reload หน้า — เก็บเป็นรายการ SCO ที่จบ ไม่ใช่ boolean เดี่ยว
          if (thisCompleted && currentPath) {
            setCompletedScos((prev) => (prev.includes(currentPath) ? prev : [...prev, currentPath]));
          }
          // ถ้าเลสสันนี้เพิ่งจบ ให้รีเฟรชสถานะในลิสต์บทเรียนทั้งคอร์สด้วย (ติ๊กถูกที่ sidebar ล่างสุด)
          if (thisCompleted && scoType === 'lesson') {
            setCourseLessons((prev) =>
              prev.map((l) => (l.id === lessonId ? { ...l, completed: true } : l))
            );
          }
        });
      });
    }

    return () => {
      try {
        if (scormWindow.API === apiInstance && apiInstance.currentState === apiInstance.STATE_INITIALIZED) {
          apiInstance.LMSFinish?.('');
        }
      } catch {}
      try {
        if (scormWindow.API_1484_11 === apiInstance && apiInstance.currentState === apiInstance.STATE_INITIALIZED) {
          apiInstance.Terminate?.('');
        }
      } catch {}
      delete scormWindow.API;
      delete scormWindow.API_1484_11;
    };
  }, [currentPath, scormVersion, courseId, lessonId]);

  // --- Effect ที่ 3: ดึงเอกสารประกอบ ---
  useEffect(() => {
    async function loadMaterials() {
      try {
        const res = await fetch(`/api/courses/${courseId}/materials`);
        if (!res.ok) return;
        const data = await res.json();
        setMaterials(data.materials ?? []);
      } catch (err) {
        console.error('Failed to load course materials', err);
      }
    }
    loadMaterials();
  }, [courseId]);

  // --- Effect ที่ 4: ดึงความคืบหน้าราย SCO ของเลสสันปัจจุบัน (รันใหม่ทุกครั้งที่สลับเลสสัน) ---
  useEffect(() => {
    async function loadProgress() {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/progress`);
        if (!res.ok) return;
        const data = await res.json();
        setCompletedScos(Array.isArray(data.completedScos) ? data.completedScos : []);
      } catch (err) {
        console.error('Failed to load progress', err);
      }
    }
    loadProgress();
  }, [lessonId]);

  // --- Effect ที่ 5: ดึงรายชื่อบทเรียนทั้งหมดในคอร์ส (โหลดครั้งเดียวตอนเข้าคอร์ส ไม่ต้องรันซ้ำตอนสลับเลสสัน) ---
  useEffect(() => {
    async function loadCourseLessons() {
      try {
        const res = await fetch(`/api/courses/${courseId}/lessons`);
        if (!res.ok) return;
        const data = await res.json();
        setCourseLessons(Array.isArray(data.lessons) ? data.lessons : []);
      } catch (err) {
        console.error('Failed to load course lessons', err);
      }
    }
    loadCourseLessons();
  }, [courseId]);

  // แนบ completed จริงเข้ากับแต่ละ SCO ของเลสสันปัจจุบัน
  const flatItems = useMemo(() => {
    // แบบทดสอบหลังเรียนถูกย้ายไปรวมเป็นข้อสอบระดับคอร์สแล้ว จึงซ่อน SCO quiz รุ่นเดิม
    const items = flattenPlayableItems(manifest?.items ?? []).filter(
      (item) => (item.type ?? item.kind ?? (item.identifier.includes('QUIZ') ? 'quiz' : 'lesson')) !== 'quiz'
    );
    return items.map((item) => ({
      ...item,
      // รองรับทั้ง manifest รุ่นใหม่ (type) และรุ่นเดิม (kind)
      type: item.type ?? item.kind ?? (item.identifier.includes('QUIZ') ? 'quiz' : 'lesson'),
      completed: item.href ? completedScos.includes(item.href) : false,
    }));
  }, [manifest, completedScos]);

  const currentIndex = flatItems.findIndex((i) => i.href === currentPath);
  const currentItem = currentIndex >= 0 ? flatItems[currentIndex] : null;
  const prevItem = currentIndex > 0 ? flatItems[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < flatItems.length - 1 ? flatItems[currentIndex + 1] : null;

  const completedCount = flatItems.filter((i) => i.completed).length;
  const progressPercent = flatItems.length > 0 ? Math.round((completedCount / flatItems.length) * 100) : 0;

  const displayCourseTitle = courseTitle ?? manifest?.organizationTitle ?? 'กำลังโหลด...';
  const displayLessonTitle = lessonTitle ?? currentItem?.title ?? null;

  // แยก Item ปกติกับ Item ควิซ — ใช้ flatItems (มี completed จริงติดมาแล้ว) แทน manifest.items ตรงๆ
  const lessonItems = useMemo(() => {
    return flatItems.filter(
      (item) => item.type === 'lesson' || (!item.type && !item.identifier.includes('QUIZ'))
    );
  }, [flatItems]);

  const quizItems = useMemo(() => {
    return flatItems.filter(
      (item) => item.type === 'quiz' || (!item.type && item.identifier.includes('QUIZ'))
    );
  }, [flatItems]);

  // ลำดับบทเรียนถัดไป/ก่อนหน้าในคอร์ส (ไว้ทำปุ่มข้ามเลสสันในอนาคตถ้าต้องการ)
  const courseLessonIndex = courseLessons.findIndex((l) => l.id === lessonId);

  function handleSelectItem(href: string | null) {
    if (!href || href === currentPath) return;
    setCurrentPath(href);
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }

  // สลับไปเลสสันอื่นในคอร์ส — เปลี่ยน route ทำให้ effect ที่ผูกกับ lessonId รันใหม่ทั้งหมด
  function handleSelectLesson(targetLessonId: string) {
    if (targetLessonId === lessonId) return;
    router.push(`/play/${courseId}/${targetLessonId}`);
  }

  function handleExit() {
    router.push(`/dashboard/student/courses/${courseId}`);
  }

  const previousCourseLesson = courseLessonIndex > 0 ? courseLessons[courseLessonIndex - 1] : null;
  const nextCourseLesson =
    courseLessonIndex >= 0 && courseLessonIndex < courseLessons.length - 1
      ? courseLessons[courseLessonIndex + 1]
      : null;

  function handlePrevious(): void {
    if (prevItem) handleSelectItem(prevItem.href);
    else if (previousCourseLesson) handleSelectLesson(previousCourseLesson.id);
  }

  function handleNext(): void {
    if (nextItem) handleSelectItem(nextItem.href);
    else if (nextCourseLesson) handleSelectLesson(nextCourseLesson.id);
    else router.push(`/dashboard/student/courses/${courseId}/final-exam`);
  }

  function renderMenuItems(items: ScormMenuItem[], depth = 0) {
    return (
      <ul className={depth === 0 ? '' : 'ml-3 border-l border-white/10 pl-2.5'}>
        {items.map((item) => {
          const isActive = currentPath === item.href;
          return (
            <li key={item.identifier} className="my-0.5">
              <button
                onClick={() => handleSelectItem(item.href)}
                disabled={!item.href}
                className={`w-full flex items-center gap-2 text-left text-[12.5px] px-2.5 py-2 rounded-lg transition-colors ${
                  item.href
                    ? isActive
                      ? 'bg-blue-500/15 text-white font-semibold border-l-2 border-blue-400 -ml-[2px] pl-[12px]'
                      : 'text-slate-300/80 hover:bg-white/5 hover:text-white'
                    : 'text-slate-500 font-bold uppercase tracking-wide text-[11px] cursor-default pt-3'
                }`}
              >
                {item.href && (
                  <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center">
                    {item.completed ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    ) : (
                      <span className={`block w-1.5 h-1.5 rounded-full ${isActive ? 'bg-blue-400' : 'bg-slate-600'}`} />
                    )}
                  </span>
                )}
                <span className="truncate">{item.title}</span>
              </button>
              {item.children && item.children.length > 0 && renderMenuItems(item.children, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="relative flex h-[100dvh] w-full select-none overflow-hidden bg-[#07101F]">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="ปิดเมนูบทเรียน"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-sm lg:hidden"
        />
      )}
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="fixed inset-y-0 left-0 z-50 flex w-[min(88vw,340px)] shrink-0 flex-col border-r border-white/[0.07] bg-gradient-to-b from-[#111D3D] via-[#0C1732] to-[#081126] shadow-2xl lg:relative lg:z-auto lg:w-[340px] lg:shadow-none">
          <div className="border-b border-white/[0.07] px-5 pb-5 pt-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF795F] to-[#FF5135] text-[12px] font-black text-white shadow-lg shadow-orange-950/20">
                  IE
                </div>
                <div>
                  <p className="text-[13px] font-extrabold text-white">Interact Edu</p>
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.13em] text-slate-500">Learning room</p>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-2.5 text-slate-400 transition-colors hover:bg-white/[0.09] hover:text-white"
                title="ซ่อนเมนู"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            </div>

            <p className="mb-1 text-[16px] font-extrabold leading-snug text-white">
              {displayCourseTitle}
            </p>
            {displayLessonTitle && (
              <p className="text-[12px] text-slate-400 truncate mb-3">{displayLessonTitle}</p>
            )}

            {flatItems.length > 0 && (
              <>
                <div className="mb-2 flex items-center justify-between text-[11.5px] text-slate-400">
                  <span>ความคืบหน้าบทเรียนนี้</span>
                  <span className="font-bold text-blue-300">{progressPercent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF6B50] via-[#FF8B5E] to-[#FBBF24] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {/* โซนที่ 0: บทเรียนทั้งหมดในคอร์ส — สลับได้เลยไม่ต้องออกจากห้องเรียน */}
            {courseLessons.length > 1 && (
              <div className="mb-4 pb-3 border-b border-white/[0.06]">
                <button
                  onClick={() => setLessonListOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500 px-2 py-2"
                >
                  <span>บทเรียนในคอร์สนี้ ({courseLessonIndex >= 0 ? courseLessonIndex + 1 : '–'}/{courseLessons.length})</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform ${lessonListOpen ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {lessonListOpen && (
                  <ul className="px-1">
                    {courseLessons.map((l, idx) => {
                      const isCurrentLesson = l.id === lessonId;
                      return (
                        <li key={l.id} className="my-0.5">
                          <button
                            onClick={() => handleSelectLesson(l.id)}
                            className={`w-full flex items-center gap-2.5 text-left text-[12.5px] px-2.5 py-2.5 rounded-lg transition-colors ${
                              isCurrentLesson
                                ? 'bg-blue-500/15 text-white font-semibold border-l-2 border-blue-400 -ml-[2px] pl-[12px]'
                                : 'text-slate-300/80 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-white/[0.06] text-[10.5px] font-bold">
                              {l.completed ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M5 12l5 5L20 7" />
                                </svg>
                              ) : (
                                idx + 1
                              )}
                            </span>
                            <span className="truncate">{l.title}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* โซนที่ 1: รายการ SCO ของบทเรียนปัจจุบัน */}
            {lessonItems.length > 0 ? (
              renderMenuItems(lessonItems)
            ) : (
              <p className="text-[12.5px] text-slate-500 px-2 py-4">ไม่มีเมนูสำหรับบทเรียนนี้</p>
            )}

            {/* โซนที่ 2: บล็อกควิซแยก (ถ้ามี SCO ควิซ) */}
            {quizItems.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 px-2.5 mb-2">
                  แบบทดสอบหลังเรียน
                </p>
                {quizItems.map((quiz) => {
                  const isActive = currentPath === quiz.href;
                  return (
                    <button
                      key={quiz.identifier}
                      onClick={() => handleSelectItem(quiz.href)}
                      disabled={!quiz.href}
                      className={`w-full flex items-center justify-between text-left text-[12.5px] px-3 py-2.5 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-blue-500/15 border-blue-500/40 text-white font-semibold'
                          : 'bg-white/[0.03] border-white/[0.06] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                          </svg>
                        </div>
                        <span className="truncate">{quiz.title}</span>
                      </div>
                      {quiz.completed && (
                        <span className="shrink-0 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          ผ่านแล้ว
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* โซนที่ 3: เอกสารประกอบ */}
            {materials.length > 0 && (
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <button
                  onClick={() => setMaterialsOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500 px-2 py-2"
                >
                  <span>เอกสารประกอบ</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform ${materialsOpen ? 'rotate-180' : ''}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {materialsOpen && (
                  <ul className="px-1">
                    {materials.map((m) => (
                      <li key={m.id} className="my-0.5">
                        <a
                          href={m.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-[12.5px] text-slate-300/80 hover:bg-white/5 hover:text-white px-2.5 py-2 rounded-lg transition-colors"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="shrink-0 text-slate-500"
                          >
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <path d="M14 2v6h6" />
                          </svg>
                          <span className="truncate">{m.file_name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.07] p-4">
            <button
              onClick={handleExit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-[13px] font-semibold text-slate-200 transition-colors hover:bg-white/[0.11]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Back to course
            </button>
          </div>
        </aside>
      )}

      {/* Main Player View Area */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0B1528]/95 px-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button type="button" onClick={handleExit} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 py-2.5 text-[12px] font-bold text-slate-200 transition hover:bg-white/[0.11] hover:text-white sm:px-4" title="กลับหน้ารายละเอียดคอร์ส">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              <span className="hidden sm:inline">Back</span>
            </button>
            {!sidebarOpen && (
              <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-xl border border-white/[0.09] bg-white/[0.05] p-2.5 text-slate-300 transition-colors hover:bg-white/[0.11] hover:text-white" title="เปิดเมนูบทเรียน">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              </button>
            )}
            <div className="min-w-0">
              <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.13em] text-[#FF846D]">{displayCourseTitle}</p>
              <h1 className="truncate text-[13px] font-bold text-white sm:text-[15px]">{currentItem?.title ?? displayLessonTitle ?? 'กำลังโหลดเนื้อหา'}</h1>
            </div>
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-3">
            {flatItems.length > 0 && <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-slate-300 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{progressPercent}% complete</div>}
            <span className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-bold text-slate-400">{currentIndex >= 0 ? currentIndex + 1 : '–'} / {flatItems.length || '–'}</span>
          </div>
        </header>

        <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_top,#17233A_0%,#07101F_58%)] p-2 sm:p-4 lg:p-5">
          <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/[0.08] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:rounded-2xl">
            {loadError ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0D172A] px-6 text-center text-sm"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">!</span><p className="font-bold text-red-300">โหลดเนื้อหาไม่สำเร็จ</p><p className="text-xs text-slate-500">{loadError}</p></div>
            ) : currentPath ? (
              <iframe ref={iframeRef} key={currentPath} src={`/api/scorm/${courseId}/${lessonId}/${currentPath}`} className="absolute inset-0 h-full w-full border-0 bg-white" title={currentItem?.title ?? displayLessonTitle ?? 'บทเรียน'} allowFullScreen />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0D172A] text-sm text-slate-400"><span className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[#FF795F]" />กำลังโหลดเนื้อหาบทเรียน...</div>
            )}
          </div>
        </div>

        {(flatItems.length > 0 || courseLessons.length > 0) && (
          <footer className="flex h-[76px] shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#0B1528] px-3 sm:px-5">
            <button onClick={handlePrevious} disabled={!prevItem && !previousCourseLesson} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12.5px] font-bold text-slate-300 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 sm:px-4">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg><span className="hidden sm:inline">ก่อนหน้า</span>
            </button>
            <div className="min-w-0 px-3 text-center"><p className="truncate text-[11.5px] font-semibold text-slate-400">{displayLessonTitle ?? currentItem?.title}</p><p className="mt-0.5 text-[10.5px] text-slate-600">บันทึกความคืบหน้าอัตโนมัติ</p></div>
            <button onClick={handleNext} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF684D] to-[#FF8066] px-4 py-2.5 text-[12.5px] font-extrabold text-white shadow-lg shadow-orange-950/20 transition hover:brightness-110 sm:px-5">
              {nextItem ? 'ถัดไป' : nextCourseLesson ? 'บทเรียนถัดไป' : 'ไปทำข้อสอบหลังเรียน'}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
