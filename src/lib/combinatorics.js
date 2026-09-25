/**
 * combinatorics.js — 조합수학 (방법론 §조합수학, §패커버)
 * 순수함수. 조합수=2^더블수, 등수=Poisson-binomial, 패커버≥3 제약.
 */
import { AWAY_COVER } from './methodology.js';

/** 조합수 = 2^(더블수). 예: 5더블 → 32조합. (더블만 쓰던 v1 티켓용) */
export function combosFromDoubles(doubleCount) {
  if (!Number.isInteger(doubleCount) || doubleCount < 0) throw new Error('doubleCount must be a non-negative integer');
  return 2 ** doubleCount;
}

/** 조합수 = 경기별 마킹 수의 곱. 트리플(승무패 전부)까지 포함. 예: 트리플3 → 27조합. */
export function combosFromMarks(markIdxList) {
  return markIdxList.reduce((acc, mk) => acc * Math.max(1, Array.isArray(mk) ? mk.length : 1), 1);
}

/** 마킹에서 트리플(3개 전부 커버) 경기 수. */
export function tripleCount(marks) {
  return marks.filter((m) => Array.isArray(m) && m.length >= 3).length;
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

/**
 * 예산 티켓 빌더 (v3, 2026-09-25) — 조합 예산 안에서 **4등내(11개 이상 적중)** 확률을 최대화한다.
 *
 * v2는 "14경기 전부 커버"(1등)를 최대화했는데, 그 목표는 예산을 아무리 늘려도 0.05% 수준이라
 * 사실상 살 수 없는 목표였다. 등수(1~4등)는 11개 이상이면 되고 예산에 거의 선형으로 반응한다:
 *   32조합 4등내 12.0% / 64조합 16.2% / 128조합 21.3% / 256조합 30.9% (2026055 기준)
 * 참고로 전 경기 정배 단식 한 장은 4등내 1.94%에 그친다 — 정배만으로는 등수권이 불가능하다.
 * objective:'all'을 주면 예전처럼 1등 확률을 최대화한다.
 *
 * 역대 813회차 백테스트 근거:
 * - 투표율 1위는 평균 6.96/14개만 적중(49.7%). 13개 이상 적중한 회차는 0회 → 정배 단식만으로 1등 불가.
 * - 이변 5,723건 중 실제 결과가 최하위 인기(3위)였던 경우가 46.4%. 1·2위 더블은 이걸 통째로 버린다.
 * - 같은 예산이면 더블을 넓게 펴는 것보다 애매한 경기 2~3개를 트리플로 확정하는 쪽이 낫다.
 *   더블5(32조합) 14커버 0회 vs 트리플3(27조합) 2회 · 트리플3+더블2(108조합) 3회 vs 더블7(128조합) 1회.
 *
 * 한계이득(커버확률 증가율 / 조합수 증가율)이 큰 순으로 마킹을 하나씩 추가한다.
 * 관리자 수동 마킹(forced)은 고정으로 두고 남은 예산만 배분한다.
 *
 * @param {number[][]} models 경기별 [승%, 무%, 패%]
 * @param {{budget?:number, forced?:Record<number, number[]>, objective?:'rank4'|'all'}} opts
 * @returns {number[][]} 경기별 markIdx (오름차순)
 */
export function buildBudgetTicket(models, opts = {}) {
  const { budget = 32, forced = {}, objective = 'rank4' } = opts;
  const probs = models.map((m) => {
    const total = m[0] + m[1] + m[2];
    return total > 0 ? m.map((x) => x / total) : [1 / 3, 1 / 3, 1 / 3];
  });

  const marks = probs.map((p) => [p.indexOf(Math.max(...p))]);
  const locked = new Set();
  for (const [key, mk] of Object.entries(forced)) {
    const i = Number(key);
    if (!Array.isArray(mk) || !mk.length || !marks[i]) continue;
    marks[i] = [...new Set(mk)].sort((a, b) => a - b);
    locked.add(i);
  }

  // 목표값: 'rank4' = 11개 이상 적중(4등내) 확률, 'all' = 14개 전부 적중(1등) 확률
  const coverOf = (mks) => mks.map((mk, i) => mk.reduce((s, k) => s + probs[i][k], 0));
  const score = (mks) => {
    const cover = coverOf(mks);
    return objective === 'all' ? cover.reduce((a, b) => a * b, 1) : rankProbs(cover).within3;
  };

  let combos = combosFromMarks(marks);
  // 1단계: 목표값 기준 배분. 2단계: 목표값이 더 오르지 않으면(예: 경기 수가 적어 4등내가 이미 1.0)
  //        남은 예산을 1등 확률에 쓴다.
  for (const scoreFn of objective === 'all' ? [score] : [score, (mks) => coverOf(mks).reduce((a, b) => a * b, 1)]) {
    let current = scoreFn(marks);
    for (;;) {
      let best = null;
      marks.forEach((mk, i) => {
        if (locked.has(i) || mk.length >= 3) return;
        const rest = [0, 1, 2].filter((k) => !mk.includes(k));
        const add = rest.reduce((a, k) => (probs[i][k] > probs[i][a] ? k : a), rest[0]);
        const mult = (mk.length + 1) / mk.length;
        if (combos * mult > budget + 1e-9) return;
        const trial = marks.map((x, j) => (j === i ? [...x, add] : x));
        const next = scoreFn(trial);
        // 부동소수점 잡음으로 예산을 쓰지 않도록 의미 있는 개선만 인정한다.
        // (경기 수가 적으면 4등내 확률이 1.0으로 포화돼 1e-16 수준의 가짜 이득이 생긴다)
        if (!(next > current * (1 + 1e-9))) return;
        const gain = Math.log(next / current) / Math.log(mult); // 조합수 1단위당 이득
        if (!best || gain > best.gain) best = { i, add, gain, mult, next };
      });
      if (!best) break;
      marks[best.i] = [...marks[best.i], best.add].sort((a, b) => a - b);
      combos *= best.mult;
      current = best.next;
    }
  }
  return marks;
}

/**
 * 이변 헌터 위성 티켓 — 대중과 정반대로 가는 소액 티켓.
 *
 * 역대 11,891경기에서 최하위 인기(3위)가 터진 조건:
 *   3위 투표율 25%+ → 31.3% · 1·2위 격차 5%p 이내 → 30.1% · 투표율 1위가 무 → 32.0%
 *   반대로 1위 투표율 80%+ → 10.8% · 3위 투표율 10% 미만 → 14.2%
 * 위 점수가 높은 경기에 **3위 픽 단식**을 그대로 박고(과감), 그다음 애매한 경기에만 더블을 준다.
 *
 * @param {number[][]} crowds 경기별 투표율 [승, 무, 패]
 * @param {number[][]} models 경기별 모델 확률 [승, 무, 패]
 * @param {{upsetPicks?:number, doubles?:number}} opts 기본 3픽 + 3더블 = 8조합
 */
export function buildUpsetTicket(crowds, models, opts = {}) {
  const { upsetPicks = 3, doubles = 3 } = opts;
  const info = crowds.map((c, i) => {
    const order = [0, 1, 2].sort((a, b) => c[b] - c[a]);
    const [first, second, third] = order;
    const score = c[third]                       // 3위 투표율이 높을수록 저평가
      + Math.max(0, 12 - (c[first] - c[second]))  // 1·2위가 붙어 있을수록
      + (first === 1 ? 8 : 0)                     // 투표율 1위가 '무'면 1위 적중률 31%뿐
      - Math.max(0, c[first] - 70) / 2;           // 70% 넘게 쏠린 경기는 제외 쪽으로
    return { i, first, second, third, score, gap: c[first] - c[second] };
  });

  const byScore = [...info].sort((a, b) => b.score - a.score);
  const upset = new Set(byScore.slice(0, upsetPicks).map((x) => x.i));
  const hedge = new Set(byScore.slice(upsetPicks, upsetPicks + doubles).map((x) => x.i));

  return info.map((x) => {
    if (upset.has(x.i)) return [x.third];                             // 과감: 최하위 인기 단식
    if (hedge.has(x.i)) return [x.first, x.second].sort((a, b) => a - b);
    const m = models[x.i];
    return [m.indexOf(Math.max(...m))];                                // 나머지는 모델 최적 단식
  });
}
