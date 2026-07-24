// app/dashboard/teacher/layout.tsx
import type { ReactElement, ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import ProfileDropdown from "@/components/ProfileDropdown";
import TeacherSidebar from "@/components/TeacherSidebar";

export default async function TeacherLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split("@")[0] ?? "ผู้ใช้";

  return (
    <div className="min-h-screen w-full bg-[#F7F8FA]">
      <header className="sticky top-0 z-50 bg-white border-b border-[#0F1B3D]/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#0F1B3D] flex items-center justify-center rotate-[-4deg]">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="#FF5A3C" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-[19px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">Interact Edu</span>
            </div>
            <ProfileDropdown displayName={displayName} role="teacher" />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
          <TeacherSidebar />
          <div className="bg-white rounded-3xl border border-[#0F1B3D]/[0.06] min-h-[400px] p-7 sm:p-9">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}