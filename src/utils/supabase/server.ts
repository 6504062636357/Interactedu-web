import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// ★ เหมือนใน utils/supabase/middleware.ts — กัน request ค้างแบบไม่มี timeout
// (เจอเคส getUser()/query แขวนหลายนาทีตอน connection ค้างเงียบๆ)
function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timeoutId);
    });
  };
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: fetchWithTimeout(10000),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // เรียกจาก Server Component ล้วนๆ (ไม่มี response ให้เซ็ต cookie)
            // ปล่อยผ่านได้ ถ้ามี middleware คอย refresh session อยู่แล้ว
          }
        },
      },
    }
  );
}