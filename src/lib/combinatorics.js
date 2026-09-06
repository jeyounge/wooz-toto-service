/**
 * combinatorics.js — 조합수학 (방법론 §조합수학, §패커버)
 * 순수함수. 조합수=2^더블수, 등수=Poisson-binomial, 패커버≥3 제약.
 */
import { AWAY_COVER } from './methodology.js';

/** 조합수 = 2^(더블수). 예: 5더블 → 32조합. */
export function combosFromDoubles(doubleCount) {
  if (!Number.isInteger(doubleCount) || doubleCount < 0) throw new Error('doubleCount must be a non-negative integer');
  return 2 ** doubleCount;
}

/**
 * Poisson-binomial 분포: 서로 다른 실패확률의 "틀린 개수" 분포.
 * @param {number[]} failProbs 경기별 틀릴 확률 (0~1)
 * @returns {number[]} dist[k] = 정확히 k개 틀릴 확률 (길이 = n+1)
 */
export function poissonBinomial(failProbs) {
  let dist = [1];
  for (const p of failProbs) {
    const q = Math.min(Math.max(p, 0), 1); // clamp
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k++) {
      next[k] += dist[k] * (1 - q);   // 이 경기는 맞음
      next[k + 1] += dist[k] * q;     // 이 경기는 틀림
    }
    dist = next;
  }
  return dist;
}

/**
 * 티켓 등수 확률. 틀린개수 k → 등수(0틀림=1등 … 3틀림=4등).
 * @param {number[]} coverProbs 경기별 "맞출(커버) 확률" (0~1)
 * @returns {{g0:number, within1:number, within2:number, within3:number, dist:number[]}}
 */
export function rankProbs(coverProbs) {
  const failProbs = coverProbs.map((q) => 1 - Math.min(Math.max(q, 0), 1));
  const dist = poissonBinomial(failProbs);
  const at = (k) => dist[k] || 0;
  return {
    g0: at(0),                                  // 1등 (0틀림)
    within1: at(0) + at(1),                      // 2등 내
    within2: at(0) + at(1) + at(2),              // 3등 내
    within3: at(0) + at(1) + at(2) + at(3),      // 4등 내
    dist,
  };
}

/**
 * 티켓 마킹에서 '패'를 커버하는 경기 수.
 * @param {string[][]} marks 경기별 커버 집합. 예: [['승'],['무','패'],...]
 */
export function awayCoverCount(marks) {
  return marks.filter((m) => Array.isArray(m) && m.includes('패')).length;
}

/**
 * 패커버 룰 충족 여부 (기본 최소 3, 방법론 §패커버).
 */
export function meetsAwayCover(marks, min = AWAY_COVER.MIN_AWAY_COVER) {
  return awayCoverCount(marks) >= min;
}

/** 마킹에서 더블(2개 이상 커버) 경기 수 → 조합수 계산용. */
export function doubleCount(marks) {
  return marks.filter((m) => Array.isArray(m) && m.length >= 2).length;
}
