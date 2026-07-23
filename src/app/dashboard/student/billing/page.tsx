import type { ReactElement } from "react";
import { createClient } from "@/utils/supabase/server";

interface BillingCourse {
  title: string;
  cover_image_url: string | null;
  price: number;
}

interface BillingRow {
  id: string;
  status: string;
  payment_slip_url: string | null;
  created_at: string;
  approved_at: string | null;
  courses: BillingCourse;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string): { label: string; className: string } {
  if (status === "approved") return { label: "ชำระเงินแล้ว", className: "bg-[#00B37E] text-white" };
  if (status === "pending") return { label: "รอการชำระเงิน", className: "bg-[#FFCB47] text-[#0F1B3D]" };
  return { label: "ถูกปฏิเสธ", className: "bg-[#0F1B3D]/10 text-[#0F1B3D]/60" };
}

function paymentMethodLabel(price: number, chargeRef: string | null): string {
  if (price === 0) return "ฟรี";
  if (chargeRef) return "ชำระด้วย PromptPay (QR Code)";
  return "ยังไม่ระบุวิธีชำระเงิน";
}

export default async function BillingPage(): Promise<ReactElement> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("enrollments")
    .select("id, status, payment_slip_url, created_at, approved_at, courses(title, cover_image_url, price)")
    .eq("student_id", user!.id)
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as unknown as BillingRow[];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-[22px] font-extrabold text-[#0F1B3D] tracking-[-0.02em]">ประวัติการสั่งซื้อ</h1>
      </div>
      <p className="text-[13.5px] text-[#0F1B3D]/40 font-medium mb-8">{orders.length} รายการ</p>

      {orders.length > 0 ? (
        <div className="space-y-5">
          {orders.map((order) => {
            const badge = statusBadge(order.status);
            const orderCode = order.id.slice(0, 8).toUpperCase();
            return (
              <div key={order.id} className="rounded-2xl border border-[#0F1B3D]/[0.06] overflow-hidden">
                <div
                  className={`flex items-center justify-between px-5 py-3 ${
                    order.status === "approved" ? "bg-[#00B37E]/10" : "bg-[#FFCB47]/15"
                  }`}
                >
                  <span className="text-[13px] font-bold text-[#0F1B3D]">คำสั่งซื้อ: {orderCode}</span>
                  <span className={`text-[11.5px] font-bold px-3 py-1 rounded-full ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="relative w-24 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-[#0F1B3D] to-[#182852] shrink-0">
                    {order.courses.cover_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={order.courses.cover_image_url}
                        alt={order.courses.title}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div className="flex-1">
                    <p className="text-[14.5px] font-bold text-[#0F1B3D] mb-1">{order.courses.title}</p>
                    <p className="text-[12.5px] text-[#0F1B3D]/40 font-medium">
                      วันที่สั่งซื้อ: {formatDateTime(order.created_at)}
                    </p>
                    <p className="text-[12.5px] text-[#0F1B3D]/40 font-medium">
                      วิธีชำระเงิน: {paymentMethodLabel(order.courses.price, order.payment_slip_url)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[12px] text-[#0F1B3D]/40 font-medium mb-1">ยอดชำระ</p>
                    <p className="text-[17px] font-extrabold text-[#0F1B3D]">
                      {order.courses.price === 0 ? "0.00" : order.courses.price.toLocaleString("th-TH")} THB
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#0F1B3D]/15 py-16 text-center">
          <p className="text-[14px] text-[#0F1B3D]/40 font-medium">ยังไม่มีประวัติการสั่งซื้อ</p>
        </div>
      )}
    </div>
  );
}