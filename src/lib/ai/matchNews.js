/**
 * matchNews.js — 경기별 최신 뉴스 심층 분석 (서버 전용).
 * Claude + 웹검색으로 최근폼·상대전적·부상·동기부여를 팩트 기반 수집·요약.
 */
import { askWithWebSearch } from './provider.js';

/**
 * @param {{home,away,league,model?:number[],marks?:string[]}} match
 * @returns {Promise<string>} 항목별 팩트 분석 (실패 시 throw)
 */
export async function analyzeMatchNews(match) {
  const modelStr = match.model
    ? `참고로 우리 모델 확률은 승 ${match.model[0]}% / 무 ${match.model[1]}% / 패 ${match.model[2]}% 이다. `
    : '';
  const prompt =
    `축구 경기 "${match.home}(홈) vs ${match.away}(원정)"${match.league ? ` — ${match.league}` : ''} 를 분석한다.\n` +
    `웹에서 이 경기 관련 최신 정보를 검색해, 아래 5개 항목을 각각 사실(팩트) 기반으로 작성하라. ${modelStr}\n\n` +
    `1) 최근폼: 양 팀 최근 5경기 결과와 흐름(득실·연승/연패 등)\n` +
    `2) 상대전적: 두 팀의 최근 맞대결 추세(H2H)\n` +
    `3) 부상/결장: 양 팀 주전 부상·출전정지 등 결장 예상\n` +
    `4) 동기부여: 리그 순위, 우승/유럽대항전/승격/잔류 경쟁 등 이 경기의 절박함\n` +
    `5) 종합전망: 위 팩트를 종합한 승/무/패 관점 코멘트\n\n` +
    `출력 형식(엄수):\n` +
    `- 각 항목을 "최근폼: …" 처럼 한글 라벨 + 한두 문장으로, 항목마다 줄바꿈으로 구분.\n` +
    `- 마크다운 헤더(#)·이모지·불릿(-,*)·표 사용 금지. 평문만.\n` +
    `- 반드시 검색으로 확인된 사실만. 추측·과장·베팅 권유·확정 표현 금지.\n` +
    `- 특정 항목 정보를 못 찾으면 "정보 부족"이라고만 적어라.`;

  return await askWithWebSearch(prompt, { maxTokens: 1200, maxSearches: 5 });
}
