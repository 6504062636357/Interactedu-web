import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * สร้าง Supabase client + response object สำหรับใช้ใน middleware.ts
 * ทำหน้าที่ refresh session (คุกกี้) ให้อัตโนมัติทุก request
 */
export async function updateSession(request: NextRequest) {
  console.log("→ [middleware] start:", request.nextUrl.pathname); // ★ เพิ่ม

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  console.log("→ [middleware] calling getUser()..."); // ★ เพิ่ม

  // สำคัญ: ต้องเรียก getUser() เพื่อ trigger การ refresh token
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  console.log("→ [middleware] getUser() done. user:", user?.id, "error:", error?.message); // ★ เพิ่ม

  return { supabaseResponse, supabase, user };
}