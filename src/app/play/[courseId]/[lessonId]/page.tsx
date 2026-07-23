// src/app/dashboard/admin/courses/[courseId]/lessons/[lessonId]/play/page.tsx
'use client';

import { useEffect, useRef, useState, use } from 'react';
import { Scorm12API, Scorm2004API } from 'scorm-again';

interface PlayProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

interface ScormMenuItem {
  identifier: string;
  title: string;
  href: string | null;
  children: ScormMenuItem[];
}

interface ScormManifest {
  organizationTitle: string;
  items: ScormMenuItem[];
}

export default function StandaloneScormPlayer({ params }: PlayProps) {
  const { courseId, lessonId } = use(params);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [scormVersion, setScormVersion] = useState<'1.2' | '2004' | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ScormManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // --- Effect ที่ 1: ดึงข้อมูล scorm-info ครั้งเดียวตอน mount (ไม่เกี่ยวกับการสลับ SCO) ---
  useEffect(() => {
    async function loadInfo() {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/scorm-info`);
        if (!res.ok) throw new Error('Failed to fetch scorm info');
        const data = await res.json();

        setCurrentPath(data.entryPoint);
        setManifest(data.manifest ?? null);
        setScormVersion(data.scormVersion === '2004' ? '2004' : '1.2');
      } catch (err) {
        console.error('SCORM Init Failed', err);
        setLoadError(err instanceof Error ? err.message : 'โหลดเนื้อหาไม่สำเร็จ');
      }
    }
    loadInfo();
  }, [lessonId]);

  // --- Effect ที่ 2: สร้าง API instance ใหม่ทุกครั้งที่สลับ SCO (currentPath เปลี่ยน) ---
  // สำคัญมาก: ห้ามใช้ API instance เดิมซ้ำข้าม SCO เพราะ SCORM spec ห้าม
  // Initialize หลังจาก Finish ไปแล้ว (ตัวเก่าจะค้างสถานะ "finished")
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

        fetch('/api/scorm/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId,
            courseId,
            lessonStatus: lessonStatus || 'incomplete',
            scoreRaw: scoreRaw || 0,
            suspendData: suspendData || '',
          }),
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

  function handleSelectItem(href: string | null) {
    if (!href || href === currentPath) return;
    setCurrentPath(href);
  }

  function renderMenuItems(items: ScormMenuItem[], depth = 0) {
    return (
      <ul className={depth === 0 ? '' : 'ml-3 border-l border-zinc-800 pl-2'}>
        {items.map((item) => (
          <li key={item.identifier} className="my-0.5">
            <button
              onClick={() => handleSelectItem(item.href)}
              disabled={!item.href}
              className={`w-full text-left text-[12.5px] px-2.5 py-1.5 rounded-md transition-colors ${
                item.href
                  ? currentPath === item.href
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-zinc-300 hover:bg-zinc-800'
                  : 'text-zinc-500 font-semibold cursor-default pt-2.5'
              }`}
            >
              {item.title}
            </button>
            {item.children.length > 0 && renderMenuItems(item.children, depth + 1)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="w-full h-screen bg-black flex flex-col select-none">
      <div className="h-12 bg-zinc-900 text-zinc-200 flex items-center justify-between px-6 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          {manifest && manifest.items.length > 0 && (
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="text-zinc-400 hover:text-white transition-colors"
              title="เปิด/ปิดเมนู"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          )}
          <h1 className="text-sm font-medium tracking-wide">
            {manifest?.organizationTitle ?? 'InteractEdu Player'}
          </h1>
        </div>
        <button
          onClick={() => window.close()}
          className="text-xs bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 rounded transition font-medium"
        >
          ปิดหน้าต่าง
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {sidebarOpen && manifest && manifest.items.length > 0 && (
          <div className="w-64 bg-zinc-950 border-r border-zinc-800 overflow-y-auto p-3 shrink-0">
            {renderMenuItems(manifest.items)}
          </div>
        )}

        <div className="flex-1 h-full bg-white relative">
          {loadError ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-zinc-950 text-sm">
              <p className="text-red-400 font-medium">โหลดเนื้อหาไม่สำเร็จ</p>
              <p className="text-zinc-500 text-xs">{loadError}</p>
            </div>
          ) : currentPath ? (
            <iframe
              ref={iframeRef}
              key={currentPath} // บังคับ re-mount iframe ทุกครั้งที่สลับ SCO
              src={`/api/scorm/${courseId}/${lessonId}/${currentPath}`}
              className="w-full h-full border-0 absolute top-0 left-0"
              allowFullScreen
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-400 text-sm">
              กำลังโหลดเนื้อหาบทเรียน...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}