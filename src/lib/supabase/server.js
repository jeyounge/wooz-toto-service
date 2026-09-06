import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 서버(서버 컴포넌트 / Route Handler / Server Action)용 Supabase 클라이언트.
 * anon key + 쿠키 세션. RLS 적용.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
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
            // 서버 컴포넌트에서 호출된 경우 미들웨어가 세션 갱신을 담당하므로 무시 가능.
          }
        },
      },
    }
  );
}

/**
 * 서버 전용 관리자 클라이언트 (service_role).
 * ⚠️ 크론/시드/스크래퍼 등 서버 전용 경로에서만 사용. 클라이언트 노출 절대 금지.
 * RLS를 우회하므로 admin write(수집 파이프라인)에 사용.
 */
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );
}
