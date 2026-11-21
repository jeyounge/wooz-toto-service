/**
 * espn.js — ESPN(DraftKings) 해외 배당 → 프로토 게임 연결 (서버·배치 전용).
 *
 * 베트맨은 한글 정식명, ESPN은 영문명이라 이름 매칭이 안 된다.
 * 대신 같은 리그 · 킥오프 ±20분 그룹 안에서 국내 디빅과 해외 디빅의 L1 거리가 가장 가까운 쌍을 고른다(그리디).
 * 거리 0.35 초과는 버린다(오매칭 방지).
 */
import { devig } from './predict.js';

// 베트맨 leagueCode → ESPN 경로
export const ESPN_LEAGUES = {
  '52': 'soccer/eng.1', '48': 'soccer/eng.2', '67': 'soccer/esp.1', '53': 'soccer/ita.1', '56': 'soccer/ger.1',
  '54': 'soccer/fra.1', '2': 'soccer/ned.1', '130': 'soccer/usa.1', '113': 'soccer/aus.1', 'SC007': 'soccer/jpn.1',
  'SC001': 'soccer/kor.1', 'd0': 'soccer/afc.champions', 'SC100': 'soccer/fifa.friendly', 'SC105': 'soccer/concacaf.nations.league',
  'BK002': 'basketball/nba',
};
const MAX_DIST = 0.35;
const TS_WINDOW = 20 * 60e3;
const NAME_WEIGHT = 0.5; // 이름 유사도 1.0 차이 = 배당 거리 0.5 — 같은 시각·비슷한 배당 경기(챔피언십 15시 8경기 등) 구분용

// ---- 한글 팀명 ↔ 영문 팀명 발음 골격 비교 (사전 없이) ----
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
/** 한글 → 자음 위주 로마자 (모음은 골격 비교에서 버리므로 생략) */
export function hangulToLatin(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) { out += /[a-z0-9]/i.test(ch) ? ch.toLowerCase() : ' '; continue; }
    out += CHO[Math.floor(c / 588)] + 'a' + JONG[c % 28];
  }
  return out;
}
/** 자음 클래스 골격: 비슷한 소리를 한 글자로 (모음·h·w·y 제거) */
export function skeleton(latin) {
  const s = latin.toLowerCase()
    .replace(/ph/g, 'p').replace(/gh/g, '').replace(/ng/g, 'n').replace(/ch|sh|j|z|x/g, 's')
    .replace(/c(?=[eiy])/g, 's').replace(/[cqk]/g, 'k').replace(/[bpfv]/g, 'p').replace(/[dt]/g, 't').replace(/[lr]/g, 'l').replace(/g/g, 'k')
    .replace(/[^kptlmns]/g, '');
  return s.replace(/(.)\1+/g, '$1');
}
function lcs(a, b) {
  const dp = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) { const tmp = dp[j]; dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]); prev = tmp; }
  }
  return dp[b.length];
}
/** 한글 팀명 vs 영문 팀명 유사도 0~1 */
const AFFIX = /\b(fc|cf|sc|afc|ac|as|rc|ss|ssc|us|sv|vfb|tsg|osc|ogc|aj|ado|nec|pec|psv|az|rb|bc|cd|ud|sd|ca|club|de|la|le|1\.)\b|\d+/gi;
export function nameSim(ko, en) {
  // 한글명 안의 영문·숫자(OSC, 04, 1899 …)와 영문명의 클럽 접미사는 골격 비교에서 뺀다
  const a = skeleton(hangulToLatin(ko.replace(/[A-Za-z0-9&.]+/g, ' '))), b = skeleton(en.replace(AFFIX, ' '));
  if (!a || !b) return 0;
  return lcs(a, b) / Math.max(a.length, b.length);
}

const am2dec = (s) => { const n = Number(s); if (!n) return null; return n > 0 ? 1 + n / 100 : 1 + 100 / -n; };
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');

