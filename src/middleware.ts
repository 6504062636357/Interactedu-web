import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./utils/supabase/middleware";

const ROLE_ROUTES: Record<string, string> = {
  "/dashboard/student": "student",
  "/dashboard/teacher": "teacher",
  "/dashboard/admin": "admin",
};

const PROTECTED_PREFIXES = ["/dashboard"];
const AUTH_ONLY_PAGES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
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
  let userRole: string | undefined;
  const needsRole = user && (isAuthPage || pathname === "/dashboard" || isProtected);

  if (needsRole) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user!.id)
      .single();

    userRole = profile?.role;
    console.log("profile:", profile, "error:", error, "user id:", user!.id);
  }

  // ล็อกอินแล้ว แต่ดันอยู่หน้า login/signup หรือหน้ากลาง /dashboard
  if ((isAuthPage && user) || pathname === "/dashboard") {
    if (userRole === "admin") return NextResponse.redirect(new URL("/dashboard/admin", request.url));
    if (userRole === "teacher") return NextResponse.redirect(new URL("/dashboard/teacher", request.url));
    if (userRole === "student") return NextResponse.redirect(new URL("/dashboard/student", request.url));

    return NextResponse.redirect(new URL("/", request.url));
  }

  // เช็กสิทธิ์ระหว่างห้อง (เช่น นักเรียนแอบเข้าของอาจารย์)
  if (isProtected && user) {
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