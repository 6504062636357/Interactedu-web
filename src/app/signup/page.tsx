"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
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
    if (!form.fullName.trim()) return "Please enter your full name.";
    if (!form.email.trim()) return "Please enter your email address.";
    if (form.password.length < 8) {
      return "Password must be at least 8 characters long.";
    }
    if (form.password !== form.confirmPassword) {
      return "Passwords do not match.";
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
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-[440px]">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_4px_rgba(15,23,42,0.04),0_16px_40px_-16px_rgba(15,23,42,0.14)] px-8 py-10 sm:px-10 sm:py-12">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-12 h-12 mb-6 rounded-xl bg-blue-950 flex items-center justify-center">
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
              Create your account
            </h1>
            <p className="mt-2.5 text-[14px] text-slate-500 leading-relaxed max-w-[300px]">
              Join Interact Edu to start learning or start teaching.
            </p>
          </div>

          {/* Success state */}
          {successEmail ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-4 text-center">
              <p className="text-[14px] font-semibold text-emerald-700 mb-1">
                Registration Successful!
              </p>
              <p className="text-[13px] text-emerald-600 leading-relaxed">
                Your account for <span className="font-medium">{successEmail}</span> has been created.
                You can now sign in to your profile.
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
                  I am joining as a
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={`rounded-lg border px-4 py-3 text-[13.5px] font-semibold transition-colors ${
                      role === "student"
                        ? "border-blue-950 bg-blue-950 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("teacher")}
                    className={`rounded-lg border px-4 py-3 text-[13.5px] font-semibold transition-colors ${
                      role === "teacher"
                        ? "border-blue-950 bg-blue-950 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    Teacher
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
                    Full name
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={form.fullName}
                    onChange={handleChange("fullName")}
                    placeholder="Jane Doe"
                    className="w-full px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg outline-none transition-all duration-150 focus:border-blue-950 focus:ring-2 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={handleChange("email")}
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg outline-none transition-all duration-150 focus:border-blue-950 focus:ring-2 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={handleChange("password")}
                    placeholder="At least 8 characters"
                    className="w-full px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg outline-none transition-all duration-150 focus:border-blue-950 focus:ring-2 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-[13px] font-semibold text-slate-700 mb-1.5"
                  >
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={handleChange("confirmPassword")}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg outline-none transition-all duration-150 focus:border-blue-950 focus:ring-2 focus:ring-blue-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-1 inline-flex items-center justify-center rounded-lg bg-blue-950 px-4 py-3 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-blue-900 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Creating account..." : "Create account"}
                </button>
              </form>
            </>
          )}

          <p className="mt-7 text-center text-[13.5px] text-slate-500">
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-blue-950 hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}