import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const count = async (t, filter) => {
  let q = supabase.from(t).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count;
};

// 전체 페이지네이션 fetch
async function fetchAll(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

console.log('=== 테이블 카운트 ===');
for (const t of ['rounds', 'matches', 'votes', 'results', 'calibration']) {
  console.log(`  wooz_toto_${t}: ${await count('wooz_toto_' + t)}`);
}

console.log('\n=== results 분포 (정확) ===');
for (const r of ['승', '무', '패']) {
  console.log(`  ${r}: ${await count('wooz_toto_results', (q) => q.eq('result', r))}`);
}

// 실측 캘리브레이션: votes/results 각각 전체 fetch → match_id JS 조인
console.log('\n=== 실측 캘리브레이션 (홈 투표율 → 실제 홈승률) ===');
const votes = await fetchAll('wooz_toto_votes', 'match_id, vote_h');
const results = await fetchAll('wooz_toto_results', 'match_id, result');
const resByMatch = new Map(results.map((r) => [r.match_id, r.result]));

const buckets = [[0,10],[10,20],[20,30],[30,40],[40,50],[50,60],[60,70],[70,80],[80,90],[90,101]];
const stat = buckets.map(() => ({ hit: 0, n: 0 }));
for (const v of votes) {
  const res = resByMatch.get(v.match_id);
  if (!res) continue; // 결과 없는 경기(C/-) 제외
  for (let i = 0; i < buckets.length; i++) {
    if (v.vote_h >= buckets[i][0] && v.vote_h < buckets[i][1]) {
      stat[i].n++;
      if (res === '승') stat[i].hit++;
      break;
    }
  }
}
console.log('  홈투표율%    표본     실제홈승률%');
buckets.forEach(([lo, hi], i) => {
  const s = stat[i];
  const pct = s.n ? (s.hit / s.n * 100).toFixed(1) : '-';
  console.log(`  ${String(lo).padStart(2)}~${String(hi).padStart(3)}   ${String(s.n).padStart(6)}      ${pct}`);
});
console.log('\n  (방법론 CAL_VY 참고: 5→14.8 · 25→28.5 · 45→40.8 · 65→52.1 · 85→68.4 · 95.5→81.3)');
console.log('  → favorite-longshot: 저투표율 구간은 실제승률이 투표율보다 높고(과소평가),');
console.log('    고투표율 구간은 실제승률이 투표율보다 낮은(과대평가) 경향이면 정상.');
