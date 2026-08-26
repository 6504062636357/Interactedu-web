"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
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

const initialFormState: SignUpFormState = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function CreateAccountPage() {
  const router = useRouter();
  const [form, setForm] = useState<SignUpFormState>(initialFormState);
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const supabase = createClient();

  const handleChange =
    (field: keyof SignUpFormState) =>
    (e: ChangeEvent<HTMLInputElement>): void => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const validate = (): string | null => {
    if (!form.fullName.trim()) return "กรุณากรอกชื่อและนามสกุล";
    if (!form.email.trim()) return "กรุณากรอกอีเมล";
    if (form.password.length < 8) {
      return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
    }
    if (form.password !== form.confirmPassword) {
      return "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    // สร้าง User ในระบบ Auth หลัก
    // หมายเหตุ: ไม่ต้อง insert ลงตาราง profiles เองอีกต่อไป
    // เพราะมี Postgres trigger (on_auth_user_created) คอยสร้าง profile
    // ให้อัตโนมัติจากค่าใน options.data ด้านล่างนี้อยู่แล้ว
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.fullName,
          role,
        },
      },
    });

    if (signUpError) {
      console.error("Auth SignUp Error:", signUpError);
      setError(signUpError.message);
      setIsSubmitting(false);
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

    setIsSubmitting(false);
  };

  return (
    <div className="app-canvas relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-12">
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
              {/* Error banner */}
              {error && (
                <div
                  role="alert"
                  className="mb-6 rounded-lg bg-red-50 border border-red-100 px-4 py-3"
                >
                  <p className="text-[13px] font-medium text-red-600 leading-snug">
                    {error}
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
                    ชื่อและนามสกุล
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={form.fullName}
                    onChange={handleChange("fullName")}
                    placeholder="ชื่อ นามสกุล"
                    className="modern-field px-4 py-3 text-[14px] placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    อีเมล
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={handleChange("email")}
                    placeholder="you@example.com"
                    className="modern-field px-4 py-3 text-[14px] placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    รหัสผ่าน
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={handleChange("password")}
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                    className="modern-field px-4 py-3 text-[14px] placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    ยืนยันรหัสผ่าน
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={handleChange("confirmPassword")}
                    placeholder="••••••••"
                    className="modern-field px-4 py-3 text-[14px] placeholder:text-slate-300"
                  />
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
