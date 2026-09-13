import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./utils/supabase/middleware";

const ROLE_ROUTES: Record<string, string> = {
  "/dashboard/student": "student",
  "/dashboard/teacher": "teacher",
  "/dashboard/admin": "admin",
};

const PROTECTED_PREFIXES = ["/dashboard"];
const AUTH_ONLY_PAGES = ["/login", "/signup"];

export async function proxy(request: NextRequest) {

  // ข้าม prefetch request ของ Next.js ไม่ต้อง refresh session ซ้ำ กัน race กับ navigation จริง
  if (request.headers.get("next-router-prefetch")) {
    return NextResponse.next();
  }
  const { supabaseResponse, supabase, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_ONLY_PAGES.some((p) => pathname.startsWith(p));

  // ยังไม่ login แต่จะเข้าหน้าที่ต้อง protect -> เด้งไป /login
  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // ✅ query profile แค่ครั้งเดียวต่อ request ใช้ร่วมกันทุก block ด้านล่าง
  //
  // [เพิ่มเพดานเวลา] เคยเจอ middleware ค้างถึง 42 วิ ทั้งที่ getUser() มี AbortController
  // timeout 8 วิต่อ 1 fetch อยู่แล้ว — ที่ยังบานปลายได้เพราะ Next.js ยิง middleware ซ้ำหลายรอบ
  // ต่อการเปิด 1 หน้า (RSC prefetch + navigation จริง + บางทีมี devtools เองยิง .well-known
  // มาด้วย — ดูจาก log จริงเห็น "→ [middleware] start:" ซ้ำ path เดียวกัน 2-3 ครั้งติด) ถ้า
  // Supabase สะดุดพอดีตอนนั้น แต่ละรอบเสี่ยงโดน timeout ใกล้ 8 วิพร้อมกันหลายรอบ รวมกันได้
  // หลักสิบวิ — ใส่เพดานรวมของ "query profile" เองอีกชั้น (แยกจาก timeout ของ getUser() ที่มีอยู่
  // แล้วใน middleware.ts) กันไว้ ถ้าเกิน ให้ถือว่า "role ไม่รู้" แล้วปล่อยผ่านแบบระมัดระวังแทนที่จะ
  // ค้างไม่จำกัดเวลา — สำคัญมากตอนสอบจบที่ไม่อยากให้หน้าเว็บค้างกลางอากาศต่อหน้าอาจารย์
  let userRole: string | undefined;
  let roleLookupTimedOut = false;
  const needsRole = user && (isAuthPage || pathname === "/dashboard" || isProtected);

  if (needsRole) {
    const PROFILE_QUERY_TIMEOUT_MS = 5000;
    const timeoutSentinel = Symbol("profile-query-timeout");
    const profileQuery = supabase.from("profiles").select("role").eq("id", user!.id).single();
    const timeoutPromise = new Promise<typeof timeoutSentinel>((resolve) =>
      setTimeout(() => resolve(timeoutSentinel), PROFILE_QUERY_TIMEOUT_MS)
    );

    const result = await Promise.race([profileQuery, timeoutPromise]);

    if (result === timeoutSentinel) {
      roleLookupTimedOut = true;
      console.warn(
        `[middleware] profile lookup เกิน ${PROFILE_QUERY_TIMEOUT_MS}ms (path: ${pathname}, user: ${user!.id}) — ปล่อยผ่านแบบไม่เช็ค role รอบนี้`
      );
    } else {
      const { data: profile, error } = result;
      userRole = profile?.role;
      console.log("profile:", profile, "error:", error, "user id:", user!.id);
    }
  }

  // ล็อกอินแล้ว แต่ดันอยู่หน้า login/signup หรือหน้ากลาง /dashboard
  if ((isAuthPage && user) || pathname === "/dashboard") {
    // role lookup ค้าง — อย่าเด้งไป "/" (จะดูเหมือนถูก logout ทั้งที่ session ยังอยู่) ปล่อยให้
    // หน้าเดิม/หน้ากลางแสดงผลไปก่อน ผู้ใช้กด refresh หรือคลิกเมนูเองได้ตามปกติ
    if (roleLookupTimedOut) return supabaseResponse;

    if (userRole === "admin") return NextResponse.redirect(new URL("/dashboard/admin", request.url));
    if (userRole === "teacher") return NextResponse.redirect(new URL("/dashboard/teacher", request.url));
    if (userRole === "student") return NextResponse.redirect(new URL("/dashboard/student", request.url));

    return NextResponse.redirect(new URL("/", request.url));
  }

  // เช็กสิทธิ์ระหว่างห้อง (เช่น นักเรียนแอบเข้าของอาจารย์)
  // role lookup ค้าง — ไม่รู้ role จริง จะบล็อกไปก็เสี่ยงเตะครู/แอดมินตัวจริงออกจากห้องตัวเองตอน
  // Supabase สะดุด ปล่อยผ่านไปก่อน (หน้าที่มีการเช็คสิทธิ์ซ้ำอีกชั้นในตัว page.tsx เองอยู่แล้ว
  // เช่น lessons/new ที่เช็ค created_by ตรงๆ จะเป็นด่านสุดท้ายที่ยังกันได้จริง)
  if (isProtected && user && !roleLookupTimedOut) {
    const requiredRole = Object.entries(ROLE_ROUTES).find(([prefix]) =>
      pathname.startsWith(prefix)
    )?.[1];

    if (requiredRole && userRole !== requiredRole && userRole !== "admin") {
      const fallback = userRole ? `/dashboard/${userRole}` : "/";
      return NextResponse.redirect(new URL(fallback, request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
