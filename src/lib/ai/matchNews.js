/**
 * matchNews.js — 경기별 최신 뉴스 분석 근거 생성 (서버 전용).
 * Claude + 웹검색으로 부상/라인업/폼/H2H를 찾아 승무패 관점 요약.
 */
import { askWithWebSearch } from './provider.js';

const KO = ['승(홈)', '무', '패(원정)'];

/**
 * @param {{home,away,league,model?:number[],marks?:string[]}} match
 * @returns {Promise<string>} 한국어 2~3문장 근거 (실패 시 throw)
 */
export async function analyzeMatchNews(match) {
  const modelStr = match.model ? `모델 확률 승${match.model[0]}/무${match.model[1]}/패${match.model[2]}. ` : '';
  const markStr = match.marks?.length ? `현재 마킹: ${match.marks.join('·')}. ` : '';
  const prompt =
    `축구 경기 "${match.home} vs ${match.away}"${match.league ? ` (${match.league})` : ''}의 ` +
    `최신 뉴스(주전 부상/결장, 예상 라인업, 최근 폼, 상대전적)를 검색해줘. ` +
    `${modelStr}${markStr}` +
    `승/무/패 예측에 영향을 주는 핵심만 골라 한국어로 요약해줘.\n\n` +
    `출력 형식 규칙(엄수):\n` +
    `- 정확히 2~3문장, 줄글(평문)로만. 마크다운·헤더·이모지·불릿·표 절대 금지.\n` +
    `- 부상/결장 등 사실 위주. 과장·베팅 권유·확정적 표현 금지.\n` +
    `- 날짜나 킥오프 시각은 쓰지 말 것. 예측에 영향 주는 요인만.\n` +
    `- 정보가 부족하면 "확인된 최신 정보 부족"이라고만 적어줘.`;

  return await askWithWebSearch(prompt, { maxTokens: 400, maxSearches: 3 });
}
