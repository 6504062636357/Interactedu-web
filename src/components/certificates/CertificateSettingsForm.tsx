"use client";

import { Award, ImagePlus, Loader2, Save, ShieldCheck, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRef, useState, type ChangeEvent, type ReactElement } from "react";

interface CertificateSettingsFormProps {
  courseId: string;
  courseTitle?: string;
  initialEnabled: boolean;
  initialPassPercentage: number;
  initialTitle: string | null;
  initialDescription?: string | null;
  initialLogoPath?: string | null;
  initialIssuerName?: string | null;
  initialSignatoryName?: string | null;
  initialSignatoryTitle?: string | null;
}

interface ApiResponse {
  error?: string;
  logoPath?: string;
}

const fieldClass =
  "modern-field mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-[#0F1B3D] outline-none transition placeholder:text-slate-300";
const labelClass = "block text-[11.5px] font-bold text-slate-600";

export default function CertificateSettingsForm({
  courseId,
  courseTitle = "ชื่อหลักสูตรของคุณ",
  initialEnabled,
  initialPassPercentage,
  initialTitle,
  initialDescription = null,
  initialLogoPath = null,
  initialIssuerName = null,
  initialSignatoryName = null,
  initialSignatoryTitle = null,
}: CertificateSettingsFormProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [passPercentage, setPassPercentage] = useState(String(initialPassPercentage));
  const [title, setTitle] = useState(initialTitle ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [issuerName, setIssuerName] = useState(initialIssuerName ?? "");
  const [signatoryName, setSignatoryName] = useState(initialSignatoryName ?? "");
  const [signatoryTitle, setSignatoryTitle] = useState(initialSignatoryTitle ?? "");
  const [logoPath, setLogoPath] = useState(initialLogoPath);
  const [logoVersion, setLogoVersion] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logoUrl = logoPath
    ? `/api/courses/${courseId}/certificate-logo?v=${logoVersion}`
    : null;

  function resetFeedback(): void {
    setError(null);
    setMessage(null);
  }

  async function saveSettings(): Promise<void> {
    const numericPassPercentage = Number(passPercentage);
    resetFeedback();
    if (
      !Number.isFinite(numericPassPercentage) ||
      numericPassPercentage < 0 ||
      numericPassPercentage > 100
    ) {
      setError("คะแนนผ่านต้องอยู่ระหว่าง 0 ถึง 100");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/courses/${courseId}/certificate-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          passPercentage: numericPassPercentage,
          title,
          description,
          issuerName,
          signatoryName,
          signatoryTitle,
        }),
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) throw new Error(data.error || "บันทึกการตั้งค่าไม่สำเร็จ");
      setMessage("บันทึกการปรับแต่งใบประกาศแล้ว");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    resetFeedback();
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("รองรับเฉพาะไฟล์ PNG หรือ JPG เท่านั้น");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("ไฟล์โลโก้ต้องมีขนาดไม่เกิน 2 MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const response = await fetch(`/api/courses/${courseId}/certificate-logo`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok || !data.logoPath) {
        throw new Error(data.error || "อัปโหลดโลโก้ไม่สำเร็จ");
      }
      setLogoPath(data.logoPath);
      setLogoVersion(Date.now());
      setMessage("อัปโหลดโลโก้แล้ว โลโก้จะใช้กับใบประกาศที่ออกใหม่");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "อัปโหลดโลโก้ไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo(): Promise<void> {
    resetFeedback();
    setRemovingLogo(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/certificate-logo`, {
        method: "DELETE",
      });
      const data = (await response.json()) as ApiResponse;
      if (!response.ok) throw new Error(data.error || "ลบโลโก้ไม่สำเร็จ");
      setLogoPath(null);
      setMessage("นำโลโก้ออกแล้ว ใบประกาศจะกลับไปใช้รูปแบบมาตรฐาน");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "ลบโลโก้ไม่สำเร็จ");
    } finally {
      setRemovingLogo(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-[0_18px_60px_rgba(15,27,61,0.07)]">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-orange-50/60 px-5 py-5 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0F1B3D] text-white shadow-lg shadow-slate-900/15">
              <Award size={21} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF5A3C]">
                Certificate Studio
              </p>
              <h2 className="mt-1 text-[19px] font-black tracking-[-0.02em] text-[#0F1B3D]">
                ปรับแต่งใบประกาศของคอร์ส
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-slate-500">
                ใช้เทมเพลตมาตรฐานของ Interact Edu และเพิ่มแบรนด์ของผู้สอนได้
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span>
              <span className="block text-[12px] font-bold text-[#0F1B3D]">เปิดออกใบประกาศ</span>
              <span className="block text-[10.5px] text-slate-400">หลังเรียนครบและผ่านเกณฑ์</span>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="h-5 w-5 accent-[#FF5A3C]"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-7 p-5 sm:p-7 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <ImagePlus size={16} className="text-[#FF5A3C]" />
              <h3 className="text-[13px] font-black text-[#0F1B3D]">โลโก้ผู้สอนหรือองค์กร</h3>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                  {logoUrl ? (
                    <Image
                      key={logoVersion}
                      src={logoUrl}
                      alt="โลโก้บนใบประกาศ"
                      width={112}
                      height={80}
                      unoptimized
                      className="max-h-full w-auto max-w-full object-contain"
                    />
                  ) : (
                    <ImagePlus size={24} className="text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-slate-700">PNG หรือ JPG พื้นหลังโปร่งใสจะดูดีที่สุด</p>
                  <p className="mt-1 text-[10.5px] leading-4 text-slate-400">ขนาดไม่เกิน 2 MB แนะนำสัดส่วนแนวนอน</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={uploading || removingLogo}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-full bg-[#0F1B3D] px-4 py-2 text-[11.5px] font-bold text-white disabled:opacity-50"
                    >
                      {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {uploading ? "กำลังอัปโหลด" : logoPath ? "เปลี่ยนโลโก้" : "อัปโหลดโลโก้"}
                    </button>
                    {logoPath && (
                      <button
                        type="button"
                        disabled={uploading || removingLogo}
                        onClick={removeLogo}
                        className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-[11.5px] font-bold text-red-600 disabled:opacity-50"
                      >
                        {removingLogo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        นำออก
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={uploadLogo}
                className="sr-only"
                aria-label="เลือกไฟล์โลโก้"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>คะแนนผ่าน (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={passPercentage}
                onChange={(event) => setPassPercentage(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>ชื่อใบประกาศ</span>
              <input
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Certificate of Completion"
                className={fieldClass}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>ชื่อผู้สอนหรือองค์กรผู้ออกใบประกาศ</span>
            <input
              value={issuerName}
              maxLength={100}
              onChange={(event) => setIssuerName(event.target.value)}
              placeholder="เช่น บริษัท ตัวอย่าง จำกัด หรือ อาจารย์สมชาย"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>ข้อความเสริม</span>
            <textarea
              value={description}
              maxLength={240}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="ข้อความรับรองหรือรายละเอียดที่ต้องการแสดงใต้ชื่อผู้เรียน"
              className={`${fieldClass} resize-none`}
            />
            <span className="mt-1 block text-right text-[10px] text-slate-400">{description.length}/240</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>ชื่อผู้ลงนาม</span>
              <input
                value={signatoryName}
                maxLength={100}
                onChange={(event) => setSignatoryName(event.target.value)}
                placeholder="ชื่อ–นามสกุล"
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>ตำแหน่งผู้ลงนาม</span>
              <input
                value={signatoryTitle}
                maxLength={100}
                onChange={(event) => setSignatoryTitle(event.target.value)}
                placeholder="เช่น Course Instructor"
                className={fieldClass}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              disabled={saving || uploading || removingLogo}
              onClick={saveSettings}
              className="inline-flex items-center gap-2 rounded-full bg-[#FF5A3C] px-5 py-3 text-[12px] font-black text-white shadow-lg shadow-orange-500/15 transition hover:bg-[#EB4A2D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? "กำลังบันทึก..." : "บันทึกการปรับแต่ง"}
            </button>
            <p className="flex items-center gap-1.5 text-[10.5px] text-slate-400">
              <ShieldCheck size={13} /> มีผลกับใบประกาศที่ออกใหม่เท่านั้น
            </p>
          </div>

          {message && (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[12px] font-semibold text-emerald-700" aria-live="polite">
              {message}
            </p>
          )}
          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-700" role="alert">
              {error}
            </p>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Live preview</p>
              <h3 className="mt-0.5 text-[13px] font-black text-[#0F1B3D]">ตัวอย่างใบประกาศ</h3>
            </div>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-[10px] font-bold text-[#FF5A3C]">A4 แนวนอน</span>
          </div>

          <div
            className="relative overflow-hidden rounded-2xl bg-[#FDFBF5] p-[3.2%] shadow-[0_16px_45px_rgba(15,27,61,0.12)] ring-1 ring-slate-200"
            style={{ aspectRatio: "1.414 / 1" }}
          >
            <div className="relative flex h-full flex-col items-center border-[2px] border-[#0F1B3D] px-[7%] py-[4%] text-center">
              <div className="absolute inset-[5px] border border-[#FF5A3C]/70" />
              <div className="relative z-10 flex min-h-[12%] items-center justify-center gap-3">
                {logoUrl && (
                  <Image
                    key={`preview-${logoVersion}`}
                    src={logoUrl}
                    alt="โลโก้ตัวอย่าง"
                    width={96}
                    height={40}
                    unoptimized
                    className="h-7 w-auto max-w-20 object-contain sm:h-9 sm:max-w-28"
                  />
                )}
                <div className="text-left">
                  <p className="text-[6px] font-black tracking-[0.2em] text-[#FF5A3C] sm:text-[8px]">INTERACT EDU</p>
                  {issuerName && <p className="mt-0.5 max-w-36 truncate text-[6px] font-bold text-[#0F1B3D] sm:text-[7px]">{issuerName}</p>}
                </div>
              </div>

              <p className="relative z-10 mt-[3%] text-[12px] font-black tracking-[-0.03em] text-[#0F1B3D] sm:text-[19px]">
                {title.trim() || "Certificate of Completion"}
              </p>
              <p className="relative z-10 mt-[2%] text-[5px] text-slate-500 sm:text-[7px]">ขอมอบใบประกาศฉบับนี้ให้แก่</p>
              <p className="relative z-10 mt-[2%] border-b border-[#FF5A3C] px-[10%] pb-[1%] text-[10px] font-black text-[#0F1B3D] sm:text-[16px]">
                ชื่อผู้เรียน ตัวอย่าง
              </p>
              <p className="relative z-10 mt-[2%] line-clamp-2 max-w-[78%] text-[5px] leading-relaxed text-slate-500 sm:text-[7px]">
                {description.trim() || "ผ่านการเรียนและการประเมินผลตามเกณฑ์ของหลักสูตร"}
              </p>
              <p className="relative z-10 mt-[2%] line-clamp-1 max-w-[80%] text-[8px] font-black text-[#0F1B3D] sm:text-[12px]">{courseTitle}</p>
              <p className="relative z-10 mt-[1%] text-[5px] text-slate-400 sm:text-[6.5px]">คะแนนผ่าน {passPercentage || "0"}%</p>

              <div className="relative z-10 mt-auto grid w-full grid-cols-3 items-end gap-2 pb-[1%] text-[5px] text-slate-500 sm:text-[6.5px]">
                <div className="text-left"><span className="font-bold text-[#0F1B3D]">วันที่ออก</span><br />25 สิงหาคม 2569</div>
                <div>
                  <span className="block border-b border-slate-400 pb-1 font-bold text-[#0F1B3D]">{signatoryName.trim() || "Interact Edu"}</span>
                  <span className="mt-1 block">{signatoryTitle.trim() || "Authorized learning platform"}</span>
                </div>
                <div className="text-right"><span className="font-bold text-[#0F1B3D]">เลขที่ใบประกาศ</span><br />CERT-EXAMPLE</div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[10.5px] leading-5 text-slate-400">
            ตัวอย่างใช้ข้อมูลจำลอง การจัดวางใน PDF จริงจะปรับขนาดข้อความอัตโนมัติให้เหมาะกับเนื้อหา
          </p>
        </div>
      </div>
    </section>
  );
}
