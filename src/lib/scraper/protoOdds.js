/**
 * protoOdds.js — betinfo 프로토 배당 스크래퍼 (서버 전용).
 *
 * 승무패 투표율은 '국내 참여자가 어디에 표를 던졌나'일 뿐 가격이 아니다. 배당은 가격이고,
 * 방법론 §규칙0도 "de-vig 우선(없으면 캘리브레이션)"이라고 적어두었지만 그동안 배당 소스가 없었다.
 *
 * 두 페이지를 쓴다.
 *  - proto_center.asp : 전 경기. 해외 배당 개장→현재(변동)와 국내 프로토 배당 개장→현재가 나란히.
 *  - proto_main.asp   : 임박 경기만. 유럽에서 실제 걸린 금액 분포(%)가 추가로 있다.
 *
 * 셀 구조(proto_center, 21칸): [0]경기번호 [1]일시 [2]대회 [4]홈 [6]원정
 *   [10~12] 해외 승/무/패 "개장현재( 변동 )"  [13~15] 국내 승/무/패 "개장현재"  [17~19] 국내-해외 차
 * 배당 두 개가 붙어 나오므로 소수점 두 자리 기준으로 끊는다: "1.731.85( 0.12 )" → 1.73 → 1.85.
 *
 * ⚠️ 서버에서만 호출(관리자 트리거). betinfo 부하 존중.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

const CENTER_URL = 'https://www.betinfo.co.kr/z_protorate/protoRate2.asp'; // 전 경기 목록
const MAIN_URL = 'https://www.betinfo.co.kr/z_protorate/proto_main.asp';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
  Referer: 'https://www.betinfo.co.kr/',
};

const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
const PAIR = /^(\d+\.\d{2})(\d+\.\d{2})(?:\s*\(\s*(-?\d+(?:\.\d+)?)\s*\))?$/;

/** "1.731.85( 0.12 )" → { open: 1.73, now: 1.85, move: +0.12 } */
function parsePair(cell) {
  const m = PAIR.exec(clean(cell));
  if (!m) return null;
  const open = parseFloat(m[1]);
  const now = parseFloat(m[2]);
  return { open, now, move: +(now - open).toFixed(2) };
}

/** 배당 → 디빅(마진 제거) 확률 [승, 무, 패]. */
export function devig(odds) {
  const inv = odds.map((o) => (o > 1 ? 1 / o : 0));
  const total = inv.reduce((a, b) => a + b, 0);
  return total > 0 ? inv.map((x) => x / total) : [1 / 3, 1 / 3, 1 / 3];
}

async function fetchHtml(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', headers: HEADERS, timeout: 25000 });
  return iconv.decode(Buffer.from(res.data), 'euc-kr');
}

/** 유럽 베팅금액 분포(임박 경기만): key = "홈|원정" → [승%, 무%, 패%] */
async function fetchEuroMoney() {
  const $ = cheerio.load(await fetchHtml(MAIN_URL));
  const map = new Map();
  $('tr').each((_, tr) => {
    if ($(tr).find('tr').length) return;
    const tds = $(tr).find('td').map((_, td) => clean($(td).text())).get();
    if (tds.length < 11) return;
    const pct = [tds[7], tds[8], tds[9]].map((t) => { const m = /(\d+(?:\.\d+)?)\s*%/.exec(t); return m ? parseFloat(m[1]) : null; });
    if (pct.some((p) => p === null)) return;
    map.set(`${tds[2]}|${tds[3]}`, pct);
  });
  return map;
}

/**
 * @returns {Promise<Array<{no,datetime,league,home,away,odds:number[],open:number[],move:number[],
 *   devig:number[],devigOpen:number[],localOdds:(number[]|null),euroPct:(number[]|null)}>>}
 */
export async function scrapeProtoOdds() {
  const [$, euro] = await Promise.all([fetchHtml(CENTER_URL).then(cheerio.load), fetchEuroMoney().catch(() => new Map())]);
  const rows = [];

  $('tr').each((_, tr) => {
    if ($(tr).find('tr').length) return;
    const tds = $(tr).find('td').map((_, td) => clean($(td).text())).get();
    if (tds.length < 16 || tds[5] !== 'vs') return;
    if (clean(tds[3]).replace(/\s/g, '') !== '일반') return;   // 핸디캡·언더오버 행 제외

    // 칸 위치가 행마다 다르고 같은 배당 셀이 연달아 중복돼 나온다. 패턴으로 찾고 연속 중복은 버린다.
    // 괄호(변동)가 붙은 앞 3개가 해외 배당, 괄호 없는 앞 3개가 국내 프로토 배당.
    const withMove = [], plain = [];
    for (const cell of tds.slice(7)) {
      const v = parsePair(cell);
      if (!v) continue;
      const bucket = /\(/.test(cell) ? withMove : plain;
      const last = bucket[bucket.length - 1];
      if (last && last.open === v.open && last.now === v.now) continue; // 연속 중복 셀
      bucket.push(v);
    }
    const abroad = withMove.slice(0, 3);
    if (abroad.length < 3) return;                            // 1X2 마켓이 아닌 행 제외
    const local = plain.slice(0, 3);

    const home = tds[4], away = tds[6];
    rows.push({
      no: tds[0],
      datetime: tds[1],
      league: tds[2],
      home,
      away,
      odds: abroad.map((x) => x.now),
      open: abroad.map((x) => x.open),
      move: abroad.map((x) => x.move),
      devig: devig(abroad.map((x) => x.now)),
      devigOpen: devig(abroad.map((x) => x.open)),
      localOdds: local.length === 3 ? local.map((x) => x.now) : null,
      euroPct: euro.get(`${home}|${away}`) || null,
    });
  });

  return rows;
}
