/**
 * ingest.js — 스크래핑 결과를 DB에 upsert (service_role, 서버 전용).
 * rounds/matches/votes/results + teams 사전 갱신. 리그 판별 적용.
 * vote=0(무효) 경기 제외. votes는 최신 스냅샷 1건 유지.
 */
import { createAdminClient } from '../supabase/admin.js';
import { TABLES } from '../tables.js';
import { leagueOf, normalizeTeam } from '../leagues.js';

const isZeroVote = (r) => r.vote_h === 0 && r.vote_d === 0 && r.vote_l === 0;

function judgeLeague(lh, la) {
  if (lh && la) return lh === la ? lh : '국제';
  return lh || la || null;
}

/**
 * @param {number} totoRound 예: 2026050
 * @param {Array} rows scrapeRound 결과
 * @returns {Promise<{matches:number, votes:number, results:number}>}
 */
export async function ingestRound(totoRound, rows) {
  const admin = createAdminClient();
  const season = String(Math.floor(totoRound / 1000));
  const round_no = totoRound % 1000;
  const valid = rows.filter((r) => !isZeroVote(r));

  // 1) round
  const { data: roundRow, error: rErr } = await admin
    .from(TABLES.rounds)
    .upsert({ season, round_no, status: 'open' }, { onConflict: 'season,round_no' })
    .select()
    .single();
  if (rErr) throw new Error(`round: ${rErr.message}`);
  const roundId = roundRow.id;

  let mCount = 0, vCount = 0, resCount = 0;
  const teamSeen = new Set();

  for (const r of valid) {
    const lh = leagueOf(r.home);
    const la = leagueOf(r.away);
    const league = judgeLeague(lh, la);

    // 2) match
    const { data: mRow, error: mErr } = await admin
      .from(TABLES.matches)
      .upsert(
        { round_id: roundId, match_no: r.match_no, home: r.home, away: r.away, league, kickoff_ts: null },
        { onConflict: 'round_id,match_no' }
      )
      .select()
      .single();
    if (mErr) throw new Error(`match #${r.match_no}: ${mErr.message}`);
    mCount++;

    // 3) votes (최신 스냅샷 1건 유지)
    await admin.from(TABLES.votes).delete().eq('match_id', mRow.id);
    const { error: vErr } = await admin.from(TABLES.votes).insert({
      match_id: mRow.id, vote_h: r.vote_h, vote_d: r.vote_d, vote_l: r.vote_l,
    });
    if (vErr) throw new Error(`votes #${r.match_no}: ${vErr.message}`);
    vCount++;

    // 4) results (승/무/패만)
    if (r.result) {
      const { error: resErr } = await admin
        .from(TABLES.results)
        .upsert({ match_id: mRow.id, result: r.result }, { onConflict: 'match_id' });
      if (resErr) throw new Error(`results #${r.match_no}: ${resErr.message}`);
      resCount++;
    }

    // 5) teams 사전 갱신 (신규 팀)
    for (const [team, lg] of [[r.home, lh], [r.away, la]]) {
      const nm = normalizeTeam(team);
      if (lg && !teamSeen.has(nm)) {
        teamSeen.add(nm);
        await admin.from(TABLES.teams).upsert({ name: nm, league: lg }, { onConflict: 'name' });
      }
    }
  }

  return { matches: mCount, votes: vCount, results: resCount };
}
