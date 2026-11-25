// 프로토 승부식 배치 — 수집 → 예측 → 결과 마킹 → 자동 복기 (LLM 없음, service_role).
// 사용: node scripts/proto-batch.mjs [gmTs...]
//   인자 없으면: 발매 중 회차 + 결과 대기 경기가 남은 최근 회차를 자동 처리.
//   PREDICT=0 이면 예측 갱신 생략, NOESPN=1 이면 해외 배당·경기 기록 생략, RETRO=0 이면 복기 생략, BOT=0 이면 Claude 배팅 생략.
// 원칙: 예측은 킥오프 전까지만 갱신하고 킥오프 후에는 동결 → 적중률이 사후 보정 없이 기록된다.
import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { listOpenProtoRounds, fetchProtoRound } from '../src/lib/proto/betman.js';
import { predictGame, devig, isHit, MODEL_VERSION } from '../src/lib/proto/predict.js';
import { matchExternal, matchEspnFinals, fetchMatchContext } from '../src/lib/proto/espn.js';
import { classifyPred, rawScoreOf, verdictOf } from '../src/lib/proto/retro.js';
import { isFirstHalf } from '../src/lib/proto/accuracy.js';
import { planBotBets, matchKeyOf, BOT_ID } from '../src/lib/proto/bot.js';
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

// 0008(bet_name·복기 컬럼) 미적용 DB에서도 결과 마킹은 계속되게: 컬럼이 없으면 bet_name을 빼고 복기를 건너뛴다.
const HAS_0008 = await (async () => {
  const a = await db.from(TABLES.protoGames).select('bet_name').limit(1);
  const b = await db.from(TABLES.protoPreds).select('retro_ts').limit(1);
  return !a.error && !b.error;
})();

