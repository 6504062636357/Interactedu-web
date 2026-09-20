"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Mail, Pencil, UserRound } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface Profile {
  full_name: string;
  avatar_url: string;
}

export default function StudentProfileClient({ initialProfile, email, children }: {
  initialProfile: Profile;
  email: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [savedProfile, setSavedProfile] = useState(initialProfile);
  const [fullName, setFullName] = useState(initialProfile.full_name);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const saveInFlight = useRef(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const profile = savedProfile;
  const displayName = profile.full_name || email.split("@")[0] || "นักเรียน";

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  function startEditing() {
    setFullName(savedProfile.full_name);
    setFile(null);
    setPreviewUrl("");
    setMessage(null);
    setIsEditing(true);
  }

  function finishEditing() {
    setFile(null);
    setPreviewUrl("");
    setIsEditing(false);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (!["image/jpeg", "image/png"].includes(selected.type)) {
      setMessage({ type: "error", text: "กรุณาเลือกไฟล์ JPG หรือ PNG" });
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "ไฟล์รูปต้องมีขนาดไม่เกิน 5MB" });
      return;
    }
    setMessage(null);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveInFlight.current) return;
    const name = fullName.trim();
    if (!name) {
      setMessage({ type: "error", text: "กรุณากรอกชื่อ-นามสกุล" });
      return;
    }
    saveInFlight.current = true;
    setIsSaving(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("กรุณาเข้าสู่ระบบก่อนแก้ไขโปรไฟล์");

      let avatarUrl = savedProfile.avatar_url;
      // Upload only on save, so cancelling a preview never changes stored data.
      if (file) {
        const extension = file.type === "image/png" ? "png" : "jpg";
        const path = `${user.id}/avatar-${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from("avatars").upload(path, file);
        if (error) throw new Error("อัปโหลดรูปไม่สำเร็จ: " + error.message);
        avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const { data, error } = await supabase.from("profiles")
        .update({ full_name: name, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id).select("id, full_name, avatar_url").maybeSingle();
      if (error || !data) throw new Error(error?.message ?? "ไม่พบโปรไฟล์ที่แก้ไขได้ กรุณาติดต่อผู้ดูแลระบบ");

      setSavedProfile({ ...savedProfile, full_name: data.full_name ?? name, avatar_url: data.avatar_url ?? "" });
      // Public headers also read auth metadata. Report partial success accurately.
      try {
        const { error: authError } = await supabase.auth.updateUser({
          data: { full_name: data.full_name, avatar_url: data.avatar_url },
        });
        if (authError) throw authError;
        setMessage({ type: "success", text: "บันทึกโปรไฟล์เรียบร้อยแล้ว" });
      } catch {
        setMessage({ type: "error", text: "บันทึกโปรไฟล์แล้ว แต่ปรับชื่อและรูปบนเมนูบัญชีไม่สำเร็จ กรุณาลองบันทึกอีกครั้ง" });
      }
      finishEditing();
      router.refresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" });
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="mb-6">
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#3157D5]">Student profile</p>
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-[#0F1B3D] sm:text-[30px]">{isEditing ? "แก้ไขโปรไฟล์" : "โปรไฟล์ของฉัน"}</h1>
        <p className="mt-1 text-[13px] text-slate-500">{isEditing ? "จัดการชื่อและรูปโปรไฟล์ของคุณ" : "ข้อมูลส่วนตัวและภาพรวมการเรียนรู้ของคุณ"}</p>
      </div>
      {message && (
        <p role={message.type === "error" ? "alert" : "status"} className={`mb-5 rounded-2xl border px-4 py-3 text-[13px] font-medium ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`}>
          {message.text}
        </p>
      )}
      {isEditing ? (
        <form onSubmit={handleSave} aria-busy={isSaving} className="max-w-2xl rounded-[24px] border border-slate-200 bg-white p-5 sm:p-7">
          <fieldset disabled={isSaving} className="space-y-6">
            <legend className="sr-only">แก้ไขข้อมูลส่วนตัว</legend>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-blue-50 text-3xl font-bold text-[#3157D5]">
                {(previewUrl || savedProfile.avatar_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl || savedProfile.avatar_url} alt="ตัวอย่างรูปโปรไฟล์" className="h-full w-full object-cover" />
                ) : displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor="student-avatar" className="mb-2 block text-sm font-semibold text-slate-700">รูปโปรไฟล์</label>
                <input id="student-avatar" type="file" accept="image/jpeg,image/png" onChange={selectAvatar} aria-describedby="student-avatar-help" className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-2 file:font-semibold file:text-blue-950" />
                <p id="student-avatar-help" className="mt-2 text-xs text-slate-400">JPG, PNG ขนาดไม่เกิน 5MB รูปจะเปลี่ยนเมื่อกดบันทึก</p>
              </div>
            </div>
            <div>
              <label htmlFor="student-name" className="mb-2 block text-sm font-semibold text-slate-700">ชื่อ-นามสกุล</label>
              <input id="student-name" autoFocus autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
            <div>
              <label htmlFor="student-email" className="mb-2 block text-sm font-semibold text-slate-700">อีเมล</label>
              <input id="student-email" type="email" value={email} disabled className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500" />
              <p className="mt-2 text-xs text-slate-400">ติดต่อฝ่ายสนับสนุนหากต้องการเปลี่ยนอีเมล</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="rounded-xl bg-[#0F1B3D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#3157D5] disabled:opacity-50">{isSaving ? "กำลังบันทึก..." : "บันทึก"}</button>
              <button type="button" onClick={() => { setFullName(savedProfile.full_name); setMessage(null); finishEditing(); }} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <section className="relative mb-5 overflow-hidden rounded-[28px] bg-[linear-gradient(125deg,#0F1B3D_0%,#1B3267_68%,#3157D5_100%)] p-6 text-white shadow-[0_18px_36px_-22px_rgba(15,27,61,0.7)] sm:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border border-white/10" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-20 h-60 w-60 rounded-full bg-white/[0.04]" />
            <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-end">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[25px] border-4 border-white/25 bg-white/15 shadow-xl sm:h-28 sm:w-28">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="รูปโปรไฟล์" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-extrabold text-white">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/90">
                  <GraduationCap size={14} /> ผู้เรียน
                </span>
                <h2 className="mt-3 break-words text-[25px] font-extrabold tracking-[-0.03em] sm:text-[30px]">{displayName}</h2>
                <p className="mt-1 break-all text-[13px] text-white/70">{email}</p>
              </div>
              <button ref={editButtonRef} type="button" disabled={isSaving} onClick={startEditing}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-[#0F1B3D] shadow-sm transition hover:bg-blue-50"
              >
                <Pencil size={15} /> แก้ไขโปรไฟล์
              </button>
            </div>
          </section>

          <section className="mb-7 grid gap-3 sm:grid-cols-2" aria-label="ข้อมูลส่วนตัว">
            {[
              { label: "ชื่อ-นามสกุล", value: profile?.full_name || "ยังไม่ได้ระบุ", icon: UserRound },
              { label: "อีเมล", value: email || "ยังไม่ได้ระบุ", icon: Mail },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="min-w-0 rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_28px_-24px_rgba(15,27,61,0.35)]">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3157D5]/10 text-[#3157D5]"><Icon size={18} /></div>
                <p className="mt-3 text-[11px] font-semibold text-slate-400">{label}</p>
                <p className="mt-1 break-words text-[13px] font-bold text-[#0F1B3D]">{value}</p>
              </div>
            ))}
          </section>
          {children}
        </>
      )}
    </>
  );
}
