'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { TABLES } from '@/lib/tables';

// 스킬 스크립트(final.mjs)와 같은 라벨을 써야 같은 픽으로 인식된다.
const FINAL_LABEL = '🙋 내 최종 픽';
const VALID = /^[승무패]{1,3}$/;

/**
 * 시뮬레이터에서 고른 마킹을 '내 최종 픽'으로 저장한다.
 * 분석 티켓(본 티켓/화끈 등)은 그대로 두고 최종 픽만 교체하므로,
 * 결과가 나온 뒤 "내 결정 vs 분석"을 나란히 비교할 수 있다.
 *
 * @param {{roundId:number|string, picks:Array<{no:number, marks:string}>, note?:string}} input
 */
export async function saveFinalPick({ roundId, picks, note }) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: '권한 없음 — 관리자로 로그인하세요.' };

  if (!Array.isArray(picks) || !picks.length) return { ok: false, message: '마킹이 비어 있습니다.' };
  for (const p of picks) {
    const mk = String(p?.marks ?? '');
    if (!VALID.test(mk) || new Set(mk).size !== mk.length) {
      return { ok: false, message: `#${p?.no} 마킹 오류: ${mk || '(없음)'}` };
    }
  }

  const admin = createAdminClient();
  const { data: round, error: rErr } = await admin
    .from(TABLES.rounds).select('id, season, round_no').eq('id', roundId).maybeSingle();
  if (rErr || !round) return { ok: false, message: '회차를 찾을 수 없습니다.' };

  const combos = picks.reduce((s, p) => s * p.marks.length, 1);

  // 같은 회차의 기존 최종 픽만 교체(분석 티켓은 보존)
  const { data: prev } = await admin
    .from(TABLES.tickets).select('id, structure').eq('round_id', round.id).is('owner_id', null);
  const stale = (prev || []).filter((t) => t.structure === FINAL_LABEL).map((t) => t.id);
  if (stale.length) await admin.from(TABLES.tickets).delete().in('id', stale);

  const { error } = await admin.from(TABLES.tickets).insert({
    round_id: round.id,
    kind: 'main',
    budget: combos,
    combos,
    structure: FINAL_LABEL,
    marks: { note: note?.trim() || null, final: true, picks },
  });
  if (error) return { ok: false, message: `저장 실패: ${error.message}` };

  revalidatePath('/');
  revalidatePath(`/rounds/${round.id}`);
  return { ok: true, message: `최종 픽 저장 완료 — ${combos}조합 (${(combos * 1000).toLocaleString('ko-KR')}원)` };
}
