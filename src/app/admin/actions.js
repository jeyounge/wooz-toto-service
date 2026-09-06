'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser, isAdmin } from '@/lib/auth';

/**
 * 관리자 데이터 갱신 액션 (서버). 인증 재확인 후 수집 트리거.
 * ⚠️ 실제 betinfo 스크래퍼는 3단계에서 이 함수에 연결한다.
 * @param {'round'|'votes'|'results'} kind
 */
export async function refreshData(kind) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: '권한 없음' };

  // TODO(3단계): kind 별 수집 파이프라인
  //  - round:   신규 회차 대진 수집 → wooz_toto_rounds/matches
  //  - votes:   투표율 스냅샷 수집 → wooz_toto_votes
  //  - results: 경기 결과 수집   → wooz_toto_results
  // service_role(createAdminClient)로 서버에서만 수행.

  revalidatePath('/');
  return { ok: true, message: `[${kind}] 인증·경로 정상. 수집 로직은 스크래퍼(3단계)에서 연결됩니다.` };
}