// 0010(Claude 배팅) 미적용 DB면 Claude 배팅만 건너뛴다.
const HAS_0010 = !(await db.from(TABLES.protoBotBets).select('id').limit(1)).error;

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
  const gameRows = rows.map(({ bet_name, ...r }) => ({
    ...r, ...(HAS_0008 ? { bet_name } : {}), round_id: rr.id, updated_ts: stamp,
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
  const preds = [];
  if (process.env.PREDICT !== '0') {
    const upcoming = rows.filter((r) => r.game_ts && new Date(r.game_ts).getTime() > now && r.result_idx == null);
    const key = (r) => `${r.home}|${r.away}|${r.game_ts}`;
    let ext = new Map();
    if (process.env.NOESPN !== '1') {
      // 해외 배당은 풀타임 경기 배당 → 전반전 마켓에는 쓰지 않는다
      const base = upcoming.filter((r) => (r.bet_type_id === '1' || r.bet_type_id === '2') && !isFirstHalf(r))
        .map((r) => ({ key: key(r), league_code: r.league_code, game_ts: r.game_ts, home: r.home, away: r.away, dom: devig([r.odds_w, r.odds_d, r.odds_l]) }))
        .filter((it) => it.dom.some((x) => x > 0));
      ext = await matchExternal(base);
      extCount = ext.size;
    }
    for (const r of upcoming) {
      const p = predictGame(r, isFirstHalf(r) ? null : ext.get(key(r)) || null);
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
  if (status === 'open' && preds.length && process.env.BOT !== '0') {
    if (!HAS_0010) log(`   ${gmTs} Claude 배팅 건너뜀: 0010 마이그레이션 미적용`);
    else {
      try { await botRound(rr.id, gmTs, gameRows, idOf, preds); } catch (e) { log(`   ${gmTs} Claude 배팅 실패: ${e.message}`); process.exitCode = 1; }
    }
  }
  await summarize(rr.id, gmTs);
  if (!HAS_0008) log(`   ${gmTs} 복기 건너뜀: 0008 마이그레이션 미적용`);
  else if (process.env.RETRO !== '0') {
    try { await retroRound(rr.id, gmTs); } catch (e) { log(`   ${gmTs} 복기 실패(결과 마킹은 완료): ${e.message}`); process.exitCode = 1; }
  }
}

/**
 * Claude 배팅 (bot.js): 이번 배치에서 갓 계산한 예측으로 회차 예산 안에서 산다.
 * 이미 산 금액·경기는 DB에서 다시 읽어 배치가 여러 번 돌아도 예산·중복을 넘지 않는다.
 */
async function botRound(roundId, gmTs, gameRows, idOf, preds) {
  const { data: prevBets, error } = await db.from(TABLES.protoBotBets)
    .select(`stake, legs:${TABLES.protoBotBetLegs}(game:${TABLES.protoGames}(home, away, game_ts))`)
    .eq('round_id', roundId).eq('bot', BOT_ID);
  if (error) throw new Error(error.message);
  const spent = (prevBets || []).reduce((a, b) => a + b.stake, 0);
  const usedKeys = (prevBets || []).flatMap((b) => (b.legs || []).map((l) => l.game && matchKeyOf(l.game)).filter(Boolean));
  const predOf = new Map(preds.map((p) => [p.game_id, p]));
  const games = gameRows.map((r) => ({ ...r, id: idOf.get(r.match_seq), pred: predOf.get(idOf.get(r.match_seq)) || null })).filter((g) => g.id && g.pred);
  const plan = planBotBets(games, { now, spent, usedKeys });
  for (const s of plan) {
    const { data: bet, error: e1 } = await db.from(TABLES.protoBotBets)
      .insert({ bot: BOT_ID, round_id: roundId, stake: s.stake, total_odds: s.total_odds, model_prob: s.model_prob, reason: s.reason })
      .select('id').single();
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await db.from(TABLES.protoBotBetLegs).insert(s.legs.map((l) => ({ bet_id: bet.id, ...l })));
    if (e2) { await db.from(TABLES.protoBotBets).delete().eq('id', bet.id); throw new Error(e2.message); }
  }
  log(`   ${gmTs} Claude 배팅 ${plan.length}장 신규 (회차 누적 ${(spent + plan.reduce((a, s) => a + s.stake, 0)).toLocaleString('ko-KR')}원)`);
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

/**
 * 자동 복기: 결과 확정 + 예측 있음 + 아직 복기 안 한 건마다 실패 원인 태그·한 줄 노트.
 * 틀린 축구 경기는 ESPN 경기 기록(골 시간·PK·퇴장·슈팅)을 붙인다 (매칭 = 킥오프·스코어·이름).
 */
async function retroRound(roundId, gmTs) {
  const games = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(TABLES.protoGames)
      .select(`id, sport_code, league_code, home, away, game_ts, bet_type_id, bet_name, handi, txt_w, txt_d, txt_l, result_idx, result_score, preds:${TABLES.protoPreds}(id, model_version, pick_idx, pick_prob, flags, retro_ts)`)
      .eq('round_id', roundId).not('result_idx', 'is', null).range(from, from + 999);
    if (error) throw new Error(error.message);
    games.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const mkey = (g) => `${g.home}|${g.away}|${g.game_ts}`;
  const byMatch = new Map();
  for (const g of games) { if (!byMatch.has(mkey(g))) byMatch.set(mkey(g), []); byMatch.get(mkey(g)).push(g); }
  const todo = games.map((g) => ({ g, p: (g.preds || []).find((x) => x.model_version === MODEL_VERSION) }))
    .filter(({ g, p }) => p && !p.retro_ts && isHit(g.result_idx, p.pick_idx) != null);
  if (!todo.length) return;

  // 틀린 축구 경기만 ESPN 경기 기록
  const ctxOf = new Map();
  if (process.env.NOESPN !== '1') {
    const missKeys = new Set(todo.filter(({ g, p }) => g.sport_code === 'SC' && !isFirstHalf(g) && !isHit(g.result_idx, p.pick_idx)).map(({ g }) => mkey(g)));
    const items = [...missKeys].map((k) => { const g = byMatch.get(k)[0]; return { key: k, league_code: g.league_code, game_ts: g.game_ts, home: g.home, away: g.away, raw: rawScoreOf(byMatch.get(k)) }; });
    const matched = await matchEspnFinals(items);
    for (const it of items) { const m = matched.get(it.key); if (m) ctxOf.set(it.key, await fetchMatchContext(m, it.raw)); }
  }

  const stamp = new Date().toISOString();
  const updates = [];
  const cnt = { luck: 0, close: 0, read: 0 };
  for (const { g, p } of todo) {
    const half = isFirstHalf(g);
    const r = classifyPred(g, p, rawScoreOf(byMatch.get(mkey(g)), half), half ? null : ctxOf.get(mkey(g)) || null);
    if (!r) continue;
    if (r.tags.length || r.note) cnt[verdictOf(r.tags)]++;
    updates.push({ id: p.id, miss_tags: r.tags, retro_note: r.note, retro_ts: stamp });
  }
  // 행마다 다른 값이라 update를 병렬 묶음으로
  for (let i = 0; i < updates.length; i += 25) {
    const res = await Promise.all(updates.slice(i, i + 25).map(({ id, ...v }) => db.from(TABLES.protoPreds).update(v).eq('id', id)));
    const err = res.find((x) => x.error); if (err) throw new Error(err.error.message);
  }
  log(`   ${gmTs} 복기 ${updates.length}건 (오답 ${cnt.luck + cnt.close + cnt.read}: 변수 ${cnt.luck} · 근소 ${cnt.close} · 판단 실패 ${cnt.read} · 경기 기록 ${ctxOf.size}경기)`);
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
