import type { ReactElement } from "react";
import Link from "next/link";
import AppBrand from "@/components/AppBrand";

export const metadata = {
  title: "นโยบายคุกกี้ | Interact Edu",
};

function Section({ title, children }: { title: string; children: ReactElement | ReactElement[] }) {
  return (
    <section className="mb-8">
      <h2 className="text-[16px] font-bold text-[#0F1B3D] mb-2.5">{title}</h2>
      <div className="text-[13.5px] leading-relaxed text-[#0F1B3D]/70 space-y-2">{children}</div>
    </section>
  );
}

export default function CookiesPage(): ReactElement {
  return (
    <div className="app-canvas min-h-screen w-full">
      <header className="app-topbar sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex h-[74px] items-center justify-between">
            <AppBrand compact />
          </div>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
        <Link href="/courses" className="mb-4 inline-block text-[12.5px] font-semibold text-[#0F1B3D]/40 hover:text-[#0F1B3D]">
          ← กลับหน้าคอร์ส
        </Link>

        <h1 className="text-[26px] font-extrabold text-[#0F1B3D] tracking-[-0.02em] mb-1.5">
          นโยบายคุกกี้
        </h1>
        <p className="text-[13px] text-[#0F1B3D]/40 mb-8">ปรับปรุงล่าสุด: 23 กันยายน 2569</p>

        <div className="bg-white rounded-3xl border border-[#0F1B3D]/[0.06] p-7 lg:p-9">
          <Section title="1. คุกกี้คืออะไร">
            <p>
              คุกกี้ (Cookie) คือไฟล์ข้อมูลขนาดเล็กที่เว็บไซต์จัดเก็บไว้บนเบราว์เซอร์ของท่าน เพื่อช่วยให้เว็บไซต์จดจำข้อมูลบางอย่าง
              เช่น สถานะการเข้าสู่ระบบ ระหว่างที่ท่านใช้งาน
            </p>
          </Section>

          <Section title="2. คุกกี้ที่เราใช้งาน">
            <p>ปัจจุบัน Interact Edu ใช้คุกกี้เพียงประเภทเดียว คือ</p>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#0F1B3D]/10">
                    <th className="py-2 pr-4 font-bold text-[#0F1B3D] whitespace-nowrap">ประเภท</th>
                    <th className="py-2 pr-4 font-bold text-[#0F1B3D]">วัตถุประสงค์</th>
                    <th className="py-2 font-bold text-[#0F1B3D] whitespace-nowrap">อายุการเก็บ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-2.5 pr-4 align-top">
                      <span className="inline-flex text-[11px] font-bold text-[#00B37E] bg-[#00B37E]/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                        จำเป็น
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 align-top">
                      คุกกี้เซสชันเข้าสู่ระบบ (Supabase Auth) ใช้จดจำสถานะการล็อกอินและรักษาความปลอดภัยของบัญชีท่านระหว่างใช้งานเว็บไซต์
                    </td>
                    <td className="py-2.5 align-top whitespace-nowrap">จนกว่าจะออกจากระบบ หรือ session หมดอายุ</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              คุกกี้ประเภทนี้จำเป็นต่อการทำงานพื้นฐานของเว็บไซต์ (เช่น การเข้าสู่ระบบ) จึงไม่สามารถปิดการใช้งานผ่านเว็บไซต์ได้
              เราไม่ใช้คุกกี้เพื่อการวิเคราะห์พฤติกรรม (Analytics) หรือการโฆษณา (Marketing/Advertising) แต่อย่างใด
            </p>
          </Section>

          <Section title="3. เราไม่ใช้คุกกี้เพื่อสิ่งเหล่านี้">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>ไม่มีคุกกี้ติดตามพฤติกรรมผู้ใช้ (Analytics/Tracking)</li>
              <li>ไม่มีคุกกี้โฆษณาหรือการตลาด (Advertising/Marketing)</li>
              <li>ไม่มีการแชร์ข้อมูลคุกกี้ให้บุคคลภายนอก</li>
            </ul>
            <p className="mt-2">หากในอนาคตมีการเพิ่มคุกกี้ประเภทอื่น เราจะปรับปรุงนโยบายนี้และแจ้งให้ท่านทราบ</p>
          </Section>

          <Section title="4. วิธีจัดการหรือลบคุกกี้">
            <p>
              ท่านสามารถลบหรือบล็อกคุกกี้ได้ผ่านการตั้งค่าเบราว์เซอร์ของท่าน อย่างไรก็ตาม หากปิดหรือลบคุกกี้ที่จำเป็น
              ระบบอาจไม่สามารถจดจำสถานะการเข้าสู่ระบบของท่านได้ และอาจทำให้ท่านต้องเข้าสู่ระบบใหม่ทุกครั้งที่เข้าใช้งาน
            </p>
          </Section>

          <Section title="5. การเปลี่ยนแปลงนโยบายคุกกี้">
            <p>
              เราอาจปรับปรุงนโยบายคุกกี้นี้เป็นครั้งคราวให้สอดคล้องกับการให้บริการ การใช้งานเว็บไซต์ต่อไปหลังมีการเปลี่ยนแปลง
              ถือว่าท่านรับทราบนโยบายฉบับปรับปรุงแล้ว
            </p>
          </Section>

          <Section title="6. ติดต่อเรา">
            <p>
              หากมีข้อสงสัยเกี่ยวกับนโยบายคุกกี้นี้ สามารถติดต่อทีมงาน Interact Edu ผ่านช่องทางการติดต่อที่ระบุไว้ในเว็บไซต์ หรือดู{" "}
              <Link href="/terms" className="text-[#FF5A3C] font-semibold hover:underline">
                ข้อตกลงและเงื่อนไขการใช้บริการ
              </Link>{" "}
              ประกอบ
            </p>
          </Section>
        </div>
      </section>
    </div>
  );
}
