"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import ChangePasswordForm from "@/components/ChangePasswordForm";

const supabase = createClient();

export default function StudentSettingsPage(): ReactElement {
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [savedConsentAt, setSavedConsentAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canSave, setCanSave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const saveInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("กรุณาเข้าสู่ระบบก่อนแก้ไขการตั้งค่า");
        const { data, error } = await supabase.from("profiles")
          .select("pdpa_consent_at").eq("id", user.id).single();
        if (error || !data) throw new Error(error?.message ?? "ไม่พบข้อมูลโปรไฟล์ กรุณาติดต่อผู้ดูแลระบบ");
        if (active) {
          setPdpaConsent(!!data.pdpa_consent_at);
          setSavedConsentAt(data.pdpa_consent_at);
          setCanSave(true);
        }
      } catch (error) {
        if (active) setMessage({ type: "error", text: error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่" });
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function handleSave() {
    if (!canSave || saveInFlight.current || pdpaConsent === !!savedConsentAt) return;
    saveInFlight.current = true;
    setIsSaving(true);
    setMessage(null);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("กรุณาเข้าสู่ระบบก่อนแก้ไขการตั้งค่า");
      const { data, error } = await supabase.from("profiles")
        .update({ pdpa_consent_at: pdpaConsent ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
        .eq("id", user.id).select("id, pdpa_consent_at").maybeSingle();
      if (error || !data) throw new Error(error?.message ?? "ไม่พบโปรไฟล์ที่แก้ไขได้ กรุณาติดต่อผู้ดูแลระบบ");
      setSavedConsentAt(data.pdpa_consent_at);
      setMessage({ type: "success", text: "บันทึกความยินยอมเรียบร้อยแล้ว" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง" });
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="py-8 text-center text-[13.5px] text-slate-400">กำลังโหลด...</p>;

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="mb-1 text-[24px] font-bold text-blue-950">การตั้งค่า</h1>
        <p className="text-[14px] text-slate-500">จัดการความปลอดภัยและความเป็นส่วนตัวของคุณ</p>
        <p className="mt-3 text-[13px] text-slate-500">ต้องการแก้ไขชื่อหรือรูปภาพ? <Link href="/dashboard/student/profile" className="font-semibold text-[#3157D5] hover:underline">ไปที่โปรไฟล์ของฉัน</Link></p>
      </div>
      <section>
        <h2 className="mb-4 text-[15px] font-bold text-slate-900">ความปลอดภัย</h2>
        <ChangePasswordForm />
      </section>
      <section aria-busy={isSaving}>
        <h2 className="mb-4 text-[15px] font-bold text-slate-900">ความเป็นส่วนตัว</h2>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" checked={pdpaConsent} disabled={!canSave || isSaving}
            onChange={(event) => { setPdpaConsent(event.target.checked); setMessage(null); }}
            className="mt-0.5 h-4 w-4 accent-blue-950" />
          <span className="text-[13px] text-slate-600">
            ฉันยินยอมให้เก็บและใช้ข้อมูลส่วนบุคคลตาม{" "}
            <button
              type="button"
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); setShowPolicy(true); }}
              className="font-semibold text-blue-950 underline underline-offset-2 hover:text-blue-800"
            >
              นโยบายความเป็นส่วนตัว (PDPA)
            </button>
          </span>
        </label>
        {message && (
          <p role={message.type === "error" ? "alert" : "status"} className={"mt-4 text-[13px] font-medium " + (message.type === "success" ? "text-emerald-600" : "text-red-500")}>{message.text}</p>
        )}
        <button type="button" onClick={handleSave} disabled={!canSave || isSaving || pdpaConsent === !!savedConsentAt}
          className="mt-5 rounded-lg bg-blue-950 px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-blue-900 disabled:opacity-50">
          {isSaving ? "กำลังบันทึก..." : "บันทึกความยินยอม"}
        </button>
      </section>

      {showPolicy && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pdpa-policy-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          onClick={() => setShowPolicy(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h3 id="pdpa-policy-title" className="text-[16px] font-bold text-blue-950">
                นโยบายความเป็นส่วนตัว (PDPA)
              </h3>
              <button
                type="button"
                onClick={() => setShowPolicy(false)}
                aria-label="ปิด"
                className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-[13px] leading-relaxed text-slate-600">
              <section>
                <h4 className="mb-1 text-[13.5px] font-bold text-slate-900">ข้อมูลที่เราเก็บ</h4>
                <p>ชื่อ-นามสกุล อีเมล เบอร์โทรศัพท์ (ถ้ามี) รูปโปรไฟล์ ข้อมูลการลงทะเบียนเรียนและความคืบหน้าการเรียน และประวัติการชำระเงินสำหรับคอร์สที่มีค่าใช้จ่าย</p>
              </section>
              <section>
                <h4 className="mb-1 text-[13.5px] font-bold text-slate-900">วัตถุประสงค์ในการใช้ข้อมูล</h4>
                <ul className="list-disc space-y-1 pl-5">
                  <li>จัดการบัญชีผู้ใช้และยืนยันตัวตนในการเข้าสู่ระบบ</li>
                  <li>ให้บริการคอร์สเรียน ติดตามความคืบหน้า และออกใบรับรองเมื่อเรียนจบ</li>
                  <li>ดำเนินการชำระเงินและออกหลักฐานการสั่งซื้อ</li>
                  <li>แจ้งเตือนและติดต่อสื่อสารที่เกี่ยวข้องกับการใช้บริการ</li>
                </ul>
              </section>
              <section>
                <h4 className="mb-1 text-[13.5px] font-bold text-slate-900">การเปิดเผยข้อมูลต่อบุคคลที่สาม</h4>
                <p>เราอาจส่งข้อมูลเท่าที่จำเป็นให้ผู้ให้บริการที่เกี่ยวข้อง เช่น ผู้ให้บริการฐานข้อมูล ผู้ให้บริการจัดเก็บไฟล์ และผู้ให้บริการรับชำระเงิน เพื่อให้ระบบทำงานได้ตามปกติเท่านั้น เราไม่ขายข้อมูลส่วนบุคคลของท่านให้บุคคลภายนอก</p>
              </section>
              <section>
                <h4 className="mb-1 text-[13.5px] font-bold text-slate-900">ระยะเวลาการเก็บข้อมูล</h4>
                <p>เราเก็บข้อมูลของท่านไว้ตลอดระยะเวลาที่ยังใช้งานบัญชี และจะเก็บต่อตามระยะเวลาที่กฎหมายกำหนดหลังจากนั้นเท่าที่จำเป็น</p>
              </section>
              <section>
                <h4 className="mb-1 text-[13.5px] font-bold text-slate-900">สิทธิของเจ้าของข้อมูล</h4>
                <p>ท่านมีสิทธิขอเข้าถึง แก้ไข ลบข้อมูล หรือถอนความยินยอมได้ทุกเมื่อ โดยการถอนความยินยอมอาจส่งผลต่อการใช้งานบางฟีเจอร์ของระบบ</p>
              </section>
              <section>
                <h4 className="mb-1 text-[13.5px] font-bold text-slate-900">ติดต่อเรา</h4>
                <p>หากมีข้อสงสัยเกี่ยวกับนโยบายนี้ สามารถติดต่อทีมงานผ่านช่องทางการติดต่อที่ระบุไว้ในเว็บไซต์</p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
