export default function Loading() {
  return (
    <div className="min-h-screen w-full bg-[#F7F8FA] py-12 px-6 lg:px-8 flex justify-center items-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-[#FF5A3C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[14px] font-medium text-[#0F1B3D]/60">กำลังโหลดรายการ...</p>
      </div>
    </div>
  );
}