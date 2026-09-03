"use client";

import { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppBrand from "@/components/AppBrand";

type Role = "student" | "teacher";

interface SignUpFormState {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type FieldErrors = Partial<Record<keyof SignUpFormState, string>>;

const initialFormState: SignUpFormState = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

// ตรวจรูปแบบอีเมลแบบคร่าวๆ พอสำหรับ client-side (ยังต้องพึ่ง Supabase ยืนยันอีกชั้นอยู่ดี)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// อนุญาตตัวอักษรไทย/อังกฤษ และเว้นวรรค ห้ามมีตัวเลข/สัญลักษณ์แปลกๆ
const NAME_PATTERN = /^[a-zA-Zก-๙\s.'-]+$/;

const OFFLINE_MESSAGE = "ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบสัญญาณเน็ตของคุณ";

export default function CreateAccountPage() {
  const router = useRouter();
  const [form, setForm] = useState<SignUpFormState>(initialFormState);
  const [role, setRole] = useState<Role>("student");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const supabase = createClient();
  // ref แยกจาก isSubmitting state เพราะ state update เป็น async — ดับเบิลคลิกเร็วๆ อาจมี
  // handleSubmit ตัวที่สองเริ่มทำงานก่อน re-render จะ disable ปุ่มจริง เช็ค ref ตัวนี้ก่อนเลย
  // เพื่อกันยิง request ซ้ำแบบ synchronous ทันทีที่ event ที่สองเข้ามา
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

  const fullNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const fieldRefs: Record<keyof SignUpFormState, React.RefObject<HTMLInputElement | null>> = {
    fullName: fullNameRef,
    email: emailRef,
    password: passwordRef,
    confirmPassword: confirmPasswordRef,
  };
  // ลำดับที่ต้อง auto-focus ไปช่องแรกสุดที่มีปัญหา (บนลงล่างตามหน้าฟอร์ม)
  const FIELD_ORDER: (keyof SignUpFormState)[] = ["fullName", "email", "password", "confirmPassword"];

  const handleChange =
    (field: keyof SignUpFormState) =>
    (e: ChangeEvent<HTMLInputElement>): void => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      // พิมพ์แก้ไขช่องไหน ให้เคลียร์ error ของช่องนั้นทันที ไม่ต้องรอกดส่งใหม่
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};

    const trimmedName = form.fullName.trim();
    if (!trimmedName) {
      errors.fullName = "กรุณากรอกชื่อและนามสกุล";
    } else if (trimmedName.length < 2) {
      errors.fullName = "ชื่อและนามสกุลต้องมีตัวอักษรอย่างน้อย 2 ตัว";
    } else if (!NAME_PATTERN.test(trimmedName)) {
      errors.fullName = "ชื่อและนามสกุลต้องเป็นตัวอักษรเท่านั้น";
    }

    const trimmedEmail = form.email.trim();
    if (!trimmedEmail) {
      errors.email = "กรุณากรอกอีเมล";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      errors.email = "รูปแบบอีเมลไม่ถูกต้อง (ตัวอย่าง: name@example.com)";
    }

    if (!form.password) {
      errors.password = "กรุณากำหนดรหัสผ่าน";
    } else if (form.password.length < 8) {
      errors.password = "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร";
    }

    if (!form.confirmPassword) {
      errors.confirmPassword = "กรุณากำหนดรหัสผ่าน";
    } else if (form.password && form.confirmPassword !== form.password) {
      errors.confirmPassword = "รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง";
    }

    return errors;
  };

  // แปล error จาก Supabase/เครือข่ายให้เป็นภาษาที่เข้าใจง่าย ไม่ใช้ศัพท์เทคนิค
  const toFriendlyMessage = (err: unknown): string => {
    // เช็คซ้ำตอนพัง ณ ตอนนั้นเลย เผื่อเน็ตหลุดไปแล้วระหว่างที่ fetch กำลังวิ่งอยู่
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

    if (message.includes("already registered") || message.includes("already exists") || message.includes("user already")) {
      return "DUPLICATE_EMAIL"; // ใช้เป็น key พิเศษ ให้ฝั่ง render ใส่ลิงก์ไปหน้าเข้าสู่ระบบได้
    }
    if (message.includes("rate limit") || message.includes("too many")) {
      return "คุณทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วค่อยกดใหม่อีกครั้ง";
    }
    // ★ เคสนี้คือตัวที่พังของ TC-Network: บาง browser/dev-tool ปิดเน็ตแล้ว navigator.onLine
    // ไม่ยอมเปลี่ยนเป็น false ทันที เช็คด้านบนจึงหลุดผ่านมา ทำให้ fetch จริงวิ่งออกไปแล้วพัง
    // ด้วย "Failed to fetch" — เคสนี้คือเน็ตหลุดแน่ๆ ต้องตอบเป็นข้อความออฟไลน์ ไม่ใช่ข้อความ
    // ระบบขัดข้องทั่วไป (เก็บ timeout ไว้ต่างหากเพราะนั่นคือเซิร์ฟเวอร์ตอบช้า ไม่ใช่ไม่มีเน็ต)
    if (message.includes("failed to fetch") || message.includes("network error") || message.includes("networkerror")) {
      return OFFLINE_MESSAGE;
    }
    if (message.includes("timeout") || message.includes("timed out")) {
      return "ระบบขัดข้องชั่วคราว ไม่สามารถสร้างบัญชีได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในภายหลัง";
    }

    return "ระบบขัดข้องชั่วคราว ไม่สามารถสร้างบัญชีได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในภายหลัง";
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
      setFormError("กรุณากรอกข้อมูลให้ครบถ้วน");
      // auto-focus ไปช่องแรกสุดที่มีปัญหาตามลำดับในฟอร์ม
      const firstInvalidField = FIELD_ORDER.find((field) => errors[field]);
      if (firstInvalidField) {
        fieldRefs[firstInvalidField].current?.focus();
      }
      return;
    }

    setFieldErrors({});
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // สร้าง User ในระบบ Auth หลัก
      // หมายเหตุ: ไม่ต้อง insert ลงตาราง profiles เองอีกต่อไป
      // เพราะมี Postgres trigger (on_auth_user_created) คอยสร้าง profile
      // ให้อัตโนมัติจากค่าใน options.data ด้านล่างนี้อยู่แล้ว
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            full_name: form.fullName.trim(),
            role,
          },
        },
      });

      if (signUpError) {
        console.error("Auth SignUp Error:", signUpError);
        setFormError(toFriendlyMessage(signUpError));
        return;
      }

      if (data.user) {
        console.log("Account created, profile will be auto-created by trigger for ID:", data.user.id);

        setSuccessEmail(form.email);
        setForm(initialFormState);

        // หน่วงเวลา 2 วินาทีให้เห็นสถานะสำเร็จ แล้วพาวิ่งไปหน้าแรก (Landing Page)
        setTimeout(() => {
          router.push("/");
        }, 2000);
      }
    } catch (err) {
      console.error("Unexpected sign up error:", err);
      setFormError(toFriendlyMessage(err));
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
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#3157D5]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-[#FF5A3C]/10 blur-3xl" />
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex justify-center"><AppBrand /></div>
        <div className="rounded-[30px] border border-white/80 bg-white/90 px-8 py-10 shadow-[0_32px_80px_-24px_rgba(15,27,61,0.24)] backdrop-blur-xl sm:px-10 sm:py-12">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0F1B3D,#3157D5)] shadow-lg shadow-[#3157D5]/15">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3L21 7.5L12 12L3 7.5L12 3Z"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 10.5V16C6 16 8.5 18.5 12 18.5C15.5 18.5 18 16 18 16V10.5"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <h1 className="text-[23px] leading-tight font-bold text-blue-950 tracking-[-0.01em]">
              สร้างบัญชีของคุณ
            </h1>
            <p className="mt-2.5 text-[14px] text-slate-500 leading-relaxed max-w-[300px]">
              เริ่มต้นเรียนรู้หรือแบ่งปันความรู้ในฐานะผู้สอนกับ Interact Edu
            </p>
          </div>

          {/* Success state */}
          {successEmail ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-4 text-center">
              <p className="text-[14px] font-semibold text-emerald-700 mb-1">
                สมัครสมาชิกสำเร็จ!
              </p>
              <p className="text-[13px] text-emerald-600 leading-relaxed">
                บัญชี <span className="font-medium">{successEmail}</span> ถูกสร้างแล้ว คุณสามารถเข้าสู่ระบบได้ทันที
              </p>
            </div>
          ) : (
            <>
              {/* แบนเนอร์สรุปภาพรวมด้านบน — ไม่ลิสต์ทุกช่อง แค่บอกสั้นๆ ว่ามีปัญหาให้ไปดูใต้ช่องที่ขอบแดง */}
              {formError && (
                <div
                  role="alert"
                  className="mb-6 rounded-lg bg-red-50 border border-red-100 px-4 py-3"
                >
                  <p className="text-[13px] font-medium text-red-600 leading-snug">
                    {formError === "DUPLICATE_EMAIL" ? (
                      <>
                        อีเมลนี้มีบัญชีในระบบแล้ว สามารถ{" "}
                        <Link href="/login" className="font-bold underline underline-offset-2">
                          เข้าสู่ระบบ
                        </Link>{" "}
                        ได้ทันที
                      </>
                    ) : (
                      formError
                    )}
                  </p>
                </div>
              )}

              {/* Role toggle */}
              <div className="mb-6">
                <span className="block text-[13px] font-semibold text-slate-700 mb-2">
                  สมัครใช้งานในฐานะ
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={`rounded-lg border px-4 py-3 text-[13.5px] font-semibold transition-colors ${
                      role === "student"
                        ? "border-[#0F1B3D] bg-[#0F1B3D] text-white shadow-md"
                        : "border-slate-200 bg-white text-slate-500 hover:border-[#3157D5]/30 hover:bg-blue-50/50"
                    }`}
                  >
                    ผู้เรียน
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("teacher")}
                    className={`rounded-lg border px-4 py-3 text-[13.5px] font-semibold transition-colors ${
                      role === "teacher"
                        ? "border-[#0F1B3D] bg-[#0F1B3D] text-white shadow-md"
                        : "border-slate-200 bg-white text-slate-500 hover:border-[#3157D5]/30 hover:bg-blue-50/50"
                    }`}
                  >
                    ผู้สอน
                  </button>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div>
                  <label
                    htmlFor="fullName"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    ชื่อและนามสกุล <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={fullNameRef}
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={form.fullName}
                    onChange={handleChange("fullName")}
                    placeholder="ชื่อ นามสกุล"
                    aria-invalid={!!fieldErrors.fullName}
                    aria-describedby={fieldErrors.fullName ? "fullName-error" : undefined}
                    className={`modern-field px-4 py-3 text-[14px] placeholder:text-slate-300 ${
                      fieldErrors.fullName ? "!border-red-400 focus:!border-red-500 focus:!ring-red-200" : ""
                    }`}
                  />
                  {fieldErrors.fullName && (
                    <p id="fullName-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">
                      {fieldErrors.fullName}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    อีเมล <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={emailRef}
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={handleChange("email")}
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
                  <label
                    htmlFor="password"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    รหัสผ่าน <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={passwordRef}
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={handleChange("password")}
                    placeholder="อย่างน้อย 8 ตัวอักษร"
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

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={confirmPasswordRef}
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={handleChange("confirmPassword")}
                    placeholder="••••••••"
                    aria-invalid={!!fieldErrors.confirmPassword}
                    aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-error" : undefined}
                    className={`modern-field px-4 py-3 text-[14px] placeholder:text-slate-300 ${
                      fieldErrors.confirmPassword ? "!border-red-400 focus:!border-red-500 focus:!ring-red-200" : ""
                    }`}
                  />
                  {fieldErrors.confirmPassword && (
                    <p id="confirmPassword-error" className="mt-1.5 text-[12.5px] font-medium text-red-600">
                      {fieldErrors.confirmPassword}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-1 inline-flex w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#FF5A3C,#F04B2D)] px-4 py-3.5 text-[14px] font-bold text-white shadow-[0_14px_28px_-12px_rgba(255,90,60,0.65)] transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "กำลังสร้างบัญชี..." : "สร้างบัญชี"}
                </button>
              </form>
            </>
          )}

          <p className="mt-7 text-center text-[13.5px] text-slate-500">
            มีบัญชีอยู่แล้ว?{" "}
            <Link href="/login" className="font-bold text-[#0F1B3D] transition-colors hover:text-[#FF5A3C]">
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
