/**
 * consistency.js — 같은 경기 여러 마켓의 적중 예측(pick)을 서로 모순 없게 맞춘다 (순수함수).
 *
 * 문제: predictGame은 게임 행(마켓)마다 따로 최고 확률을 고른다. 그래서
 *   승무패 '패'(원정 승) + 홈 +1 핸디 '승'(홈 안 짐)처럼 동시에 맞을 수 없는 픽이 같이 나왔다.
 * 해법: 홈 기준 점수차 m(정수)으로 각 선택지를 조건으로 바꾼다.
 *   승무패/승패: 승 m>0 · 무 m=0 · 패 m<0      핸디(h = 홈에 더하는 점수): 승 m+h>0 · 무 m+h=0 · 패 m+h<0
 *   기준(앵커) = 승무패(축구) / 승패(농구) 행의 픽. 나머지 핸디 행은 |h| 작은 순으로,
 *   지금까지의 픽과 동시에 성립하는 선택지 가운데 확률 최고를 고르고 가능한 점수차 집합을 좁힌다.
 * 전반 마켓은 기준이 다르므로(전반 점수) 제외. 언더오버·홀짝은 점수차와 무관해 건드리지 않는다.
 * 가치 픽(value)은 가격 신호라 그대로 둔다 — 각 마켓이 따로 싸게 나왔을 수 있다.
 */
import { isFirstHalf } from './accuracy.js';
import { crowdShares, OVERHEAT_GAP } from './predict.js';

const MARGINS = Array.from({ length: 121 }, (_, i) => i - 60);
const ANCHOR_TYPES = new Set(['1', '2']); // 승무패, 승패
const HANDI_TYPES = new Set(['4', '5']);  // 정수핸디캡, 소수핸디캡

/** 선택지 i가 성립하는 홈 점수차 조건 */
export function outcomeHolds(betTypeId, handi, i) {
  const h = HANDI_TYPES.has(String(betTypeId)) ? Number(handi || 0) : 0;
  return (m) => (i === 0 ? m + h > 0 : i === 1 ? m + h === 0 : m + h < 0);
}

const roundTo4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * @param {Array<{g:object, p:object}>} items g = proto_games 행, p = predictGame 결과. p를 바꾼 새 객체로 돌려준다.
 * @returns {Array<{g:object, p:object}>} 순서 유지. 바뀐 픽은 flags에 '일관성조정'.
 */
export function harmonizePicks(items) {
  const out = items.map((x) => ({ g: x.g, p: x.p ? { ...x.p, flags: [...(x.p.flags || [])] } : x.p }));
  const groups = new Map();
  out.forEach((x, idx) => {
    if (!x.p || isFirstHalf(x.g)) return;
    const t = String(x.g.bet_type_id);
    if (!ANCHOR_TYPES.has(t) && !HANDI_TYPES.has(t)) return;
    const k = `${x.g.home}|${x.g.away}|${new Date(x.g.game_ts).getTime()}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(idx);
  });
  for (const idxs of groups.values()) {
    const anchor = idxs.find((i) => ANCHOR_TYPES.has(String(out[i].g.bet_type_id)));
    if (anchor == null) continue;
    const a = out[anchor];
    let S = MARGINS.filter(outcomeHolds(a.g.bet_type_id, a.g.handi, a.p.pick_idx));
    const rest = idxs.filter((i) => i !== anchor && HANDI_TYPES.has(String(out[i].g.bet_type_id)))
      .sort((x, y) => Math.abs(Number(out[x].g.handi || 0)) - Math.abs(Number(out[y].g.handi || 0)));
    for (const i of rest) {
      const { g, p } = out[i];
      const odds = [g.odds_w, g.odds_d, g.odds_l].map((o) => (o == null ? 0 : Number(o)));
      const probs = [p.p_w, p.p_d, p.p_l].map(Number);
      const ok = [0, 1, 2].filter((j) => odds[j] > 1 && S.some(outcomeHolds(g.bet_type_id, g.handi, j)));
      if (!ok.length) continue; // 이론상 없음(시장 구성 이상) — 원래 픽 유지
      const best = ok.reduce((b, j) => (probs[j] > probs[b] ? j : b), ok[0]);
      if (best !== p.pick_idx) {
        const crowd = crowdShares([g.bets_w, g.bets_d, g.bets_l]);
        p.pick_idx = best;
        p.pick_prob = roundTo4(probs[best]);
        p.pick_odds = odds[best];
        p.crowd_share = crowd ? roundTo4(crowd[best]) : null;
        p.flags = p.flags.filter((f) => f !== '국내과열');
        if (crowd && crowd[best] - probs[best] >= OVERHEAT_GAP) p.flags.push('국내과열');
        p.flags.push('일관성조정');
      }
      S = S.filter(outcomeHolds(g.bet_type_id, g.handi, best));
    }
  }
  return out;
}
