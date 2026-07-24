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

interface LessonProgress {
  videoCompleted: boolean;
  quizPassed: boolean;
}

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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // เอกสารประกอบ
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  // ความคืบหน้าจริงของนักเรียนคนนี้ในบทเรียนนี้
  const [progress, setProgress] = useState<LessonProgress>({
    videoCompleted: false,
    quizPassed: false,
  });

  // --- Effect ที่ 1: ดึงข้อมูล scorm-info ---
  useEffect(() => {
    async function loadInfo() {
      try {
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
    let apiInstance: any;

    if (is2004) {
      apiInstance = new Scorm2004API(settings);
      setupCommitHook(apiInstance, true);
      (window as any).API_1484_11 = apiInstance;
    } else {
      apiInstance = new Scorm12API(settings);
      setupCommitHook(apiInstance, false);
      (window as any).API = apiInstance;
    }

    function setupCommitHook(scormInstance: any, isScorm2004: boolean) {
      scormInstance.on('LMSCommit', () => {
        const lessonStatus = isScorm2004
          ? scormInstance.cmi.completion_status
          : scormInstance.cmi.core.lesson_status;

        const scoreRaw = isScorm2004
          ? scormInstance.cmi.score?.raw
          : scormInstance.cmi.core.score?.raw;

        const suspendData = scormInstance.cmi.suspend_data;

        const scoType = currentPath?.includes('quiz') ? 'quiz' : 'lesson';

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
          }),
        }).then(() => {
          // อัปเดต progress ใน state ทันที ไม่ต้องรอ reload หน้า
          if (scoType === 'quiz') {
            if (lessonStatus === 'passed') {
              setProgress((prev) => ({ ...prev, quizPassed: true }));
            }
          } else {
            if (lessonStatus === 'completed') {
              setProgress((prev) => ({ ...prev, videoCompleted: true }));
            }
          }
        });
      });
    }

    return () => {
      try {
        if ((window as any).API === apiInstance && apiInstance.currentState === apiInstance.STATE_INITIALIZED) {
          apiInstance.LMSFinish('');
        }
      } catch {}
      try {
        if ((window as any).API_1484_11 === apiInstance && apiInstance.currentState === apiInstance.STATE_INITIALIZED) {
          apiInstance.Terminate('');
        }
      } catch {}
      delete (window as any).API;
      delete (window as any).API_1484_11;
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

  // --- Effect ที่ 4: ดึงความคืบหน้าจริงของนักเรียนคนนี้สำหรับบทเรียนนี้ ---
  useEffect(() => {
    async function loadProgress() {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/progress`);
        if (!res.ok) return;
        const data = await res.json();
        setProgress({
          videoCompleted: !!data.videoCompleted,
          quizPassed: !!data.quizPassed,
        });
      } catch (err) {
        console.error('Failed to load progress', err);
      }
    }
    loadProgress();
  }, [lessonId]);

  // แนบ completed จริงเข้ากับแต่ละ item ตามประเภท (lesson ใช้ videoCompleted, quiz ใช้ quizPassed)
  const flatItems = useMemo(() => {
    const items = flattenPlayableItems(manifest?.items ?? []);
    return items.map((item) => {
      const isQuiz = item.type === 'quiz' || item.identifier.includes('QUIZ');
      return {
        ...item,
        completed: isQuiz ? progress.quizPassed : progress.videoCompleted,
      };
    });
  }, [manifest, progress]);

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

  function handleSelectItem(href: string | null) {
    if (!href || href === currentPath) return;
    setCurrentPath(href);
  }

  function handleExit() {
    router.push(`/dashboard/student/courses/${courseId}`);
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
    <div className="w-full h-screen bg-[#0B1220] flex select-none overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-80 bg-gradient-to-b from-[#0F1B3D] to-[#0B1430] border-r border-white/[0.06] flex flex-col shrink-0">
          <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="#60A5FA" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5" stroke="#60A5FA" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
                title="ซ่อนเมนู"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            </div>

            <p className="text-[14.5px] font-bold text-white leading-snug mb-1">
              {displayCourseTitle}
            </p>
            {displayLessonTitle && (
              <p className="text-[12px] text-slate-400 truncate mb-3">{displayLessonTitle}</p>
            )}

            {flatItems.length > 0 && (
              <>
                <div className="flex items-center justify-between text-[11.5px] text-slate-400 mb-1.5">
                  <span>ความคืบหน้า</span>
                  <span className="font-bold text-blue-300">{progressPercent}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {/* โซนที่ 1: รายการบทเรียนปกติ */}
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

          <div className="p-3 border-t border-white/[0.06]">
            <button
              onClick={handleExit}
              className="w-full inline-flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-200 bg-white/[0.06] hover:bg-white/[0.12] px-4 py-2.5 rounded-xl transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              ออกจากห้องเรียน
            </button>
          </div>
        </div>
      )}

      {/* Main Player View Area */}
      <div className="flex-1 h-full flex flex-col min-h-0">
        <div className="h-11 bg-white border-b border-[#0F1B3D]/[0.06] flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-[#0F1B3D]/50 hover:text-[#0F1B3D] transition-colors"
                title="เปิดเมนู"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
            )}
            <span className="text-[13px] font-semibold text-[#0F1B3D]">
              {currentItem?.title ?? 'กำลังโหลดเนื้อหา'}
            </span>
          </div>
          {flatItems.length > 0 && (
            <span className="text-[12px] text-[#0F1B3D]/40 font-medium">
              {currentIndex >= 0 ? currentIndex + 1 : '–'} / {flatItems.length}
            </span>
          )}
        </div>

        <div className="flex-1 relative min-h-0 bg-[#0B1220]">
          {loadError ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-sm">
              <p className="text-red-400 font-medium">โหลดเนื้อหาไม่สำเร็จ</p>
              <p className="text-slate-500 text-xs">{loadError}</p>
            </div>
          ) : currentPath ? (
            <iframe
              ref={iframeRef}
              key={currentPath}
              src={`/api/scorm/${courseId}/${lessonId}/${currentPath}`}
              className="w-full h-full border-0 absolute top-0 left-0"
              allowFullScreen
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
              กำลังโหลดเนื้อหาบทเรียน...
            </div>
          )}
        </div>

        {/* แถบควบคุม ก่อนหน้า/ถัดไป */}
        {flatItems.length > 0 && (
          <div className="h-14 bg-white border-t border-[#0F1B3D]/[0.08] flex items-center justify-between px-5 shrink-0">
            <button
              onClick={() => prevItem && handleSelectItem(prevItem.href)}
              disabled={!prevItem}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0F1B3D] disabled:text-[#0F1B3D]/25 disabled:cursor-not-allowed hover:text-blue-600 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              ก่อนหน้า
            </button>

            <button
              onClick={() => nextItem && handleSelectItem(nextItem.href)}
              disabled={!nextItem}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-[#0F1B3D] hover:bg-blue-700 disabled:bg-[#0F1B3D]/20 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
            >
              ถัดไป
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}