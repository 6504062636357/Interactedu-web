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
  // [งานข้อ 09] เกณฑ์ผ่าน (courses.certificate_pass_percentage) ที่ generator ฝังไว้ตอนสร้าง —
  // มีเฉพาะแพ็กเกจ 'generated' เท่านั้น (ดู lib/scorm/generate.ts buildManifestJson) แพ็กเกจ
  // imported ไม่มีฟิลด์นี้ในตัว manifest JSON ที่เราเก็บ — undefined ถ้าไม่มี
  masteryScore?: number;
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
  loadFromJSON?: (json: Record<string, unknown>) => void;
}

type ScormWindow = Window & { API?: ScormApiLike; API_1484_11?: ScormApiLike };

// สถานะ CMI เดิมของผู้เรียนคนนี้ในบทเรียนนี้ ดึงมาจาก GET /api/scorm/tracking
// เอาไปใส่กลับเข้า API ผ่าน loadFromJSON ก่อนที่ SCO จะเรียก LMSInitialize
interface PriorScormState {
  hasPriorAttempt: boolean;
  lessonStatus: string;
  scoreRaw: string;
  suspendData: string;
  lessonLocation: string;
  completedScos: string[];
  // ก้อน CMI เต็ม (lesson_location, session_time, interactions, objectives ฯลฯ)
  // ที่เก็บไว้ตอน commit ครั้งล่าสุด — null ถ้ายังไม่เคยมี หรือแถวเก่าก่อนงานข้อ 02
  cmiData: Record<string, unknown> | null;
  // [งานข้อ 08] ตัวตนผู้เรียน + โหมดการเรียน — เซิร์ฟเวอร์เป็นคนตัดสิน credit/lessonMode ให้
  // (ดูตรรกะที่ api/scorm/tracking GET) เพราะรู้ role/enrollment จริง ฝั่ง client แค่ป้อนต่อให้ SCO
  studentId: string;
  studentName: string;
  credit: 'credit' | 'no-credit';
  lessonMode: 'normal' | 'browse';
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
  // [งานข้อ 07] 'generated' = แพ็กเกจของแพลตฟอร์มเอง, 'imported' = อัปโหลด .zip ของคนอื่น
  // ใช้กันไม่ให้ heuristic เดาชนิด SCO จากชื่อไฟล์ (ที่ผูกกับ convention ของ generator เราเอง)
  // ไปตีความเนื้อหาจริงของแพ็กเกจภายนอกผิด (เช่นโฟลเดอร์ quizzes/ ของเขาเอง)
  const [scormSource, setScormSource] = useState<'generated' | 'imported' | null>(null);
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

  // true เมื่อ window.API/API_1484_11 ถูกตั้งค่าและโหลด CMI เดิมเสร็จแล้ว
  // ใช้กัน iframe ไม่ให้ขึ้นก่อน เพราะ SCO จะหา window.API ตอน load แค่ครั้งเดียว
  const [apiReady, setApiReady] = useState(false);

