'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { scrapeRound } from '@/lib/scraper/betinfo';
import { ingestRound } from '@/lib/scraper/ingest';
import { createAdminClient } from '@/lib/supabase/admin';
import { TABLES } from '@/lib/tables';
import { analyzeMatchNews } from '@/lib/ai/matchNews';

/**
 * 관리자 회차 수집: betinfo 스크래핑 → DB upsert.
 * 대진·투표율·결과를 한 번에 수집(회차 페이지에 다 있음).
 * @param {string} totoRoundStr 예: '2026050'
 */
export async function scrapeAndIngest(totoRoundStr) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: '권한 없음' };

  const totoRound = parseInt(String(totoRoundStr).trim(), 10);
  if (!/^\d{7}$/.test(String(totoRound))) {
    return { ok: false, message: '회차 형식 오류 — 7자리 코드로 입력 (예: 2026050)' };
  }

  try {
    const rows = await scrapeRound(totoRound);
    if (!rows.length) {
      return { ok: false, message: `${totoRound}: 경기 없음 (아직 미편성이거나 회차코드 확인)` };
    }
    const stat = await ingestRound(totoRound, rows);

    // A안: 결과 미완인 이전 회차 자동 재수집(결과 최신화)
    const backfilled = await backfillIncompleteResults(totoRound);

    revalidatePath('/');
    revalidatePath('/rounds');
    let msg = `${totoRound} 수집 완료 — 대진 ${stat.matches} · 투표율 ${stat.votes} · 결과 ${stat.results}`;
    if (backfilled.length) msg += ` | 이전 회차 결과 갱신: ${backfilled.join(', ')}`;
    return { ok: true, message: msg };
  } catch (e) {
    return { ok: false, message: `수집 실패: ${e.message}` };
  }
}

/**
 * 결과 미완(results < 경기수)인 최근 이전 회차를 betinfo 재수집.
 * 최근 4개 회차만 검사(직전 몇 개가 보통 미완).
 */
async function backfillIncompleteResults(currentCode) {
  const admin = createAdminClient();
  const { data: rounds } = await admin
    .from(TABLES.rounds)
    .select('id, season, round_no')
    .order('season', { ascending: false })
    .order('round_no', { ascending: false })
    .limit(4);
  if (!rounds) return [];

  const done = [];
  for (const r of rounds) {
    const code = parseInt(r.season, 10) * 1000 + r.round_no;
    if (code >= currentCode) continue;
    const { data: ms } = await admin.from(TABLES.matches).select('id').eq('round_id', r.id);
    const ids = (ms || []).map((m) => m.id);
    if (!ids.length) continue;
    const { count: resCount } = await admin
      .from(TABLES.results).select('*', { count: 'exact', head: true }).in('match_id', ids);
    if ((resCount ?? 0) < ids.length) {
      try {
        const rows = await scrapeRound(code);
        if (rows.length) {
          const st = await ingestRound(code, rows);
          done.push(`${code}(결과 ${st.results})`);
        }
      } catch { /* 개별 실패 무시 */ }
    }
  }
  return done;
}

/**
 * 관리자 뉴스 반영 재분석: 회차 경기별로 Claude(웹검색) 호출 → news_reason 저장.
 * @param {string} totoRoundStr 예: '2026050'
 */
export async function analyzeRoundNews(totoRoundStr) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: '권한 없음' };

  const totoRound = parseInt(String(totoRoundStr).trim(), 10);
  if (!/^\d{7}$/.test(String(totoRound))) {
    return { ok: false, message: '회차 형식 오류 (예: 2026050)' };
  }

  const admin = createAdminClient();
  const season = String(Math.floor(totoRound / 1000));
  const round_no = totoRound % 1000;

  const { data: round } = await admin
    .from(TABLES.rounds).select('id').eq('season', season).eq('round_no', round_no).maybeSingle();
  if (!round) return { ok: false, message: '회차 없음 — 먼저 "수집 / 재분석"으로 대진을 수집하세요' };

  const { data: matches } = await admin
    .from(TABLES.matches)
    .select('id, match_no, home, away, league')
    .eq('round_id', round.id)
    .order('match_no');
  if (!matches?.length) return { ok: false, message: '경기 없음' };

  let ok = 0, fail = 0;
  try {
    // 3개씩 배치 병렬 (rate limit 회피)
    for (let i = 0; i < matches.length; i += 3) {
      const batch = matches.slice(i, i + 3);
      await Promise.all(batch.map(async (m) => {
        try {
          const reason = await analyzeMatchNews(m);
          if (reason) {
            await admin.from(TABLES.matches)
              .update({ news_reason: reason, news_updated_ts: new Date().toISOString() })
              .eq('id', m.id);
            ok++;
          } else { fail++; }
        } catch { fail++; }
      }));
    }
  } catch (e) {
    return { ok: false, message: `뉴스 분석 실패: ${e.message}` };
  }

  revalidatePath('/');
  revalidatePath('/rounds');
  return { ok: true, message: `뉴스 분석 완료 — ${ok}경기 반영${fail ? `, ${fail}경기 실패` : ''}` };
}
