import { createClient } from './supabase/server.js';

/** 현재 로그인 유저 (없으면 null) */
export async function getCurrentUser() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  return user;
}

/** 관리자 여부: ADMIN_EMAIL 과 일치 */
export function isAdmin(user) {
  return !!user && !!process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL;
}
