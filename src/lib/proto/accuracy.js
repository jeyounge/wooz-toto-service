/**
 * accuracy.js — 프로토 예측 적중률 집계 (순수함수).
 * 축: 전체 / 종목 / 리그 / 베팅유형 / 플래그(국내과열·해외배당 …) / 확률원천.
 *  - 적중률 vs 예상(평균 예측확률): 둘이 비슷하면 확률이 잘 맞는(캘리브레이션된) 것
 *  - 가치 픽 회수율: 가치 픽에 1씩 걸었다고 가정한 환급 합 / 건수 (1.0 = 본전)
 */
import { isHit } from './predict.js';

const blank = () => ({ n: 0, hit: 0, expSum: 0, vN: 0, vHit: 0, vReturn: 0 });
function add(acc, key, r) {
  if (!acc[key]) acc[key] = blank();
  const a = acc[key];
  a.n++; if (r.hit) a.hit++; a.expSum += r.pickProb;
  if (r.valueIdx != null) { a.vN++; if (r.valueHit) { a.vHit++; a.vReturn += r.valueOdds; } }
}
const finish = (o) => Object.fromEntries(Object.entries(o).map(([k, a]) => [k, {
  n: a.n, hit: a.hit, rate: a.n ? a.hit / a.n : null, exp: a.n ? a.expSum / a.n : null,
  valueN: a.vN, valueHit: a.vHit, valueRoi: a.vN ? a.vReturn / a.vN : null,
}]).sort((x, y) => y[1].n - x[1].n));

/**
 * @param {Array<{sport, league, bet_type, result_idx, odds_w, odds_d, odds_l, pred:{pick_idx,pick_prob,value_idx,flags,prob_source}}>} games
 */
export function aggregateAccuracy(games) {
  const acc = { total: {}, sport: {}, league: {}, type: {}, flag: {}, source: {} };
  for (const g of games) {
    const p = g.pred; if (!p) continue;
    const hit = isHit(g.result_idx, p.pick_idx); if (hit == null) continue;
    const odds = [g.odds_w, g.odds_d, g.odds_l].map(Number);
    const r = {
      hit, pickProb: Number(p.pick_prob), valueIdx: p.value_idx,
      valueHit: p.value_idx != null && g.result_idx === p.value_idx, valueOdds: p.value_idx != null ? odds[p.value_idx] : 0,
    };
    add(acc.total, '전체', r);
    add(acc.sport, g.sport, r);
    add(acc.league, `${g.sport} · ${g.league_short || g.league}`, r);
    add(acc.type, g.bet_type, r);
    add(acc.source, p.prob_source, r);
    for (const f of p.flags || []) add(acc.flag, f, r);
    if (!(p.flags || []).includes('국내과열')) add(acc.flag, '과열 아님', r);
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, finish(v)]));
}
