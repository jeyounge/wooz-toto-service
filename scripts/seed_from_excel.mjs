/**
 * seed_from_excel.mjs — 엑셀(_assets/승무패_전체데이터_엑셀.xlsx) → Supabase 시드
 *
 * 적재: wooz_toto_rounds / matches / votes / results
 * 규칙(확정):
 *   - vote=0(H=D=L=0) 행은 전역 제외 (무효 데이터: 2016001 절반, 2020012 전체)
 *   - kickoff_ts = null (엑셀 datetime 신뢰 불가 — 전 회차 2026년으로 깨짐)
 *   - result 는 승/무/패만 results 적재. 'C'(취소)/'-'(미결과) 제외
 *   - season/round_no = toto_round 파싱 (2010001 → season 2010, round_no 1)
 *   - votes.snapshot_ts = default now() (최종 투표율 1건; 엑셀은 시계열 아님)
 *
 * ⚠️ service_role 필요 (RLS write). .env.local 의 SUPABASE_SERVICE_ROLE_KEY 세팅 후 실행.
 * 실행: node scripts/seed_from_excel.mjs [--reset]
 *   --reset : 기존 wooz_toto_ 데이터 전체 삭제 후 재적재 (재실행 안전용)
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import pkg from 'xlsx';
const XLSX = pkg.default || pkg;

// ── env 로드 (.env.local)
const env = {};
readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const RESET = process.argv.includes('--reset');
const VALID_RESULTS = new Set(['승', '무', '패']);
const isZeroVote = (r) => r.vote_H === 0 && r.vote_D === 0 && r.vote_L === 0;

// 배치 헬퍼
async function insertBatch(table, rows, opts = {}) {
  const size = 500;
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    let q = supabase.from(table);
    q = opts.onConflict
      ? q.upsert(chunk, { onConflict: opts.onConflict })
      : q.insert(chunk);
    const { data, error } = await q.select();
    if (error) throw new Error(`${table} 배치 실패 @${i}: ${error.message}`);
    out.push(...(data || []));
    process.stdout.write(`\r  ${table}: ${out.length}/${rows.length}`);
  }
  process.stdout.write('\n');
  return out;
}

async function main() {
  // 1) 엑셀 로드 + 필터
  const buf = readFileSync(new URL('../_assets/승무패_전체데이터_엑셀.xlsx', import.meta.url));
  const wb = XLSX.read(buf, { type: 'buffer' });
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  console.log(`엑셀 로드: ${raw.length}행`);

  const rows = raw.filter((r) => !isZeroVote(r));
  console.log(`vote=0 제외 후: ${rows.length}행 (제외 ${raw.length - rows.length})`);

  // 2) --reset (자식→부모 순 삭제)
  if (RESET) {
    console.log('\n[--reset] 기존 데이터 삭제 중...');
    for (const t of ['wooz_toto_results', 'wooz_toto_votes', 'wooz_toto_matches', 'wooz_toto_rounds']) {
      const { error } = await supabase.from(t).delete().neq('id', -1);
      if (error) throw new Error(`${t} 삭제 실패: ${error.message}`);
      console.log(`  ${t} 비움`);
    }
  }

  // 3) rounds
  const roundKey = (tr) => ({ season: String(Math.floor(tr / 1000)), round_no: tr % 1000 });
  const roundMap = new Map(); // toto_round → row
  for (const r of rows) {
    if (!roundMap.has(r.toto_round)) roundMap.set(r.toto_round, roundKey(r.toto_round));
  }
  const roundsPayload = [...roundMap.values()].map((k) => ({ ...k, status: 'settled' }));
  console.log(`\nrounds 적재: ${roundsPayload.length}회차`);
  const roundsIns = await insertBatch('wooz_toto_rounds', roundsPayload, { onConflict: 'season,round_no' });
  const roundIdBySeasonNo = new Map(roundsIns.map((r) => [`${r.season}_${r.round_no}`, r.id]));

  // 4) matches
  const matchesPayload = rows.map((r) => {
    const k = roundKey(r.toto_round);
    return {
      round_id: roundIdBySeasonNo.get(`${k.season}_${k.round_no}`),
      match_no: r.match_no,
      league: null,
      home: r.home,
      away: r.away,
      kickoff_ts: null, // 엑셀 datetime 신뢰 불가
    };
  });
  console.log(`\nmatches 적재: ${matchesPayload.length}경기`);
  const matchesIns = await insertBatch('wooz_toto_matches', matchesPayload, { onConflict: 'round_id,match_no' });
  const matchIdByRoundMatch = new Map(matchesIns.map((m) => [`${m.round_id}_${m.match_no}`, m.id]));

  // match_id 역참조용
  const midOf = (r) => {
    const k = roundKey(r.toto_round);
    const rid = roundIdBySeasonNo.get(`${k.season}_${k.round_no}`);
    return matchIdByRoundMatch.get(`${rid}_${r.match_no}`);
  };

  // 5) votes (최종 투표율 1건)
  const votesPayload = rows.map((r) => ({
    match_id: midOf(r),
    vote_h: r.vote_H,
    vote_d: r.vote_D,
    vote_l: r.vote_L,
    total_votes: null,
  }));
  console.log(`\nvotes 적재: ${votesPayload.length}건`);
  await insertBatch('wooz_toto_votes', votesPayload);

  // 6) results (승/무/패만)
  const resultsPayload = rows
    .filter((r) => VALID_RESULTS.has(r.result))
    .map((r) => ({ match_id: midOf(r), result: r.result }));
  console.log(`\nresults 적재: ${resultsPayload.length}건 (승/무/패만, C/- 제외)`);
  await insertBatch('wooz_toto_results', resultsPayload, { onConflict: 'match_id' });

  console.log('\n✅ 시드 완료');
  console.log(`   rounds ${roundsPayload.length} · matches ${matchesPayload.length} · votes ${votesPayload.length} · results ${resultsPayload.length}`);
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
