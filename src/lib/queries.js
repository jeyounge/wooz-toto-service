/**
 * queries.js — 서버 데이터 접근 (Supabase, RLS public read).
 * 서버 컴포넌트에서 호출. 순수 확률/규칙 계산은 calibration/rules로 위임.
 */
import { createClient } from './supabase/server.js';
import { TABLES } from './tables.js';

/** 최근 회차 목록 (셀렉터용). */
export async function getRoundsList(limit = 100) {
  const s = await createClient();
  const { data, error } = await s
    .from(TABLES.rounds)
    .select('id, season, round_no, status')
    .order('season', { ascending: false })
    .order('round_no', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRoundsList: ${error.message}`);
  return data ?? [];
}

/** 최신 회차 1건. */
export async function getLatestRound() {
  const s = await createClient();
  const { data, error } = await s
    .from(TABLES.rounds)
    .select('id, season, round_no, status')
    .order('season', { ascending: false })
    .order('round_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestRound: ${error.message}`);
  return data;
}

/**
 * 회차 상세: round 메타 + 14경기(투표율·결과 embed).
 * @param {number|string} id rounds.id
 */
export async function getRoundDetail(id) {
  const s = await createClient();
  const [{ data: round, error: rErr }, { data: matches, error: mErr }] = await Promise.all([
    s.from(TABLES.rounds).select('id, season, round_no, status').eq('id', id).maybeSingle(),
    s
      .from(TABLES.matches)
      .select(
        `id, match_no, league, home, away, kickoff_ts, news_reason, news_updated_ts,
         votes:${TABLES.votes}(vote_h, vote_d, vote_l),
         result:${TABLES.results}(result)`
      )
      .eq('round_id', id)
      .order('match_no', { ascending: true }),
  ]);
  if (rErr) throw new Error(`getRoundDetail round: ${rErr.message}`);
  if (mErr) throw new Error(`getRoundDetail matches: ${mErr.message}`);
  if (!round) return null;

  // embed 정규화: votes 최신 1건, result 1건
  const normalized = (matches ?? []).map((m) => ({
    id: m.id,
    match_no: m.match_no,
    league: m.league,
    home: m.home,
    away: m.away,
    kickoff_ts: m.kickoff_ts,
    news_reason: m.news_reason || null,
    news_updated_ts: m.news_updated_ts || null,
    vote: Array.isArray(m.votes) && m.votes.length ? m.votes[0] : null,
    result: Array.isArray(m.result) && m.result.length ? m.result[0].result : null,
  }));
  return { round, matches: normalized };
}