/** ESPN 스코어보드 이벤트 → {ts, label, p1x2|pML, spread} */
export async function fetchEspnEvents(path, dates) {
  const out = [];
  for (const d of dates) {
    let j;
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${d}`, { signal: AbortSignal.timeout(20000) });
      j = await r.json();
    } catch { continue; }
    for (const e of j.events || []) {
      const c = e.competitions?.[0]; const o = c?.odds?.[0]; const ml = o?.moneyline;
      if (!ml) continue;
      const pick = (side) => am2dec(ml[side]?.close?.odds ?? ml[side]?.open?.odds);
      const home = c.competitors.find((t) => t.homeAway === 'home')?.team?.displayName;
      const away = c.competitors.find((t) => t.homeAway === 'away')?.team?.displayName;
      const ev = { id: e.id, ts: new Date(e.date).getTime(), label: `${home} vs ${away}`, home: home || '', away: away || '' };
      const dDraw = pick('draw');
      if (dDraw) ev.p1x2 = devig([pick('home'), dDraw, pick('away')]);
      else { const p = devig([pick('home'), 0, pick('away')]); ev.pML = [p[0], p[2]]; }
      const ps = o.pointSpread;
      const line = Number(ps?.home?.close?.line);
      const ph = am2dec(ps?.home?.close?.odds), pa = am2dec(ps?.away?.close?.odds);
      if (Number.isFinite(line) && ph && pa) ev.spread = { line, pHome: (1 / ph) / (1 / ph + 1 / pa) };
      out.push(ev);
    }
  }
  return out;
}

/**
 * 프로토 경기(승무패/승패 행 기준)와 ESPN 이벤트 매칭.
 * @param {Array<{key:string, league_code:string, game_ts:string, dom:number[], home?:string, away?:string}>} items
 *        dom = 국내 디빅 [W,D,L], home/away = 한글 팀명 (이름 유사도 보조 점수)
 * @returns {Promise<Map<string, object>>} key → ext({p1x2|pML, spread, espnLabel, dist})
 */
export async function matchExternal(items) {
  const out = new Map();
  const byLeague = new Map();
  for (const it of items) {
    if (!ESPN_LEAGUES[it.league_code] || !it.game_ts) continue;
    if (!byLeague.has(it.league_code)) byLeague.set(it.league_code, []);
    byLeague.get(it.league_code).push(it);
  }
  for (const [code, list] of byLeague) {
    // ESPN 날짜는 UTC. 킥오프 전날~당일을 같이 본다.
    const dates = [...new Set(list.flatMap((it) => { const t = new Date(it.game_ts).getTime(); return [ymd(t - 864e5), ymd(t)]; }))];
    const evs = await fetchEspnEvents(ESPN_LEAGUES[code], dates);
    const pairs = [];
    for (const it of list) {
      const t = new Date(it.game_ts).getTime();
      for (const ev of evs) {
        if (Math.abs(ev.ts - t) > TS_WINDOW) continue;
        const ep = ev.p1x2 || [ev.pML[0], 0, ev.pML[1]];
        const dist = Math.abs(ep[0] - it.dom[0]) + Math.abs(ep[1] - it.dom[1]) + Math.abs(ep[2] - it.dom[2]);
        const sim = it.home ? (nameSim(it.home, ev.home) + nameSim(it.away, ev.away)) / 2 : 0;
        pairs.push({ it, ev, dist, sim, score: dist - NAME_WEIGHT * sim });
      }
    }
    pairs.sort((a, b) => a.score - b.score);
    const usedIt = new Set(), usedEv = new Set();
    for (const { it, ev, dist, sim } of pairs) {
      if (dist > MAX_DIST || usedIt.has(it.key) || usedEv.has(ev.id)) continue;
      usedIt.add(it.key); usedEv.add(ev.id);
      out.set(it.key, { p1x2: ev.p1x2, pML: ev.pML, spread: ev.spread, espnLabel: ev.label, dist, sim });
    }
  }
  return out;
}
