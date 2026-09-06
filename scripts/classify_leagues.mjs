/**
 * classify_leagues.mjs — 팀→리그 판별 후 wooz_toto_teams 적재
 *
 * 1) 엑셀 경기쌍 로드 → distinct 팀
 * 2) leagueOf() 1차 매핑 (국가대표 + 클럽사전)
 * 3) 경기 전파: 같은 경기 home/away는 같은 리그 (클럽리그만, 충돌/국가대표 제외)
 * 4) wooz_toto_teams upsert (정규화명, 리그)
 * 5) 리포트: 리그별 팀수 + 미상 목록
 *
 * 실행: node scripts/classify_leagues.mjs   (service_role 필요)
 */
import { readFileSync, writeFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import pkg from 'xlsx';
import { leagueOf, normalizeTeam } from '../src/lib/leagues.js';
const XLSX = pkg.default || pkg;

const env = {};
readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1) 경기쌍 로드
const buf = readFileSync(new URL('../_assets/승무패_전체데이터_엑셀.xlsx', import.meta.url));
const wb = XLSX.read(buf, { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
const pairs = rows
  .filter((r) => r.home && r.away)
  .map((r) => [normalizeTeam(r.home), normalizeTeam(r.away)]);

const teams = new Set();
pairs.forEach(([h, a]) => { teams.add(h); teams.add(a); });
console.log('distinct 팀(정규화):', teams.size);

// 2) 1차 매핑
const map = new Map();
for (const t of teams) map.set(t, leagueOf(t));
const initKnown = [...map.values()].filter(Boolean).length;
console.log(`1차 매핑: ${initKnown}/${teams.size}`);

// 3) 경기 전파 (클럽리그만; 국가대표/충돌 제외)
let changed = true, rounds = 0;
while (changed && rounds < 20) {
  changed = false; rounds++;
  for (const [h, a] of pairs) {
    const lh = map.get(h), la = map.get(a);
    if (lh === la) continue;
    // 한쪽만 알려짐 + 그 리그가 국가대표가 아니면 상대에 전파
    if (lh && !la && lh !== '국가대표') { map.set(a, lh); changed = true; }
    else if (la && !lh && la !== '국가대표') { map.set(h, la); changed = true; }
    // 둘 다 알려졌는데 다름 = 국제전/오류 → 스킵(전파 안 함)
  }
}
const afterKnown = [...map.values()].filter(Boolean).length;
console.log(`전파 ${rounds}회 후: ${afterKnown}/${teams.size}`);

// 4) 리포트
const byLeague = {};
const unknown = [];
for (const [t, lg] of map) {
  if (lg) byLeague[lg] = (byLeague[lg] || 0) + 1;
  else unknown.push(t);
}
console.log('\n=== 리그별 팀 수 ===');
Object.entries(byLeague).sort((a, b) => b[1] - a[1]).forEach(([lg, n]) => console.log(`  ${String(n).padStart(3)}  ${lg}`));
console.log(`\n=== 미상 ${unknown.length}팀 ===`);
console.log('  ' + unknown.sort().join(', '));
writeFileSync(new URL('../_assets/unknown_teams.json', import.meta.url), JSON.stringify(unknown.sort(), null, 2), 'utf8');

// 5) teams 적재
const payload = [...map.entries()].map(([name, league]) => ({ name, league }));
const size = 500;
let done = 0;
for (let i = 0; i < payload.length; i += size) {
  const chunk = payload.slice(i, i + size);
  const { error } = await supabase.from('wooz_toto_teams').upsert(chunk, { onConflict: 'name' });
  if (error) { console.error('❌ upsert:', error.message); process.exit(1); }
  done += chunk.length;
}
console.log(`\n✅ wooz_toto_teams 적재: ${done}팀 (미상 ${unknown.length}은 league=null)`);
