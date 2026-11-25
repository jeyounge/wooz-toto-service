/**
 * protoQueries.js — 프로토 승부식 서버 조회 (RLS public read). 서버 컴포넌트 전용.
 */
import { createClient } from './supabase/server.js';
import { TABLES } from './tables.js';
import { MODEL_VERSION } from './proto/predict.js';
import { aggregateAccuracy } from './proto/accuracy.js';
import { diagnose } from './proto/analysis.js';

const GAME_COLS = `id, match_seq, sport_code, sport, league_code, league, league_short, home, away, game_ts, end_ts,
  bet_type_id, bet_type, bet_name, handi, txt_w, txt_d, txt_l, odds_w, odds_d, odds_l, bets_w, bets_d, bets_l,
  proto_status, result_idx, result_score`;
const PRED_COLS = 'model_version, p_w, p_d, p_l, prob_source, pick_idx, pick_prob, pick_odds, value_idx, value_ev, crowd_share, flags, miss_tags, retro_note';

/** 회차 목록 (최신순) */
export async function getProtoRounds(limit = 60) {
  const s = await createClient();
  const { data, error } = await s.from(TABLES.protoRounds).select('id, gm_ts, sale_end_ts, status').order('gm_ts', { ascending: false }).limit(limit);
  if (error) throw new Error(`getProtoRounds: ${error.message}`);
  return data ?? [];
}

/** 회차 1건 + 전 게임(예측 포함). gmTs 없으면 최신 회차. */
export async function getProtoRoundDetail(gmTs) {
  const s = await createClient();
  let q = s.from(TABLES.protoRounds).select('id, gm_ts, sale_end_ts, status');
  q = gmTs ? q.eq('gm_ts', Number(gmTs)) : q.order('gm_ts', { ascending: false }).limit(1);
  const { data: round, error } = await q.maybeSingle();
  if (error) throw new Error(`getProtoRoundDetail: ${error.message}`);
  if (!round) return null;
  const games = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: gErr } = await s.from(TABLES.protoGames)
      .select(`${GAME_COLS}, preds:${TABLES.protoPreds}(${PRED_COLS})`)
      .eq('round_id', round.id).order('game_ts').order('match_seq').range(from, from + 999);
    if (gErr) throw new Error(`proto games: ${gErr.message}`);
    games.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { round, games: games.map(withPred) };
}

const withPred = (g) => { const { preds, ...rest } = g; return { ...rest, pred: (preds || []).find((p) => p.model_version === MODEL_VERSION) || null }; };

/** 누적 적중률 (결과 확정 + 예측 있는 게임 전체) */
export async function getProtoAccuracy() {
  const s = await createClient();
  const games = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await s.from(TABLES.protoGames)
      .select(`sport, league, league_short, bet_type_id, bet_type, bet_name, result_idx, odds_w, odds_d, odds_l, preds:${TABLES.protoPreds}!inner(${PRED_COLS})`)
      .not('result_idx', 'is', null).range(from, from + 999);
    if (error) throw new Error(`getProtoAccuracy: ${error.message}`);
    games.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const gs = games.map(withPred);
  // 전략 장부: 결과 확정 전 게임을 단폴 1단위로 샀다고 가정한 누적 수익률 (돈을 걸지 않고 전략을 검증)
  return { ...aggregateAccuracy(gs), strategies: diagnose(gs).strategies };
}

/**
 * 로그인 사용자의 배팅 기록 전체 (RLS: 본인 것만). 로그인 안 했으면 {user:null}.
 * 각 슬립에 회차·레그·게임(결과 포함)을 붙여 settleBet/summarizeBets에 바로 넣을 수 있게 돌려준다.
 */
export async function getMyProtoBets() {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return { user: null, bets: [] };
  const { data, error } = await s.from(TABLES.protoBets)
    .select(`id, round_id, stake, total_odds, model_prob, payout_actual, note, is_public, placed_ts,
      round:${TABLES.protoRounds}(gm_ts),
      legs:${TABLES.protoBetLegs}(id, game_id, pick_idx, odds, model_prob,
        game:${TABLES.protoGames}(match_seq, sport_code, league_short, league, home, away, game_ts, bet_type_id, bet_type, bet_name, handi, txt_w, txt_d, txt_l, result_idx, result_score))`)
    .eq('user_id', user.id).order('placed_ts', { ascending: false }).limit(2000);
  if (error) throw new Error(`getMyProtoBets: ${error.message}`);
  return { user: { id: user.id, email: user.email }, bets: (data || []).map((b) => ({ ...b, round_gm_ts: b.round?.gm_ts ?? null })) };
}
