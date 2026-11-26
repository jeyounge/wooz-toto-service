/**
 * domesticCal.js — 국내배당만 있는 게임의 확률 보정 (순수함수, DB 없음).
 *
 * 해외 배당이 없으면 확률 = 베트맨 배당 디빅뿐이라 모든 선택지 EV가 환급률(≈0.87~0.90)로 같다.
 * 그래서 우리 DB에 쌓인 확정 경기로 "국내배당 구간 → 실제 적중률"을 재고(favorite-longshot 편향 계량),
 * 디빅 확률에 구간별 보정 계수를 곱한 뒤 다시 정규화한다.
 *  - 계수 f = (적중 수 + K) / (디빅 확률 합 + K): 표본이 적은 구간은 1(보정 없음)에 가깝게 수축.
 *  - 2026-11-27 첫 측정(3회차 1,523경기): 구간별 실제 vs 디빅 차이 ±1~2%p → 계수 ≈ 0.95~1.07.
 *    즉 지금은 사실상 "환급률 높은 마켓(홀짝 1.8/1.8 = 90%)이 최선"이고, 회차가 쌓이면 편향이 드러나는 구간을 따라간다.
 */
import { devig } from './predict.js';

export const DOM_CAL_BUCKETS = Object.freeze([1, 1.3, 1.5, 1.7, 1.9, 2.2, 2.8, 4, Infinity]);
export const DOM_CAL_K = 50;

const bucketOf = (o) => {
  for (let i = 0; i < DOM_CAL_BUCKETS.length - 1; i++) if (o >= DOM_CAL_BUCKETS[i] && o < DOM_CAL_BUCKETS[i + 1]) return i;
  return -1;
};

/**
 * 확정 게임 → 구간별 보정표.
 * @param {Array<{odds_w:number, odds_d:number, odds_l:number, result_idx:number|null}>} rows 결과 확정 게임 (적중특례 4 제외)
 * @returns {Array<{lo:number, hi:number, n:number, hit:number, imp:number, factor:number}>}
 */
export function buildDomesticCal(rows, { k = DOM_CAL_K } = {}) {
  const acc = DOM_CAL_BUCKETS.slice(0, -1).map((lo, i) => ({ lo, hi: DOM_CAL_BUCKETS[i + 1], n: 0, hit: 0, imp: 0 }));
  for (const r of rows || []) {
    if (r.result_idx == null || r.result_idx === 4) continue;
    const odds = [r.odds_w, r.odds_d, r.odds_l].map((o) => (o == null ? 0 : Number(o)));
    if (odds.filter((o) => o > 1).length < 2) continue;
    const p = devig(odds);
    for (let i = 0; i < 3; i++) {
      if (!(odds[i] > 1)) continue;
      const b = bucketOf(odds[i]); if (b < 0) continue;
      acc[b].n++; acc[b].imp += p[i]; if (r.result_idx === i) acc[b].hit++;
    }
  }
  return acc.map((a) => ({ ...a, factor: (a.hit + k) / (a.imp + k) }));
}

/** 국내 배당 → 보정 확률 [w,d,l] (미발매 선택지 0, 합 1). 보정표 없으면 디빅 그대로. */
export function calibrateDomestic(oddsIn, cal) {
  const odds = oddsIn.map((o) => (o == null ? 0 : Number(o)));
  const p = devig(odds);
  if (!cal || !cal.length) return p;
  const q = p.map((x, i) => (odds[i] > 1 ? x * (cal[bucketOf(odds[i])]?.factor ?? 1) : 0));
  const s = q.reduce((a, b) => a + b, 0);
  return s > 0 ? q.map((x) => x / s) : p;
}
