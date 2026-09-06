/**
 * rules.js — 규칙엔진 (방법론 §규칙0~4, §교훈A/B)
 * 순수함수. 확률 보정(R2/R3)과 마킹 결정(R1/교훈A/B)을 분리.
 *
 * 결과 키: 'win'(승) · 'draw'(무) · 'lose'(패). 한글 마킹은 '승'/'무'/'패'.
 */
import { RULES, LESSONS } from './methodology.js';

const KO = { win: '승', draw: '무', lose: '패' };

/** 합=100 재정규화 */
function normalize({ pWin, pDraw, pLose }) {
  const sum = pWin + pDraw + pLose;
  if (sum <= 0) return { pWin: 0, pDraw: 0, pLose: 0 };
  return { pWin: (pWin / sum) * 100, pDraw: (pDraw / sum) * 100, pLose: (pLose / sum) * 100 };
}

/**
 * 확률 보정 규칙 (R2: K리그 강팀홈 −10%p 승 / R3: K리그 무 +2%p).
 * @param {{pWin,pDraw,pLose}} probs
 * @param {{league?:string, isStrongHomeKLeague?:boolean}} ctx
 * @returns {{probs, applied:number[]}}
 */
export function adjustProbs(probs, ctx = {}) {
  let p = { ...probs };
  const applied = [];
  const isK = ctx.league === 'K리그' || ctx.league === 'KLEAGUE' || ctx.isKLeague;

  // R2: K리그 강팀 홈 승 −10%p
  if (isK && ctx.isStrongHomeKLeague) {
    p.pWin += RULES.R2_KLEAGUE_STRONG_HOME.adjustPp; // -10
    applied.push(RULES.R2_KLEAGUE_STRONG_HOME.id);
  }
  // R3: K리그 무 +2%p
  if (isK) {
    p.pDraw += RULES.R3_KLEAGUE_DRAW.adjustPp; // +2
    applied.push(RULES.R3_KLEAGUE_DRAW.id);
  }

  p.pWin = Math.max(p.pWin, 0);
  p.pDraw = Math.max(p.pDraw, 0);
  p.pLose = Math.max(p.pLose, 0);
  return { probs: normalize(p), applied };
}

/**
 * 마킹 결정 (R1 초강세 무헤지 / 교훈A 붕괴홈 / 교훈B 2nd 3%p 이내).
 * @param {{pWin,pDraw,pLose}} probs 보정된 확률
 * @param {{isCollapseHome?:boolean}} ctx
 * @returns {{marks:string[], kind:'single'|'double', applied:string[], reason:string}}
 */
export function decideMark(probs, ctx = {}) {
  const entries = [
    { key: 'win', p: probs.pWin },
    { key: 'draw', p: probs.pDraw },
    { key: 'lose', p: probs.pLose },
  ].sort((a, b) => b.p - a.p);

  const top = entries[0];
  const second = entries[1];
  const applied = [];

  // 교훈A: 붕괴홈(연속완패) 홈 정배 단식 승 금지 → 승·무 더블
  if (ctx.isCollapseHome && top.key === 'win') {
    applied.push(LESSONS.A_COLLAPSE_HOME.id);
    return {
      marks: [KO.win, KO.draw],
      kind: 'double',
      applied,
      reason: '붕괴홈 정배 단식 금지(교훈A) → 승·무 더블',
    };
  }

  // R1: 승 초강세 80~85% → 무헤지 단식 승
  const [lo, hi] = RULES.R1_STRONG_FAVORITE_NO_HEDGE.range;
  if (top.key === 'win' && top.p >= lo && top.p <= hi) {
    applied.push(RULES.R1_STRONG_FAVORITE_NO_HEDGE.id);
    return { marks: [KO.win], kind: 'single', applied, reason: '초강세(80~85%) 무헤지 단식(R1)' };
  }

  // 교훈B: 2nd가 top과 3%p 이내 → 단식 금지, 더블
  if (top.p - second.p <= LESSONS.B_SECOND_WITHIN_3PP.thresholdPp) {
    applied.push(LESSONS.B_SECOND_WITHIN_3PP.id);
    return {
      marks: [KO[top.key], KO[second.key]],
      kind: 'double',
      applied,
      reason: `2nd 3%p 이내 단식 금지(교훈B) → ${KO[top.key]}·${KO[second.key]} 더블`,
    };
  }

  // 기본: 최상위 단식
  return { marks: [KO[top.key]], kind: 'single', applied, reason: '최상위 단식' };
}

/**
 * 한 경기 전체 파이프라인: 보정 → 마킹.
 * @param {{pWin,pDraw,pLose}} modelProbs
 * @param {object} ctx
 */
export function evaluateMatch(modelProbs, ctx = {}) {
  const { probs, applied: adjApplied } = adjustProbs(modelProbs, ctx);
  const mark = decideMark(probs, ctx);
  return {
    probs,
    marks: mark.marks,
    kind: mark.kind,
    reason: mark.reason,
    rulesApplied: [...adjApplied, ...mark.applied],
  };
}
