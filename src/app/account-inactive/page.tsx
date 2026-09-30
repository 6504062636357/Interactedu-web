import LogoutButton from "@/components/LogoutButton";

export default function AccountInactivePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-[#0F1B3D]">บัญชีถูกปิดใช้งาน</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">กรุณาติดต่อผู้ดูแลระบบหากต้องการกลับมาใช้งานบัญชีนี้</p>
        <div className="mx-auto mt-6 w-fit rounded-xl bg-[#0F1B3D] px-3"><LogoutButton /></div>
      </div>
    </main>
  );
}
