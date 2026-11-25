// 프로토 승부식 회차 진단 리포트 (읽기 전용). 사용: node scripts/proto-analyze.mjs 260138 260139 260140
// 출력: 콘솔 표 + logs/proto-analyze-<회차들>.json (그대로 공유하면 같은 분석을 재현할 수 있다)
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { MODEL_VERSION } from '../src/lib/proto/predict.js';
import { diagnose } from '../src/lib/proto/analysis.js';
import { TABLES } from '../src/lib/tables.js';

const env = {};
readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
});
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const targets = process.argv.slice(2).map(Number).filter(Boolean);
if (!targets.length) { console.error('회차를 지정하세요. 예: node scripts/proto-analyze.mjs 260138 260139 260140'); process.exit(1); }

const pct = (x) => (x == null ? '   -  ' : `${(x * 100).toFixed(1).padStart(5)}%`);
const all = []; const perRound = {};
for (const ts of targets) {
  const { data: r } = await db.from(TABLES.protoRounds).select('id, gm_ts, status').eq('gm_ts', ts).maybeSingle();
  if (!r) { console.log(`${ts}: 회차 없음`); continue; }
  const games = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(TABLES.protoGames)
      .select(`id, sport, sport_code, league_short, bet_type_id, bet_type, bet_name, handi, odds_w, odds_d, odds_l, result_idx, preds:${TABLES.protoPreds}(model_version, p_w, p_d, p_l, prob_source, pick_idx, pick_prob, value_idx, value_ev, flags)`)
      .eq('round_id', r.id).range(from, from + 999);
    if (error) throw new Error(error.message);
    games.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const gs = games.map(({ preds, ...g }) => ({ ...g, pred: (preds || []).find((p) => p.model_version === MODEL_VERSION) || null }));
  perRound[ts] = diagnose(gs); all.push(...gs);
  const d = perRound[ts];
  console.log(`${ts} (${r.status}): 게임 ${d.total} · 예측 ${d.predicted} · 결과확정 ${d.settled} · 확률원천 ${JSON.stringify(d.sourceMix)}`);
}
const d = diagnose(all);
console.log(`\n== 합계: 게임 ${d.total} · 예측 ${d.predicted} · 결과확정 ${d.settled}`);
console.log('\n[1] 캘리브레이션 (예측픽 확률 구간 → 실제 적중)');
for (const c of d.calib) console.log(`  ${c.bucket.padEnd(9)} n=${String(c.n).padStart(4)}  적중 ${pct(c.rate)}  예상 ${pct(c.exp)}`);
console.log('\n[2] 국내 환급률 (1/Σ(1/배당)) — 1.00 미만만큼이 베트맨 몫');
for (const p of d.payout) console.log(`  ${p.key.padEnd(22)} n=${String(p.n).padStart(4)}  ${pct(p.rate)}`);
console.log('\n[3] 전략별 단폴 1단위 회수 (수익률 = 환급/건수 − 1)');
for (const s of d.strategies) console.log(`  ${s.name.padEnd(26)} n=${String(s.n).padStart(4)}  적중 ${pct(s.rate)}  수익률 ${pct(s.roi)}  모델기대 ${pct(s.expRoi)}`);
console.log('\n[4] 종목 · 유형군 · 확률원천');
for (const s of d.segments) console.log(`  ${s.key.padEnd(30)} n=${String(s.n).padStart(4)}  적중 ${pct(s.rate)}  예상 ${pct(s.exp)}`);

mkdirSync(new URL('../logs/', import.meta.url), { recursive: true });
const out = new URL(`../logs/proto-analyze-${targets.join('_')}.json`, import.meta.url);
writeFileSync(out, JSON.stringify({ targets, total: d, perRound }, null, 2));
console.log(`\n저장: ${out.pathname}`);
