/**
 * combos.js — 회차 추천 조합 (순수함수).
 *
 * 원칙 (분석 문서 §2 A·C):
 *  - 후보 = 킥오프 전 · 해외 확률이 있는 게임(국내 디빅만이면 모든 선택지 EV가 환급률로 같아 판단 불가)
 *    — 단, domesticCal 보정표를 주면 국내배당만 있는 게임도 보정 확률로 넣는다 (Claude 배팅 v3)
 *    · 국내배당 × 확률 ≥ minEv 인 선택지. 경기당 하나(EV 최고)만.
 *  - 조합 기대 회수율 = Π(배당 × 확률) (레그 독립 가정). 레그가 늘수록 기대값보다 분산이 훨씬 빨리 커지므로
 *    기본은 2폴, 3폴은 따로 보여 준다.
 *  - 정렬 = 기대 회수율, 동률 근처면 적중확률 높은 쪽.
 */
import { comboOdds } from './bets.js';
import { calibrateDomestic } from './domesticCal.js';

export const COMBO_MIN_EV = 1.02;
export const COMBO_MIN_PROB = 0.3; // 너무 낮은 확률 레그는 조합에서 제외 (분산 관리)
const MAX_CANDIDATES = 14;

const matchKey = (g) => `${g.home}|${g.away}|${g.game_ts}`;

/**
 * 회차 게임 → 레그 후보 [{game, pick_idx, odds, prob, ev, domestic}] (EV 내림차순, 경기당 perMatch개 — 기본 1)
 * domesticCal(domesticCal.js 보정표)을 주면 국내배당만 있는 게임도 보정 확률로 후보에 넣는다(domestic: true).
 * perMatch > 1이면 같은 경기의 다른 마켓·선택지도 후보로 남긴다. 조합 쪽에서 같은 경기끼리는 묶지 않아야 한다.
 */
export function comboCandidates(games, { now = Date.now(), minEv = COMBO_MIN_EV, minProb = COMBO_MIN_PROB, domesticCal = null, perMatch = 1, drawMinProb = minProb } = {}) {
  // EV 근소(0.005)하면 적중확률 높은 쪽 — 국내 디빅은 선택지 EV가 모두 같아서 이게 없으면 부동소수 오차로 역배가 뽑힌다
  const better = (x, y) => x.ev > y.ev + 0.005 || (Math.abs(x.ev - y.ev) <= 0.005 && x.prob > y.prob);
  const byMatch = new Map();
  for (const g of games) {
    const p = g.pred;
    if (!p || g.result_idx != null) continue;
    const domestic = p.prob_source === 'domestic';
    if (domestic && !domesticCal) continue;
    if (!g.game_ts || new Date(g.game_ts).getTime() <= now) continue;
    const odds = [g.odds_w, g.odds_d, g.odds_l].map((o) => (o == null ? 0 : Number(o)));
    const probs = domestic ? calibrateDomestic(odds, domesticCal) : [p.p_w, p.p_d, p.p_l].map(Number);
    const k = matchKey(g);
    // perMatch 1: 이 게임 행에서 최선 1개. perMatch > 1: 행의 다른 선택지(예: 무)도 남겨 경기 단위로 상위 perMatch개
    let legs = [];
    for (let i = 0; i < 3; i++) {
      if (!(odds[i] > 1) || !(probs[i] >= (i === 1 ? drawMinProb : minProb))) continue;
      const leg = { game: g, pick_idx: i, odds: odds[i], prob: probs[i], ev: odds[i] * probs[i], key: k, domestic };
      if (leg.ev < minEv) continue;
      if (perMatch > 1) legs.push(leg);
      else if (!legs.length || better(leg, legs[0])) legs = [leg];
    }
    if (legs.length) { if (!byMatch.has(k)) byMatch.set(k, []); byMatch.get(k).push(...legs); }
  }
  const out = [];
  for (const legs of byMatch.values()) out.push(...legs.sort((x, y) => (better(x, y) ? -1 : better(y, x) ? 1 : 0)).slice(0, perMatch));
  return out.sort((a, b) => b.ev - a.ev);
}

/**
 * 추천 조합.
 * @returns {{candidates:Array, pairs:Array, triples:Array}} 각 조합 = {legs, odds, prob, ev}
 */
export function recommendCombos(games, opts = {}) {
  const cands = comboCandidates(games, opts).slice(0, MAX_CANDIDATES);
  const mk = (legs) => {
    const odds = comboOdds(legs.map((l) => l.odds));
    const prob = legs.reduce((a, l) => a * l.prob, 1);
    return { legs, odds, prob, ev: odds * prob };
  };
  const pairs = []; const triples = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      pairs.push(mk([cands[i], cands[j]]));
      for (let k = j + 1; k < cands.length; k++) triples.push(mk([cands[i], cands[j], cands[k]]));
    }
  }
  const sort = (a, b) => (Math.abs(b.ev - a.ev) > 0.01 ? b.ev - a.ev : b.prob - a.prob);
  // 같은 레그가 상위 조합을 독점하지 않게: 한 레그는 상위 목록에 최대 2번
  const diverse = (list, n) => {
    const used = new Map(); const out = [];
    for (const c of list.sort(sort)) {
      if (c.legs.some((l) => (used.get(l.key) || 0) >= 2)) continue;
      out.push(c); c.legs.forEach((l) => used.set(l.key, (used.get(l.key) || 0) + 1));
      if (out.length >= n) break;
    }
    return out;
  };
  return { candidates: cands, pairs: diverse(pairs, 5), triples: diverse(triples, 3) };
}
