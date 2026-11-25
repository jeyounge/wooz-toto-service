'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { TABLES } from '@/lib/tables';
import { MODEL_VERSION } from '@/lib/proto/predict';
import { comboOdds, validateSlip, slipModel } from '@/lib/proto/bets';

/**
 * 내 배팅 기록 저장. 로그인 사용자 세션(anon key + 쿠키)으로 쓰므로 RLS가 본인 행만 허용한다 —
 * service_role을 쓰지 않아 여러 사용자가 써도 서로의 기록을 건드릴 수 없다.
 *
 * @param {{roundId:number, stake:number, note?:string, legs:Array<{game_id:number, pick_idx:number, odds:number}>}} input
 *        odds는 실제 구매한 배당(베트맨 배당 변동 시 사용자가 고친 값). 없으면 현재 배당.
 */
// 0009 마이그레이션 전이면 테이블이 없다 → 원인을 바로 알 수 있게 안내
const noTable = (e) => /PGRST205|42P01/.test(e?.code || '') || /does not exist|Could not find the table/i.test(e?.message || '');
const failMsg = (e) => (noTable(e) ? '배팅 기록 테이블이 아직 없습니다 — Supabase에서 0009 마이그레이션을 먼저 실행하세요.' : `저장 실패: ${e.message}`);

export async function saveProtoBet({ roundId, stake, note, legs }) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { ok: false, message: '로그인 후 기록할 수 있습니다.' };
  if (!Array.isArray(legs) || !legs.length) return { ok: false, message: '선택한 게임이 없습니다.' };

  const ids = [...new Set(legs.map((l) => Number(l.game_id)))];
  const { data: games, error: gErr } = await s.from(TABLES.protoGames)
    .select(`id, round_id, home, away, game_ts, odds_w, odds_d, odds_l, preds:${TABLES.protoPreds}(model_version, p_w, p_d, p_l)`)
    .in('id', ids);
  if (gErr) return { ok: false, message: `게임 조회 실패: ${gErr.message}` };
  const byId = new Map((games || []).map((g) => [g.id, g]));

  const rows = [];
  for (const l of legs) {
    const g = byId.get(Number(l.game_id));
    if (!g || g.round_id !== Number(roundId)) return { ok: false, message: '회차에 없는 게임이 섞여 있습니다.' };
    const i = Number(l.pick_idx);
    const cur = Number([g.odds_w, g.odds_d, g.odds_l][i]);
    if (!(cur > 1)) return { ok: false, message: `${g.home} vs ${g.away}: 발매되지 않은 선택지입니다.` };
    const odds = Number(l.odds) > 1 ? Math.round(Number(l.odds) * 100) / 100 : cur;
    const pred = (g.preds || []).find((p) => p.model_version === MODEL_VERSION);
    const mp = pred ? Number([pred.p_w, pred.p_d, pred.p_l][i]) : null;
    rows.push({ game_id: g.id, pick_idx: i, odds, model_prob: mp, match_key: `${g.home}|${g.away}|${g.game_ts}` });
  }
  const err = validateSlip({ stake: Number(stake), legs: rows });
  if (err) return { ok: false, message: err };

  const total = comboOdds(rows.map((r) => r.odds));
  const { prob } = slipModel(rows, total);
  const { data: bet, error: bErr } = await s.from(TABLES.protoBets).insert({
    user_id: user.id, round_id: Number(roundId), stake: Number(stake), total_odds: total,
    model_prob: prob == null ? null : Math.round(prob * 1e6) / 1e6, note: note?.trim() || null,
  }).select('id').single();
  if (bErr) return { ok: false, message: failMsg(bErr) };

  const { error: lErr } = await s.from(TABLES.protoBetLegs).insert(rows.map(({ match_key, ...r }) => ({ bet_id: bet.id, ...r })));
  if (lErr) {
    await s.from(TABLES.protoBets).delete().eq('id', bet.id);
    return { ok: false, message: failMsg(lErr) };
  }
  revalidatePath('/proto/my');
  return { ok: true, message: `저장 완료 — ${rows.length}게임 · 배당 ${total.toFixed(2)} · ${Number(stake).toLocaleString('ko-KR')}원` };
}

/** 내 배팅 1장 삭제 (RLS: 본인 것만) */
export async function deleteProtoBet(id) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { ok: false, message: '로그인이 필요합니다.' };
  const { error } = await s.from(TABLES.protoBets).delete().eq('id', Number(id)).eq('user_id', user.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/proto/my');
  return { ok: true };
}

/** 실제 받은 적중금 입력 (계산값과 다를 때). 빈 값이면 계산값으로 되돌림 */
export async function setProtoBetPayout(id, payout) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { ok: false, message: '로그인이 필요합니다.' };
  const v = payout === '' || payout == null ? null : Math.max(0, Math.round(Number(payout)));
  if (v != null && !Number.isFinite(v)) return { ok: false, message: '금액 오류' };
  const { error } = await s.from(TABLES.protoBets).update({ payout_actual: v }).eq('id', Number(id)).eq('user_id', user.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/proto/my');
  return { ok: true };
}
