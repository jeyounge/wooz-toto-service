'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { scrapeRound } from '@/lib/scraper/betinfo';
import { ingestRound } from '@/lib/scraper/ingest';

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
    revalidatePath('/');
    revalidatePath(`/rounds`);
    return {
      ok: true,
      message: `${totoRound} 수집 완료 — 대진 ${stat.matches} · 투표율 ${stat.votes} · 결과 ${stat.results} (vote=0 제외)`,
    };
  } catch (e) {
    return { ok: false, message: `수집 실패: ${e.message}` };
  }
}
