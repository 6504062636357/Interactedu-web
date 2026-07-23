"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ChangeEvent } from "react";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const supabase = createClient();

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setEmail(e.target.value);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (loginError) {
        setError(loginError.message);
        return;
      }

       if (data.user) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  router.refresh();

      if (profile?.role === "admin") {
    router.push("/dashboard/admin");
  } else if (profile?.role === "teacher") {
    router.push("/dashboard/teacher")
  } else {
    router.push("/");
  }
}
    } catch (catchError) {
      console.error("Login failed:", catchError);
      setError("เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-white flex items-center justify-center px-4 py-12">
      {/* Ambient background blobs, same language as landing hero */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#FF5A3C]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-[#7C5CFF]/10 blur-3xl" />

      <div className="relative w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#0F1B3D] flex items-center justify-center rotate-[-4deg]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M12 3L21 7.5L12 12L3 7.5L12 3Z" stroke="#FF5A3C" strokeWidth="1.8" strokeLinejoin="round" />
              <path
                d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-[19px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
            Interact Edu
          </span>
        </div>

        <div className="bg-white rounded-[28px] border border-[#0F1B3D]/[0.06] shadow-[0_35px_70px_-25px_rgba(15,27,61,0.25)] px-8 py-10 sm:px-10 sm:py-12">
          <div className="flex flex-col items-center text-center mb-8">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#0F1B3D] bg-[#FFCB47] px-3.5 py-1.5 rounded-full mb-5 rotate-[-1.5deg]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0F1B3D]" />
              ยินดีต้อนรับกลับมา
            </span>

            <h1 className="text-[26px] leading-tight font-extrabold text-[#0F1B3D] tracking-[-0.02em]">
              เข้าสู่ระบบ
            </h1>
            <p className="mt-2.5 text-[14px] text-[#0F1B3D]/50 leading-relaxed max-w-[280px] font-medium">
              เข้าถึงคอร์สเรียน ความคืบหน้า และใบรับรองของคุณ
            </p>
          </div>

          {error && (
            <div role="alert" className="mb-6 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
              <p className="text-[13px] font-semibold text-[#EB4A2D] leading-snug">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-1.5">
                อีเมล
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="you@example.com"
                className="w-full px-4 py-3 text-[14px] text-[#0F1B3D] placeholder:text-[#0F1B3D]/30 bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none transition-all duration-150 focus:border-[#0F1B3D]/30 focus:bg-white focus:ring-4 focus:ring-[#0F1B3D]/[0.06]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-[13px] font-bold text-[#0F1B3D]/70">
                  รหัสผ่าน
                </label>
                <a href="#" className="text-[12.5px] font-bold text-[#FF5A3C] hover:underline underline-offset-2">
                  ลืมรหัสผ่าน?
                </a>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="••••••••"
                className="w-full px-4 py-3 text-[14px] text-[#0F1B3D] placeholder:text-[#0F1B3D]/30 bg-[#F7F8FA] border border-[#0F1B3D]/[0.08] rounded-xl outline-none transition-all duration-150 focus:border-[#0F1B3D]/30 focus:bg-white focus:ring-4 focus:ring-[#0F1B3D]/[0.06]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#FF5A3C] hover:bg-[#EB4A2D] px-4 py-4 text-[15px] font-bold text-white transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_12px_28px_-10px_rgba(255,90,60,0.55)]"
            >
              {isSubmitting ? (
                "กำลังเข้าสู่ระบบ..."
              ) : (
                <>
                  เข้าสู่ระบบ
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12H19M19 12L13 6M19 12L13 18"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </>
              )}
            </button>
          </form>

          <p className="mt-7 text-center text-[13.5px] text-[#0F1B3D]/50 font-medium">
            ยังไม่มีบัญชี?{" "}
            <Link href="/signup" className="font-bold text-[#0F1B3D] hover:text-[#FF5A3C] transition-colors">
              สมัครสมาชิก
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}