// 프로토 승부식 배치 — 수집 → 예측 → 결과 마킹 (LLM 없음, service_role).
// 사용: node scripts/proto-batch.mjs [gmTs...]
//   인자 없으면: 발매 중 회차 + 결과 대기 경기가 남은 최근 회차를 자동 처리.
//   PREDICT=0 이면 예측 갱신 생략, NOESPN=1 이면 해외 배당 생략.
// 원칙: 예측은 킥오프 전까지만 갱신하고 킥오프 후에는 동결 → 적중률이 사후 보정 없이 기록된다.
import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { listOpenProtoRounds, fetchProtoRound } from '../src/lib/proto/betman.js';
import { predictGame, devig, isHit, MODEL_VERSION } from '../src/lib/proto/predict.js';
import { matchExternal } from '../src/lib/proto/espn.js';
import { TABLES } from '../src/lib/tables.js';

const env = {};
readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
});
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const now = Date.now();
// --log: 작업 스케줄러 실행용. logs/proto-batch.log에 이어 쓴다.
const LOG_FILE = process.argv.includes('--log') ? new URL('../logs/proto-batch.log', import.meta.url) : null;
if (LOG_FILE) mkdirSync(new URL('../logs/', import.meta.url), { recursive: true });
const log = (...a) => {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`;
  console.log(line);
  if (LOG_FILE) appendFileSync(LOG_FILE, line + '\n');
};

async function upsertChunks(table, rows, onConflict, select) {
  const out = [];
  for (let i = 0; i < rows.length; i += 400) {
    let q = db.from(table).upsert(rows.slice(i, i + 400), { onConflict });
    if (select) q = q.select(select);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}

async function processRound(gmTs, saleEndTs) {
  const rows = await fetchProtoRound(gmTs);
  if (!rows.length) { log(`${gmTs}: 게임 없음`); return; }

  const { data: rr, error: rErr } = await db.from(TABLES.protoRounds)
    .upsert({ gm_ts: gmTs, ...(saleEndTs ? { sale_end_ts: saleEndTs } : {}), updated_ts: new Date().toISOString() }, { onConflict: 'gm_ts' })
    .select('id, gm_ts, sale_end_ts').single();
  if (rErr) throw new Error(`round ${gmTs}: ${rErr.message}`);

  // 기존 결과 상태 (결과 마킹 시각 기록용)
  const { data: prev } = await db.from(TABLES.protoGames).select('match_seq, result_idx').eq('round_id', rr.id);
  const prevRes = new Map((prev || []).map((g) => [g.match_seq, g.result_idx]));
  const stamp = new Date().toISOString();
  const gameRows = rows.map((r) => ({
    ...r, round_id: rr.id, updated_ts: stamp,
    ...(r.result_idx != null && prevRes.get(r.match_seq) == null ? { result_ts: stamp } : {}),
  }));
  // result_ts 키가 있는 행과 없는 행을 나눠 upsert (없는 행에서 기존 result_ts를 지우지 않도록)
  const withTs = gameRows.filter((g) => 'result_ts' in g), withoutTs = gameRows.filter((g) => !('result_ts' in g));
  const saved = [
    ...(await upsertChunks(TABLES.protoGames, withTs, 'round_id,match_seq', 'id, match_seq')),
    ...(await upsertChunks(TABLES.protoGames, withoutTs, 'round_id,match_seq', 'id, match_seq')),
  ];
  const idOf = new Map(saved.map((g) => [g.match_seq, g.id]));
  const newly = gameRows.filter((g) => g.result_ts).length;

  // ---- 예측 (킥오프 전 게임만) ----
  let predicted = 0, extCount = 0;
  if (process.env.PREDICT !== '0') {
    const upcoming = rows.filter((r) => r.game_ts && new Date(r.game_ts).getTime() > now && r.result_idx == null);
    const key = (r) => `${r.home}|${r.away}|${r.game_ts}`;
    let ext = new Map();
    if (process.env.NOESPN !== '1') {
      const base = upcoming.filter((r) => r.bet_type_id === '1' || r.bet_type_id === '2')
        .map((r) => ({ key: key(r), league_code: r.league_code, game_ts: r.game_ts, home: r.home, away: r.away, dom: devig([r.odds_w, r.odds_d, r.odds_l]) }))
        .filter((it) => it.dom.some((x) => x > 0));
      ext = await matchExternal(base);
      extCount = ext.size;
    }
    const preds = [];
    for (const r of upcoming) {
      const p = predictGame(r, ext.get(key(r)) || null);
      if (!p || !idOf.get(r.match_seq)) continue;
      preds.push({ game_id: idOf.get(r.match_seq), ...p, created_ts: stamp });
    }
    await upsertChunks(TABLES.protoPreds, preds, 'game_id,model_version');
    predicted = preds.length;
  }

  // ---- 회차 상태 ----
  const pending = rows.filter((r) => r.result_idx == null && r.proto_status !== '9').length;
  const saleEnd = rr.sale_end_ts ? new Date(rr.sale_end_ts).getTime() : null;
  const status = pending === 0 ? 'settled' : saleEnd && saleEnd < now ? 'closed' : 'open';
  await db.from(TABLES.protoRounds).update({ status }).eq('id', rr.id);

  log(`${gmTs}: 게임 ${rows.length} · 결과 신규 ${newly} · 대기 ${pending} · 예측 ${predicted} (해외 매칭 경기 ${extCount}) · ${status}`);
  await summarize(rr.id, gmTs);
}

/** 회차 적중 요약 (확정 경기 기준) */
async function summarize(roundId, gmTs) {
  const { data } = await db.from(TABLES.protoGames)
    .select(`sport, bet_type, result_idx, preds:${TABLES.protoPreds}(pick_idx, pick_prob, value_idx, value_ev, pick_odds, model_version)`)
    .eq('round_id', roundId).not('result_idx', 'is', null);
  const rows = (data || []).map((g) => ({ g, p: (g.preds || []).find((x) => x.model_version === MODEL_VERSION) })).filter((x) => x.p && isHit(x.g.result_idx, x.p.pick_idx) != null);
  if (!rows.length) return;
  const hit = rows.filter((x) => isHit(x.g.result_idx, x.p.pick_idx)).length;
  const exp = rows.reduce((s, x) => s + Number(x.p.pick_prob), 0);
  log(`   ${gmTs} 적중 ${hit}/${rows.length} (${(100 * hit / rows.length).toFixed(1)}%, 예상 ${(100 * exp / rows.length).toFixed(1)}%)`);
}

// ---- 대상 회차 ----
const args = process.argv.slice(2).map(Number).filter(Boolean);
const targets = new Map(args.map((t) => [t, null]));
if (!args.length) {
  try {
    for (const r of await listOpenProtoRounds()) targets.set(r.gmTs, r.saleEndTs);
  } catch (e) { log(`발매 목록 조회 실패(결과 마킹은 계속): ${e.message}`); process.exitCode = 1; }
  // 결과 대기 경기가 남은 회차 (킥오프 2시간 지난 경기)
  const { data: pend } = await db.from(TABLES.protoGames).select('round_id')
    .is('result_idx', null).lt('game_ts', new Date(now - 2 * 3600e3).toISOString()).limit(5000);
  const ids = [...new Set((pend || []).map((g) => g.round_id))];
  if (ids.length) {
    const { data: rs } = await db.from(TABLES.protoRounds).select('gm_ts').in('id', ids);
    for (const r of rs || []) if (!targets.has(r.gm_ts)) targets.set(r.gm_ts, null);
  }
}
log(`대상 회차: ${[...targets.keys()].join(', ') || '없음'}`);
for (const [gmTs, saleEnd] of [...targets].sort((a, b) => a[0] - b[0])) {
  try { await processRound(gmTs, saleEnd); } catch (e) { log(`${gmTs} 실패: ${e.message}`); process.exitCode = 1; }
}
