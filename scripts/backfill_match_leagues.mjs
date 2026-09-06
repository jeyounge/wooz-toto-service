/**
 * backfill_match_leagues.mjs — wooz_toto_teams 사전으로 matches.league 채우기
 *
 * 경기 리그 판정: home/away 리그가
 *   - 같으면 → 그 리그
 *   - 둘 다 국가대표 → 국가대표
 *   - 다르면 → '국제' (챔스/유로파 등)
 *   - 한쪽만 판별 → 그쪽 리그
 *
 * 실행: node scripts/backfill_match_leagues.mjs  (service_role 필요)
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { normalizeTeam } from '../src/lib/leagues.js';

const env = {};
readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').forEach((line) => {
  const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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

// 1) teams 사전
const teamRows = await fetchAll('wooz_toto_teams', 'name, league');
const teamLeague = new Map(teamRows.map((t) => [t.name, t.league]));
console.log('teams 사전:', teamLeague.size);

// 2) matches
const matches = await fetchAll('wooz_toto_matches', 'id, home, away');
console.log('matches:', matches.length);

function judge(home, away) {
  const lh = teamLeague.get(normalizeTeam(home)) ?? null;
  const la = teamLeague.get(normalizeTeam(away)) ?? null;
  if (lh && la) {
    if (lh === la) return lh;
    return '국제';
  }
  return lh || la || null;
}

// 3) 리그별 id 그룹
const byLeague = new Map();
for (const m of matches) {
  const lg = judge(m.home, m.away);
  if (!lg) continue;
  if (!byLeague.has(lg)) byLeague.set(lg, []);
  byLeague.get(lg).push(m.id);
}

// 4) 배치 update (리그별 id in)
console.log('\n=== 경기 리그 분포 & 업데이트 ===');
for (const [lg, ids] of [...byLeague.entries()].sort((a, b) => b[1].length - a[1].length)) {
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { error } = await supabase.from('wooz_toto_matches').update({ league: lg }).in('id', chunk);
    if (error) { console.error(`❌ ${lg}:`, error.message); process.exit(1); }
  }
  console.log(`  ${String(ids.length).padStart(5)}  ${lg}`);
}

const covered = [...byLeague.values()].reduce((s, a) => s + a.length, 0);
console.log(`\n✅ matches.league 채움: ${covered}/${matches.length}`);
