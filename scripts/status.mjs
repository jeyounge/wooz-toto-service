import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
const env = {};
readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
});
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rounds } = await s.from('wooz_toto_rounds').select('id,season,round_no')
  .order('season', { ascending: false }).order('round_no', { ascending: false }).limit(6);

console.log('회차 | 경기 | 결과 | 뉴스 | 상태');
for (const r of rounds) {
  const { data: ms } = await s.from('wooz_toto_matches').select('id, news_reason').eq('round_id', r.id);
  const ids = ms.map((m) => m.id);
  const news = ms.filter((m) => m.news_reason).length;
  const { count: resCount } = await s.from('wooz_toto_results').select('*', { count: 'exact', head: true }).in('match_id', ids);
  const code = `${r.season}${String(r.round_no).padStart(3, '0')}`;
  const done = resCount >= ms.length ? '✅결과완' : `⚠️결과미완(${resCount}/${ms.length})`;
  console.log(`${code} | ${ms.length} | ${resCount} | ${news} | ${done}`);
}