  // ความคืบหน้าของ item ที่กำลังเล่นอยู่ (0-1) จาก currentTime/duration ของ <video> ใน iframe
  const [currentItemFraction, setCurrentItemFraction] = useState(0);

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
        setScormSource(data.scormSource === 'imported' ? 'imported' : 'generated');
      } catch (err) {
        console.error('SCORM Init Failed', err);
        setLoadError(err instanceof Error ? err.message : 'โหลดเนื้อหาไม่สำเร็จ');
      }
    }
    loadInfo();
  }, [lessonId]);

  // --- Effect ที่ 2: โหลด CMI เดิมของผู้เรียนกลับเข้า API ก่อน แล้วค่อยสร้าง instance ใหม่ทุกครั้งที่สลับ SCO ---
  // ลำดับสำคัญ: ต้องได้ CMI เดิม -> ใส่เข้า API ผ่าน loadFromJSON -> ตั้ง window.API -> ค่อยให้ iframe ขึ้น (ผูกกับ apiReady)
  // ถ้า iframe ขึ้นก่อน SCO จะหา window.API ไม่เจอตอน load (findAPI ทำครั้งเดียว ไม่ retry)
  useEffect(() => {
    if (!scormVersion || !currentPath) return;

    let cancelled = false;
    let apiInstance: ScormApiLike | null = null;
    const scormWindow = window as ScormWindow;
    const is2004 = scormVersion === '2004';

    setApiReady(false);

    // [บั๊กที่เจอตอนไล่หา objectives.0.score.raw ค้าง "0"] มีจุดยิง ScormAPI.commit() หลายจุด
    // แข่งกันอยู่ (autocommit ของ scorm-again เองทุก 15 วิ, interval เซฟตำแหน่งของเราเองทุก 10 วิ,
    // เหตุการณ์ pause/ended/beforeunload, และตอนตอบควิซ) แต่ละจุด "LMSCommit" ยิง fetch() ของตัวเอง
    // แบบ fire-and-forget ไม่รอกัน ไม่มีคิว — ถ้า Supabase สะดุดจังหวะไหน (Free-tier เจอบ่อย) แล้ว
    // request เก่าที่แคปสภาพ CMI ไว้ตอนยังไม่ตอบ ดันตอบกลับมาเสร็จ "หลัง" request ใหม่ที่มีคำตอบแล้ว —
    // เพราะฝั่งเซิร์ฟเวอร์ (api/scorm/tracking) แทนที่ cmi_data ทั้งก้อนแบบ last-write-wins ไม่มีเช็ค
    // ลำดับ ค่าที่เพิ่งตอบถูกจะโดนข้อมูลเก่าทับกลับ ทั้งที่ setValue/commit ฝั่ง client ทำถูกต้องแล้ว —
    // แก้โดยเรียง fetch() ให้เป็นคิว (ยิงทีละอันตามลำดับที่ LMSCommit เกิดจริง) กันไม่ให้สลับกันเสร็จ
    let commitQueue: Promise<unknown> = Promise.resolve();

    function setupCommitHook(scormInstance: ScormApiLike, isScorm2004: boolean) {
      scormInstance.on('LMSCommit', () => {
        const lessonStatus = isScorm2004
          ? scormInstance.cmi.completion_status
          : scormInstance.cmi.core?.lesson_status;

        const scoreRaw = isScorm2004
          ? scormInstance.cmi.score?.raw
          : scormInstance.cmi.core?.score?.raw;

        const suspendData = scormInstance.cmi.suspend_data;

        // เก็บ cmi ทั้งก้อน ไม่ใช่แค่ 3 ฟิลด์ข้างบน — scorm-again เขียน lesson_location,
        // session_time, cmi.interactions.*, cmi.objectives.* ไว้ในนี้ด้วย ของพวกนี้หายหมด
        // ทุกครั้งที่ปิดหน้า ถ้าไม่ส่งขึ้นมาเก็บ (สำคัญกับแพ็กเกจ SCORM ภายนอกที่ใช้ฟิลด์พวกนี้จริง)
        let cmiData: Record<string, unknown> | null = null;
        try {
          cmiData = JSON.parse(JSON.stringify(scormInstance.cmi)) as Record<string, unknown>;
        } catch (err) {
          // ไม่ให้การ serialize ล้มเหลวไปพัง flow การบันทึกคะแนน/ความคืบหน้าหลัก
          console.warn('[SCORM] serialize cmi ทั้งก้อนไม่สำเร็จ ข้าม cmi_data รอบนี้', err);
        }

        // [งานข้อ 07] เดา scoType จาก path ได้เฉพาะแพ็กเกจ 'generated' เท่านั้น (ผูกกับ convention
        // ตั้งชื่อไฟล์ quiz.html ของ generator เราเอง) — แพ็กเกจ imported เดาแบบนี้ไม่ได้ ถ้ามี
        // โฟลเดอร์ชื่อ quiz/quizzes เป็นเนื้อหาจริงของเขา SCO นั้นจะโดนบังคับให้ต้องได้สถานะ
        // 'passed' ถึงจะนับว่าจบ ซึ่งเนื้อหาทั่วไปไม่มีวันรายงานค่านี้ — ความคืบหน้าจะค้างตลอดกาล
        const scoType = scormSource !== 'imported' && currentPath?.includes('quiz') ? 'quiz' : 'lesson';
        const thisCompleted = scoType === 'quiz' ? lessonStatus === 'passed' : lessonStatus === 'completed';

        // ต่อคิวไว้กับตัวก่อนหน้าเสมอ (ไม่ว่าตัวก่อนหน้าจะสำเร็จหรือ error ก็ยิงตัวถัดไปต่อได้ — แค่
        // ต้อง "รอให้ตัวก่อนหน้าจบก่อน" ไม่ใช่ยิงพร้อมกันหลายตัว) กันปัญหาที่ commit เก่ากว่าเสร็จช้ากว่า
        // ทำให้ cmi_data ล่าสุดโดนทับด้วยของเก่า (ดูคอมเมนต์เต็มด้านบน setupCommitHook)
        commitQueue = commitQueue
          .catch(() => undefined)
          .then(() =>
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
                // ไม่ส่ง key นี้เลยถ้า serialize ไม่สำเร็จ ฝั่ง server จะได้ไม่เอาไปเขียนทับของเดิมด้วยค่าเปล่า
                ...(cmiData ? { cmiData } : {}),
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
            })
          );
      });
    }

    // แปลงสถานะกลางๆ ที่ได้จาก GET /api/scorm/tracking ให้เป็นชื่อ element ตามเวอร์ชันที่ใช้จริง
    // ใช้เป็น fallback เท่านั้น — ถ้ามี cmiData เต็มก้อน (งานข้อ 02) ให้ใช้อันนั้นแทน เพราะ
    // ตัวนี้สร้างจากแค่ 3 ฟิลด์ ไม่มี lesson_location/session_time/interactions/objectives
    function buildCmiJson(prior: PriorScormState): Record<string, unknown> {
      const entry = prior.hasPriorAttempt ? 'resume' : 'ab-initio';

      if (is2004) {
        const completed = prior.lessonStatus === 'completed' || prior.lessonStatus === 'passed';
        const json: Record<string, unknown> = {
          entry,
          completion_status: completed ? 'completed' : 'incomplete',
          success_status:
            prior.lessonStatus === 'passed' ? 'passed' : prior.lessonStatus === 'failed' ? 'failed' : 'unknown',
        };
        // [บั๊กที่เจอตอนไล่ตรวจข้อ 20] อย่าใส่ location ถ้า entry ไม่ใช่ resume — location เก่า
        // (เช่นค้างจาก extractLessonLocationFromCmi ฝั่ง tracking/route.ts) ต้องมีความหมายก็ต่อ
        // เมื่อเราจะ resume จริงเท่านั้น ไม่งั้น generate.ts จะเจอ location > 0 ทั้งที่ entry
        // เป็น ab-initio (ตอนนี้ generate.ts เช็ค entry ประกอบแล้ว แต่กันไว้อีกชั้นให้ CMI เอง
        // สอดคล้องในตัว ไม่ต้องพึ่ง generate.ts อย่างเดียว)
        if (entry === 'resume' && prior.lessonLocation) json.location = prior.lessonLocation;
        if (prior.suspendData) json.suspend_data = prior.suspendData;
        if (prior.scoreRaw) json.score = { raw: prior.scoreRaw };
        return json;
      }

      const core: Record<string, unknown> = {
        entry,
        lesson_status: prior.lessonStatus,
      };
      if (entry === 'resume' && prior.lessonLocation) core.lesson_location = prior.lessonLocation;
      if (prior.scoreRaw) core.score = { raw: prior.scoreRaw };

      const json: Record<string, unknown> = { core };
      if (prior.suspendData) json.suspend_data = prior.suspendData;
      return json;
    }

    // [งานข้อ 08] ตัวตน + โหมดการเรียน — LMS ที่ conform ต้องป้อน student_id/student_name ให้ SCO
    // เสมอ และ credit/lesson_mode ต้องเป็น 'no-credit'/'browse' เวลาที่ครั้งนี้ไม่ถูกนับคะแนนจริง
    // (เซิร์ฟเวอร์ตัดสินมาแล้วจาก GET /api/scorm/tracking — ดูเหตุผลที่นั่น) ไม่ปล่อยเป็นค่า
    // default ของไลบรารี (ปกติเป็นค่าว่าง/คงที่ 'normal'+'credit' เสมอไม่ว่ากรณีไหน)
    function buildIdentityAndModeCmi(
      identity: Pick<PriorScormState, 'studentId' | 'studentName' | 'credit' | 'lessonMode'> | null
    ): Record<string, unknown> {
      // ไม่มีข้อมูลตัวตนเลย (เช่น GET ล้มเหลว) — ปลอดภัยกว่าที่จะสมมติว่าไม่นับคะแนน แทนที่จะเดาว่านับ
      const credit = identity?.credit ?? 'no-credit';
      const lessonMode = identity?.lessonMode ?? 'browse';

      if (is2004) {
        const json: Record<string, unknown> = { credit, mode: lessonMode };
        if (identity?.studentId) json.learner_id = identity.studentId;
        if (identity?.studentName) json.learner_name = identity.studentName;
        return json;
      }

      const core: Record<string, unknown> = { credit, lesson_mode: lessonMode };
      if (identity?.studentId) core.student_id = identity.studentId;
      if (identity?.studentName) core.student_name = identity.studentName;
      return { core };
    }

    // [งานข้อ 09] ส่งเกณฑ์ผ่านให้ SCO ตัดสินตัวเองผ่าน cmi.student_data.mastery_score (SCORM 1.2)
    // — มีเฉพาะแพ็กเกจ 'generated' ที่ generator ฝัง masteryScore ไว้ในตัว manifest JSON เท่านั้น
    // (แพ็กเกจ imported ไม่มีค่านี้ในสิ่งที่เราเก็บ — เราไม่รู้เกณฑ์ที่เจ้าของแพ็กเกจตั้งใจไว้จริง
    // เขามี <adlcp:masteryscore> ของเขาเองในไฟล์ manifest.xml อยู่แล้วถ้าต้องการ ไม่ควรเดา/ยัดค่าทับ)
    // ไม่มี concept นี้ใน SCORM 2004 runtime API แบบเดียวกัน จึงทำเฉพาะ 1.2
    function buildMasteryScoreCmi(): Record<string, unknown> {
      if (is2004 || typeof manifest?.masteryScore !== 'number') return {};
      return { student_data: { mastery_score: manifest.masteryScore } };
    }

    (async () => {
      // 1) ดึงสถานะเดิมของผู้เรียนก่อน — ถ้าล้มเหลวก็ยังเปิดบทเรียนได้ แค่เริ่มใหม่จากศูนย์
      let prior: PriorScormState | null = null;
      try {
        const res = await fetch(
          `/api/scorm/tracking?lessonId=${encodeURIComponent(lessonId)}&courseId=${encodeURIComponent(courseId)}`
        );
        if (res.ok) prior = (await res.json()) as PriorScormState;
      } catch (err) {
        console.warn('[SCORM] โหลดสถานะเดิมไม่สำเร็จ เริ่มใหม่จากศูนย์', err);
      }

      // ผู้ใช้สลับ SCO/เลสสันไปแล้วระหว่างรอ fetch — ทิ้งผลลัพธ์นี้ ปล่อยให้ effect รอบใหม่ทำงานแทน
      if (cancelled) return;

      // 2) สร้าง API instance
      const settings = { autocommit: true, autocommitSeconds: 15, logLevel: 2 };
      apiInstance = is2004
        ? (new Scorm2004API(settings) as unknown as ScormApiLike)
        : (new Scorm12API(settings) as unknown as ScormApiLike);

      setupCommitHook(apiInstance, is2004);

      // 3) ใส่สถานะเดิมกลับเข้าไป ก่อนที่ SCO จะเรียก LMSInitialize
      // ถ้ามี cmi_data เต็มก้อนจากงานข้อ 02 (commit ล่าสุดเคยเก็บไว้) ใช้อันนั้นตรงๆ เลย
      // ได้ทั้ง lesson_location/session_time/interactions/objectives กลับมาครบ ไม่ใช่แค่ 3 ฟิลด์
      // ถ้าไม่มี (แถวเก่าก่อนงานข้อ 02 หรือยังไม่เคย commit เลย) ค่อย fallback ไปสร้างจาก buildCmiJson
      // [งานข้อ 08] ต้องป้อน identity/mode เสมอ แม้ GET /api/scorm/tracking ล้มเหลวจนไม่มี prior
      // เลยก็ตาม (buildIdentityAndModeCmi(null) จะ fallback เป็น no-credit/browse ให้เอง)
      const identityAndModeJson = buildIdentityAndModeCmi(prior);
      // [งานข้อ 09] เกณฑ์ผ่าน — ไม่ขึ้นกับ prior เลย (มาจาก manifest ของเลสสัน ไม่ใช่จากผู้เรียน)
      const masteryScoreJson = buildMasteryScoreCmi();

      if (prior) {
        const hasFullCmiSnapshot =
          prior.cmiData && typeof prior.cmiData === 'object' && Object.keys(prior.cmiData).length > 0;
        const baseCmiJson = hasFullCmiSnapshot ? (prior.cmiData as Record<string, unknown>) : buildCmiJson(prior);

        // [บั๊กที่เจอตอนไล่ตรวจข้อ 20] entry ที่ติดมาใน cmi_data snapshot ของรอบก่อน (กรณี
        // hasFullCmiSnapshot) เป็นค่าที่ค้างจาก "รอบก่อน" เฉยๆ — อาจเป็น "resume" ทั้งที่ตอนนี้
        // hasPriorAttempt กลายเป็น false แล้วจริง (เช่น suspend_data/lesson_status ถูกล้าง
        // ระหว่างนั้น) ต้องคำนวณ entry สดจาก prior.hasPriorAttempt เสมอ ไม่เชื่อค่าที่ติดมากับ
        // snapshot — และถ้า entry จริงคือ ab-initio ต้องกัน lesson_location/location เก่าไม่ให้
        // หลุดเข้า CMI ไปด้วย ไม่งั้น generate.ts (เช็ค cmi.core.entry ประกอบ resumeSeconds แล้ว)
        // จะยังไม่มีอะไรให้ resume แต่ location เก่าที่หลุดเข้ามาจะทำให้พฤติกรรมค้างผิดจุดอื่นแทน
        const freshEntry = prior.hasPriorAttempt ? 'resume' : 'ab-initio';

        // identity/mode/mastery_score ต้องชนะค่าที่อาจติดมากับ cmi_data เต็มก้อนของรอบก่อน (เช่น
        // snapshot เก่าก่อนงานข้อ 08/09 ที่ไม่มีฟิลด์พวกนี้ หรือค่าของรอบก่อนที่ไม่ตรงกับตอนนี้แล้ว)
        //
        // หมายเหตุ: ตั้ง key เป็น `undefined` ตรงๆ ในนี้ไม่ปลอดภัย — loadFromJSON ของ scorm-again
        // อาจวน Object.keys() แล้ว setValue(key, undefined) ทำให้ได้ค่า string "undefined" ติด
        // ไปแทนที่จะเป็นค่าว่าง จึงต้อง delete key ออกจริงๆ หลังประกอบ object เสร็จแทน
        const mergedCmiJson: Record<string, unknown> = is2004
          ? {
              ...baseCmiJson,
              ...identityAndModeJson,
              entry: freshEntry,
            }
          : {
              ...baseCmiJson,
              core: {
                ...(baseCmiJson.core as Record<string, unknown> | undefined),
                ...(identityAndModeJson.core as Record<string, unknown>),
                entry: freshEntry,
              },
              student_data: {
                ...(baseCmiJson.student_data as Record<string, unknown> | undefined),
                ...(masteryScoreJson.student_data as Record<string, unknown> | undefined),
              },
            };

        // ไม่ resume จริง (entry สดคือ ab-initio) -> ลบ location/lesson_location เก่าที่อาจติดมา
        // กับ baseCmiJson ทิ้งจริงๆ ด้วย delete ไม่ใช่แค่ตั้งเป็น undefined (ดูหมายเหตุด้านบน)
        if (freshEntry !== 'resume') {
          if (is2004) {
            delete mergedCmiJson.location;
          } else {
            const core = mergedCmiJson.core as Record<string, unknown> | undefined;
            if (core) delete core.lesson_location;
          }
        }

        try {
          apiInstance.loadFromJSON?.(mergedCmiJson);
        } catch (err) {
          console.error('[SCORM] loadFromJSON ไม่สำเร็จ เริ่มใหม่จากศูนย์แทน', err);
        }
      } else {
        // ไม่มีสถานะเดิมเลย (fetch ล้มเหลว) — อย่างน้อยยังต้องป้อน identity/mode/mastery_score
        // พื้นฐานให้ SCO
        try {
          apiInstance.loadFromJSON?.({ ...identityAndModeJson, ...masteryScoreJson });
        } catch (err) {
          console.error('[SCORM] loadFromJSON (identity เท่านั้น) ไม่สำเร็จ', err);
        }
      }

      // 4) ตั้ง window.API/API_1484_11 แล้วค่อยปล่อยให้ iframe ขึ้น (ผ่าน apiReady)
      // ต้องเช็ค cancelled อีกรอบตรงนี้ — ไม่ใช่แค่ตอนหลัง fetch (บรรทัด ~307) เพราะระหว่างที่
      // await fetch อยู่ effect รอบนี้อาจถูก cleanup ไปแล้ว (deps เปลี่ยนเร็ว, React StrictMode
      // เรียก effect ซ้อนตอน dev) ถ้าไม่เช็คตรงนี้ instance เก่าที่ยังไม่ทัน terminate จะเข้ามา
      // ทับ window.API ของ instance ใหม่ที่ถูกต้องอยู่แล้ว — ผลคือ loadFromJSON ที่เพิ่งใส่ resume
      // state ไปหายไปเงียบๆ เพราะ instance ที่ค้างอยู่บน window.API กลายเป็นตัวที่ไม่มีการ resume
      if (cancelled) {
        try {
          if (apiInstance.currentState === apiInstance.STATE_INITIALIZED) {
            if (is2004) apiInstance.Terminate?.('');
            else apiInstance.LMSFinish?.('');
          }
        } catch {}
        return;
      }

      if (is2004) scormWindow.API_1484_11 = apiInstance;
      else scormWindow.API = apiInstance;

      setApiReady(true);
    })();

    return () => {
      cancelled = true;
      setApiReady(false);
      const instance = apiInstance;
      if (!instance) return;
      try {
        if (scormWindow.API === instance && instance.currentState === instance.STATE_INITIALIZED) {
          instance.LMSFinish?.('');
        }
      } catch {}
      try {
        if (scormWindow.API_1484_11 === instance && instance.currentState === instance.STATE_INITIALIZED) {
          instance.Terminate?.('');
        }
      } catch {}
      delete scormWindow.API;
      delete scormWindow.API_1484_11;
    };
  }, [currentPath, scormVersion, scormSource, manifest, courseId, lessonId]);

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

  // --- Effect ที่ 6: อ่านตำแหน่งวิดีโอปัจจุบันจาก <video> ใน iframe (same-origin) ---
  useEffect(() => {
    setCurrentItemFraction(0);
    if (!currentPath || !apiReady) return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    let video: HTMLVideoElement | null = null;
    let cleanupVideoListeners: (() => void) | undefined;

    function attachVideo() {
      try {
        const doc = iframe?.contentDocument;
        video = doc?.querySelector('video') ?? null;
      } catch {
        video = null;
      }
      if (!video) return;

      let lastReported = -1;
      const update = () => {
        if (!video || !video.duration || Number.isNaN(video.duration)) return;
        const fraction = Math.min(1, video.currentTime / video.duration);
        if (Math.abs(fraction - lastReported) >= 0.01) {
          lastReported = fraction;
          setCurrentItemFraction(fraction);
        }
      };
      video.addEventListener('timeupdate', update);
      video.addEventListener('loadedmetadata', update);
      update();

      cleanupVideoListeners = () => {
        video?.removeEventListener('timeupdate', update);
        video?.removeEventListener('loadedmetadata', update);
      };
    }

    attachVideo();

    const onLoad = () => {
      cleanupVideoListeners?.();
      attachVideo();
    };
    iframe.addEventListener('load', onLoad);

    return () => {
      iframe.removeEventListener('load', onLoad);
      cleanupVideoListeners?.();
    };
  }, [currentPath, apiReady]);

  // แนบ completed จริงเข้ากับแต่ละ SCO ของเลสสันปัจจุบัน
  const flatItems = useMemo(() => {
    // [งานข้อ 07] ตัวกรอง "ซ่อน SCO ควิซรุ่นเดิม" ใช้ได้เฉพาะแพ็กเกจ 'generated' เท่านั้น —
    // เดิมทดสอบท้ายบทของ generator เราเองถูกย้ายไปรวมเป็นข้อสอบระดับคอร์สแล้ว (งานข้อ 03/04)
    // จึงต้องซ่อน SCO ควิซเดิมนั้นทิ้ง แต่แพ็กเกจ 'imported' ไม่มี concept นี้เลย — ถ้าเผลอเดาจาก
    // ชื่อไฟล์/identifier (เช่นมีโฟลเดอร์ quizzes/ เป็นเนื้อหาจริงของเขา) จะไปซ่อนเนื้อหาจริงทิ้งผิดๆ
    const rawItems = flattenPlayableItems(manifest?.items ?? []);
    const items =
      scormSource === 'imported'
        ? rawItems
        : rawItems.filter(
            (item) => (item.type ?? item.kind ?? (item.identifier.includes('QUIZ') ? 'quiz' : 'lesson')) !== 'quiz'
          );
    return items.map((item) => ({
      ...item,
      // รองรับทั้ง manifest รุ่นใหม่ (type) และรุ่นเดิม (kind) — ส่วนการเดาจาก identifier
      // (fallback สุดท้าย) ใช้ได้เฉพาะ 'generated' เท่านั้น ด้วยเหตุผลเดียวกับตัวกรองข้างบน
      type:
        item.type ??
        item.kind ??
        (scormSource !== 'imported' && item.identifier.includes('QUIZ') ? 'quiz' : 'lesson'),
      completed: item.href ? completedScos.includes(item.href) : false,
    }));
  }, [manifest, completedScos, scormSource]);

  const currentIndex = flatItems.findIndex((i) => i.href === currentPath);
  const currentItem = currentIndex >= 0 ? flatItems[currentIndex] : null;
  const prevItem = currentIndex > 0 ? flatItems[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < flatItems.length - 1 ? flatItems[currentIndex + 1] : null;

  // const completedCount = flatItems.filter((i) => i.completed).length;
  // const progressPercent = flatItems.length > 0 ? Math.round((completedCount / flatItems.length) * 100) : 0;
    const completedCount = flatItems.filter((i) => i.completed).length;
  // ถ้า item ปัจจุบันจบแล้ว ไม่ต้องบวก fraction ซ้อน (currentItemFraction อาจค้างที่ 1 หรือ video ยังเล่นซ้ำอยู่)
  const isCurrentItemCompleted = currentItem?.completed ?? false;
  const progressUnits = completedCount + (isCurrentItemCompleted ? 0 : currentItemFraction);
  const progressPercent =
    flatItems.length > 0 ? Math.round((progressUnits / flatItems.length) * 100) : 0;
    
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
            ) : currentPath && apiReady ? (
              <iframe ref={iframeRef} key={`${currentPath}:${apiReady}`} src={`/api/scorm/${courseId}/${lessonId}/${currentPath}`} className="absolute inset-0 h-full w-full border-0 bg-white" title={currentItem?.title ?? displayLessonTitle ?? 'บทเรียน'} allowFullScreen />
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
