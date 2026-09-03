"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from "react";
import { createClient } from "@/utils/supabase/client";
import AppBrand from "@/components/AppBrand";

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OFFLINE_MESSAGE = "ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบสัญญาณ Wi-Fi หรือเน็ตมือถือ แล้วลองใหม่อีกครั้ง";
const SYSTEM_ERROR_MESSAGE = "ระบบขัดข้องชั่วคราว ไม่สามารถเข้าสู่ระบบได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในภายหลัง";
// ใช้ข้อความกลางเดียวกันทั้งกรณีอีเมลไม่มีในระบบ และรหัสผ่านผิด — ไม่ระบุเจาะจงว่าจุดไหนผิด
// เพื่อความปลอดภัย (ป้องกันการเดาว่าอีเมลไหนมีอยู่ในระบบจริง)
const INVALID_CREDENTIALS_MESSAGE = "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง";
const RATE_LIMIT_MESSAGE = "คุณลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  const supabase = createClient();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // ref แบบ synchronous กันดับเบิลคลิก/กดรัวๆ ยิง request login ซ้ำ (state update เป็น async)
  const isSubmittingRef = useRef<boolean>(false);

  // แถบแจ้งเตือนด้านบนสุดของจอ: เด้งขึ้นทันทีที่เน็ตหลุด ไม่ต้องรอให้กดส่งฟอร์มก่อนถึงจะรู้
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setEmail(e.target.value);
    setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev));
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setPassword(e.target.value);
    setFieldErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev));
  };

  const validate = (): LoginFieldErrors => {
    const errors: LoginFieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = "กรุณากรอกอีเมล";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = "รูปแบบอีเมลไม่ถูกต้อง (ตัวอย่าง: name@example.com)";
    }
    if (!password) {
      errors.password = "กรุณากรอกรหัสผ่าน";
    }
    return errors;
  };

  // แปล error จาก Supabase/เครือข่ายให้เป็นภาษาที่เข้าใจง่าย ไม่ใช้ศัพท์เทคนิค
  const toFriendlyMessage = (err: unknown): string => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return OFFLINE_MESSAGE;
    }

    const raw =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
    const message = raw.toLowerCase();

    if (message.includes("invalid login credentials") || message.includes("invalid email or password")) {
      return INVALID_CREDENTIALS_MESSAGE;
    }
    if (message.includes("rate limit") || message.includes("too many")) {
      return RATE_LIMIT_MESSAGE;
    }
    // เน็ตหลุดจริงๆ แต่ navigator.onLine ยังไม่ทันเปลี่ยนเป็น false (บาง browser/dev-tool)
    if (message.includes("failed to fetch") || message.includes("network error") || message.includes("networkerror")) {
      return OFFLINE_MESSAGE;
    }
    if (message.includes("timeout") || message.includes("timed out")) {
      return SYSTEM_ERROR_MESSAGE;
    }

    return SYSTEM_ERROR_MESSAGE;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    // กันดับเบิลคลิก/กดรัวๆ ยิง request ซ้ำ — เช็ค ref แบบ synchronous ก่อนแม้แต่จะ setState
    if (isSubmittingRef.current) return;

    setFormError(null);

    // เช็คเน็ตก่อนเลย ไม่ต้องรอ fetch ไปแล้วค่อยพังกลางทาง
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setFormError(OFFLINE_MESSAGE);
      return;
    }

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (errors.email) {
        emailRef.current?.focus();
      } else if (errors.password) {
        passwordRef.current?.focus();
      }
      return;
    }

    setFieldErrors({});
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        console.error("Login failed:", loginError);
        setFormError(toFriendlyMessage(loginError));
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
          router.push("/dashboard/teacher");
        } else {
          router.push("/");
        }
      }
    } catch (catchError) {
      console.error("Login failed:", catchError);
      setFormError(toFriendlyMessage(catchError));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-canvas relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-12">
      {isOffline && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-red-600 px-4 py-2.5 text-center text-[13px] font-semibold text-white shadow-lg"
        >
          คุณกำลังออฟไลน์ ข้อมูลอาจไม่ถูกบันทึก
        </div>
      )}
      {/* Ambient background blobs, same language as landing hero */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#FF5A3C]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-[#7C5CFF]/10 blur-3xl" />

      <div className="relative w-full max-w-[440px]">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <AppBrand />
        </div>

        <div className="rounded-[30px] border border-white/80 bg-white/90 px-8 py-10 shadow-[0_32px_80px_-24px_rgba(15,27,61,0.24)] backdrop-blur-xl sm:px-10 sm:py-12">
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

          {/* แบนเนอร์สรุปภาพรวมด้านบน — ใช้สำหรับ error ที่ไม่ผูกกับช่องใดช่องหนึ่งโดยเฉพาะ
              (เช่น อีเมล/รหัสผ่านไม่ถูกต้อง, rate limit, ระบบขัดข้อง) ส่วน validation รายช่อง
              จะโชว์ใต้ input โดยตรงแทน */}
          {formError && (
            <div role="alert" className="mb-6 rounded-xl bg-[#FF5A3C]/[0.08] border border-[#FF5A3C]/20 px-4 py-3">
              <p className="text-[13px] font-semibold text-[#EB4A2D] leading-snug">{formError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-[13px] font-bold text-[#0F1B3D]/70 mb-1.5">
                อีเมล <span className="text-red-500">*</span>
              </label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="you@example.com"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                className={`modern-field px-4 py-3 text-[14px] placeholder:text-slate-300 ${
                  fieldErrors.email ? "!border-red-400 focus:!border-red-500 focus:!ring-red-200" : ""
                }`}
              />
              {fieldErrors.email && (
                <p id="email-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-[13px] font-bold text-[#0F1B3D]/70">
                  รหัสผ่าน <span className="text-red-500">*</span>
                </label>
                <a href="#" className="text-[12.5px] font-bold text-[#FF5A3C] hover:underline underline-offset-2">
                  ลืมรหัสผ่าน?
                </a>
              </div>
              <input
                ref={passwordRef}
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="••••••••"
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                className={`modern-field px-4 py-3 text-[14px] placeholder:text-slate-300 ${
                  fieldErrors.password ? "!border-red-400 focus:!border-red-500 focus:!ring-red-200" : ""
                }`}
              />
              {fieldErrors.password && (
                <p id="password-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#FF5A3C,#F04B2D)] px-4 py-3.5 text-[14px] font-bold text-white shadow-[0_14px_28px_-12px_rgba(255,90,60,0.65)] transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
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
