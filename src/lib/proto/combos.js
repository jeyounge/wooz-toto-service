/**
 * combos.js — 회차 추천 조합 (순수함수).
 *
 * 원칙 (분석 문서 §2 A·C):
 *  - 후보 = 킥오프 전 · 해외 확률이 있는 게임(국내 디빅만이면 모든 선택지 EV가 환급률로 같아 판단 불가)
 *    · 국내배당 × 확률 ≥ minEv 인 선택지. 경기당 하나(EV 최고)만.
 *  - 조합 기대 회수율 = Π(배당 × 확률) (레그 독립 가정). 레그가 늘수록 기대값보다 분산이 훨씬 빨리 커지므로
 *    기본은 2폴, 3폴은 따로 보여 준다.
 *  - 정렬 = 기대 회수율, 동률 근처면 적중확률 높은 쪽.
 */
import { comboOdds } from './bets.js';

export const COMBO_MIN_EV = 1.02;
export const COMBO_MIN_PROB = 0.3; // 너무 낮은 확률 레그는 조합에서 제외 (분산 관리)
const MAX_CANDIDATES = 14;

const matchKey = (g) => `${g.home}|${g.away}|${g.game_ts}`;

/** 회차 게임 → 레그 후보 [{game, pick_idx, odds, prob, ev}] (EV 내림차순, 경기당 1개) */
export function comboCandidates(games, { now = Date.now(), minEv = COMBO_MIN_EV, minProb = COMBO_MIN_PROB } = {}) {
  const best = new Map();
  for (const g of games) {
    const p = g.pred;
    if (!p || p.prob_source === 'domestic' || g.result_idx != null) continue;
    if (!g.game_ts || new Date(g.game_ts).getTime() <= now) continue;
    const odds = [g.odds_w, g.odds_d, g.odds_l].map((o) => (o == null ? 0 : Number(o)));
    const probs = [p.p_w, p.p_d, p.p_l].map(Number);
    for (let i = 0; i < 3; i++) {
      if (!(odds[i] > 1) || !(probs[i] >= minProb)) continue;
      const ev = odds[i] * probs[i];
      if (ev < minEv) continue;
      const k = matchKey(g);
      if (!best.has(k) || best.get(k).ev < ev) best.set(k, { game: g, pick_idx: i, odds: odds[i], prob: probs[i], ev, key: k });
    }
  }
  return [...best.values()].sort((a, b) => b.ev - a.ev);
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
