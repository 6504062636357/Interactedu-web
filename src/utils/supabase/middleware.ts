import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ★ ใส่ timeout ให้ fetch ทุกครั้งที่ supabase-js เรียกออกไป
// ปัญหาที่เจอ: บางครั้ง connection ค้าง (เช่น keep-alive socket ถูกโปรแกรม antivirus/
// remote-desktop ที่รันอยู่บนเครื่อง ดักหรือตัดทิ้งแบบไม่บอก) ทำให้ getUser() แขวนรอ
// เป็นนาทีโดยไม่มี error ใดๆ กลับมา ซึ่งไปบล็อค middleware ทุก request เพราะ matcher
// ครอบทุก path — การใส่ AbortController timeout ทำให้ request ที่ค้างจริงๆ fail เร็ว
// (8 วิ) แทนที่จะแขวนเป็นนาที
function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timeoutId);
    });
  };
}

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
      global: {
        fetch: fetchWithTimeout(8000),
      },
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
  // ★ ครอบ try/catch ไว้ด้วย เผื่อ fetch timeout แล้ว throw AbortError ออกมา
  // ไม่อยากให้ทั้งหน้าเว็บ error ไปเลย แค่ถือว่า user = null (เหมือนยังไม่ login)
  let user = null;
  let error: { message: string } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (err) {
    error = { message: err instanceof Error ? err.message : "getUser() timeout/network error" };
  }

  console.log("→ [middleware] getUser() done. user:", user?.id, "error:", error?.message); // ★ เพิ่ม

  return { supabaseResponse, supabase, user };
}