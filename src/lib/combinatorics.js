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

/**
 * 티켓 빌더: 예산(목표 더블 수)에 맞춰 마킹 구성. (방법론 §조합수학)
 * - 앵커(클래스 격차 확실)는 단식 고정
 * - 규칙상 더블(교훈A/B)은 필수 더블
 * - 부족분은 1·2위 확률 근소차(gap) 작은 순으로 더블 (헤지 가치 큰 경기)
 * targetDoubles=5 → 2^5=32조합.
 *
 * @param {number[][]} models 경기별 [승%, 무%, 패%]
 * @param {{targetDoubles?:number, ruleDoubleIdx?:number[], anchorIdx?:number[]}} opts
 * @returns {number[][]} 경기별 markIdx (단식 [top] | 더블 [top,second] 오름차순)
 */
export function buildTicket(models, opts = {}) {
  const { targetDoubles = 5, ruleDoubleIdx = [], anchorIdx = [], forced = {} } = opts;
  const info = models.map((m, i) => {
    const arr = [[0, m[0]], [1, m[1]], [2, m[2]]].sort((a, b) => b[1] - a[1]);
    return { i, topIdx: arr[0][0], secondIdx: arr[1][0], gap: arr[0][1] - arr[1][1] };
  });

  // 수동 오버라이드: forced[i] = markIdx 배열 (관리자 확정 마킹)
  const forcedSingle = new Set();
  const forcedDouble = new Set();
  for (const [k, mk] of Object.entries(forced)) {
    const i = Number(k);
    if (Array.isArray(mk) && mk.length >= 2) forcedDouble.add(i);
    else forcedSingle.add(i);
  }

  const anchors = new Set(anchorIdx);
  const doubles = new Set([
    ...ruleDoubleIdx.filter((i) => !anchors.has(i) && !forcedSingle.has(i)),
    ...forcedDouble,
  ]);

  // 부족분: 앵커/기존더블/강제단식 제외, gap 작은 순으로 더블 추가
  const candidates = info
    .filter((x) => !anchors.has(x.i) && !doubles.has(x.i) && !forcedSingle.has(x.i))
    .sort((a, b) => a.gap - b.gap);
  let need = targetDoubles - doubles.size;
  for (const c of candidates) {
    if (need <= 0) break;
    doubles.add(c.i);
    need--;
  }

  return info.map((x) => {
    if (forced[x.i]) return [...forced[x.i]].sort((a, b) => a - b);
    return doubles.has(x.i) ? [x.topIdx, x.secondIdx].sort((a, b) => a - b) : [x.topIdx];
  });
}
