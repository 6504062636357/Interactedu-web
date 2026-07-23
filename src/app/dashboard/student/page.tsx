'use client';
import type { ReactElement } from "react";
import LogoutButton from "@/components/LogoutButton";

// ============================================================
// MOCKUP DATA — เพิ่มฟิลด์ isScorm และ lessonId เพื่อทดสอบระบบเล่น SCORM
// ============================================================
const mockStudent = {
  name: "สมชาย ใจดี",
  enrolledCount: 4,
  completedCount: 1,
  certificateCount: 1,
};

const mockEnrolledCourses = [
  { 
    id: "c1", 
    title: "Full-Stack Web Development Bootcamp", 
    tutor: "Kran Suthiwong", 
    progress: 68, 
    nextLesson: "Lesson 12: React Hooks",
    isScorm: true,          // 🔥 เปิดใช้งาน SCORM สำหรับคอร์สนี้เพื่อใช้ทดสอบ
    lessonId: "lesson-12"   // 🔥 ID สมมติของบทเรียน SCORM
  },
  { 
    id: "c2", 
    title: "UI/UX Design Foundations", 
    tutor: "Nira Chaiyapruek", 
    progress: 40, 
    nextLesson: "Lesson 6: Wireframing",
    isScorm: false,
    lessonId: ""
  },
  { 
    id: "c3", 
    title: "Data Analytics with Python", 
    tutor: "Tanawat Srisuk", 
    progress: 15, 
    nextLesson: "Lesson 3: Pandas Basics",
    isScorm: false,
    lessonId: ""
  },
  { 
    id: "c4", 
    title: "Digital Marketing Strategy", 
    tutor: "Ploy Wattanasin", 
    progress: 100, 
    nextLesson: "Completed",
    isScorm: false,
    lessonId: ""
  },
];

const sidebarLinks = [
  { label: "ภาพรวม", active: true },
  { label: "คอร์สของฉัน", active: false },
  { label: "ใบรับรอง", active: false },
  { label: "ตั้งค่าบัญชี", active: false },
];

function SidebarLink({ label, active }: { label: string; active: boolean }): ReactElement {
  return (
    <a
      href="#"
      className={`block px-4 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
        active
          ? "bg-blue-950 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </a>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }): ReactElement {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-5 py-4">
      <p className="text-[13px] text-slate-500 mb-1">{label}</p>
      <p className="text-[24px] font-bold text-blue-950">{value}</p>
    </div>
  );
}

function CourseProgressRow({
  course,
}: {
  course: (typeof mockEnrolledCourses)[number];
}): ReactElement {
  const isDone = course.progress === 100;
  return (
    <div className="flex items-center gap-4 py-4 border-b border-slate-100 last:border-0">
      <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="#1e293b" strokeWidth="1.5" />
          <path d="M8 9H16M8 13H13" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-slate-900 truncate">{course.title}</p>
        <p className="text-[12.5px] text-slate-500">by {course.tutor}</p>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
          <div
            className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-blue-600"}`}
            style={{ width: `${course.progress}%` }}
          />
        </div>
      </div>
      
      {/* ส่วนแสดงผลฝั่งขวา: ปรับเป็น flex เพื่อรองรับปุ่มกดเรียน */}
      <div className="text-right shrink-0 flex items-center gap-4">
        <div>
          <p className={`text-[13px] font-semibold ${isDone ? "text-emerald-600" : "text-blue-600"}`}>
            {course.progress}%
          </p>
          <p className="text-[12px] text-slate-400 mt-0.5">{course.nextLesson}</p>
        </div>

        {/* 🔽 แทรกปุ่มเช็กเงื่อนไข SCORM ตรงนี้ตามที่ต้องการ */}
        {course.isScorm ? (
          <button
            onClick={() => window.open(`/play/${course.id}/${course.lessonId}`, '_blank')}
            className="bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-medium px-4 py-2 rounded-lg transition-colors"
          >
            เรียนต่อเต็มจอ
          </button>
        ) : (
          <button
            onClick={() => alert('ฟังก์ชันเข้าเรียนบทเรียนปกติกำลังพัฒนา...')}
            className="bg-slate-800 hover:bg-slate-900 text-white text-[12.5px] font-medium px-4 py-2 rounded-lg transition-colors"
          >
            เข้าเรียน
          </button>
        )}
      </div>
    </div>
  );
}

export default function StudentDashboardPage(): ReactElement {
  return (
    <div className="min-h-screen w-full bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-slate-100 px-4 py-6">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-blue-950 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-[15.5px] font-bold text-blue-950">Interact Edu</span>
        </div>
        <nav className="space-y-1">
          {sidebarLinks.map((l) => (
            <SidebarLink key={l.label} {...l} />
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-[13px] font-bold text-blue-950">
              {mockStudent.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-slate-800 truncate">{mockStudent.name}</p>
              <p className="text-[12px] text-slate-400">Student</p>
            </div>
          </div>
          <div className="mt-3 px-2">
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-6 py-8 lg:px-10 lg:py-10 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-[26px] font-bold text-blue-950 tracking-[-0.01em]">
            สวัสดี, {mockStudent.name.split(" ")[0]} 👋
          </h1>
          <p className="mt-1.5 text-[14.5px] text-slate-500">
            นี่คือภาพรวมการเรียนของคุณวันนี้
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <StatCard label="คอร์สที่ลงทะเบียน" value={mockStudent.enrolledCount} />
          <StatCard label="คอร์สที่เรียนจบ" value={mockStudent.completedCount} />
          <StatCard label="ใบรับรองที่ได้รับ" value={mockStudent.certificateCount} />
        </div>

        {/* Enrolled courses */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] px-6 py-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[16px] font-bold text-slate-900">คอร์สที่กำลังเรียน</h2>
            <a href="#" className="text-[13px] font-semibold text-blue-950 hover:underline">
              ดูทั้งหมด
            </a>
          </div>
          <div>
            {mockEnrolledCourses.map((course) => (
              <CourseProgressRow key={course.id} course={course} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}