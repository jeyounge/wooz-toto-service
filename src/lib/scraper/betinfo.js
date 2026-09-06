/**
 * betinfo.js — betinfo 축구토토 승무패 스크래퍼 (서버 전용).
 * 셀 구조: [0]No [1]홈 [2]원정 [3]승% [4]무% [5]패% [6]일시 [7]결과
 * 팀명은 team_analysis_open2("팀명") 링크에서 추출 → EUC-KR 깨짐 회피.
 *
 * ⚠️ 서버(Server Action/Route)에서만 호출. 사용자 자동 스크래핑 금지(관리자 트리거).
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

const BETINFO_URL = 'https://www.betinfo.co.kr/z_protorate/totoCal_dual_result.asp';
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
const pctNum = (s) => parseFloat(clean(s).replace('%', '')) || 0;

/**
 * @param {number|string} totoRound 예: 2026050
 * @returns {Promise<Array<{match_no,home,away,vote_h,vote_d,vote_l,datetime,result}>>}
 */
export async function scrapeRound(totoRound) {
  const body = new URLSearchParams({ calcMode: 'soccer', totoUser_id: '', toto_round: String(totoRound) });
  const res = await axios.post(BETINFO_URL, body.toString(), {
    responseType: 'arraybuffer',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });
  const html = iconv.decode(Buffer.from(res.data), 'euc-kr');
  return parseMatches(html);
}

function parseMatches(html) {
  const $ = cheerio.load(html);
  const teamFrom = (a) => {
    // betinfo 함수명 변형 대응: team_analysis_open2 / team_analysis_modal_open
    const m = /team_analysis(?:_open2|_modal_open)\("([^"]+)"/.exec($(a).attr('href') || '');
    return m ? m[1] : null;
  };
  const rows = [];
  $('tr').each((_, tr) => {
    if ($(tr).find('tr').length) return;                 // leaf 행만
    const links = $(tr).find('a[href*="team_analysis"]');
    if (links.length < 2) return;
    const tds = $(tr).find('td').map((_, td) => clean($(td).text())).get();
    if (tds.length < 8) return;
    const home = teamFrom(links[0]);
    const away = teamFrom(links[1]);
    if (!home || !away) return;
    const resultRaw = clean(tds[7]);
    rows.push({
      match_no: rows.length + 1,
      home,
      away,
      vote_h: pctNum(tds[3]),
      vote_d: pctNum(tds[4]),
      vote_l: pctNum(tds[5]),
      datetime: tds[6] || '',
      result: ['승', '무', '패'].includes(resultRaw) ? resultRaw : null,
    });
  });
  return rows;
}
