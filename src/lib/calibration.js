/**
 * calibration.js — 투표율 → 적중률 보간 (방법론 §캘리브레이션)
 * 순수함수. CAL_VX/CAL_VY(methodology.js)로 세 결과를 각각 보간 후 합=100 재정규화.
 */
import { CAL_VX, CAL_VY } from './methodology.js';

/**
 * 조각별 선형보간. 범위 밖은 끝값으로 클램프.
 * @param {number[]} vx 오름차순 x
 * @param {number[]} vy 대응 y
 * @param {number} x
 * @returns {number}
 */
export function interpolate(vx, vy, x) {
  if (!Number.isFinite(x)) return 0;
  if (x <= vx[0]) return vy[0];
  if (x >= vx[vx.length - 1]) return vy[vy.length - 1];
  for (let i = 0; i < vx.length - 1; i++) {
    if (x >= vx[i] && x <= vx[i + 1]) {
      const span = vx[i + 1] - vx[i];
      if (span === 0) return vy[i];
      const t = (x - vx[i]) / span;
      return vy[i] + t * (vy[i + 1] - vy[i]);
    }
  }
  return vy[vy.length - 1];
}

/**
 * 세 결과 투표율(%) → 캘리브레이션 확률(%). 합=100 재정규화.
 * @param {number} voteH 승 투표율 %
 * @param {number} voteD 무 투표율 %
 * @param {number} voteL 패 투표율 %
 * @param {{vx?:number[], vy?:number[]}} [curve] 곡선 오버라이드(rolling 재적합용)
 * @returns {{pWin:number, pDraw:number, pLose:number}}
 */
export function calibrateVotes(voteH, voteD, voteL, curve = {}) {
  const vx = curve.vx ?? CAL_VX;
  const vy = curve.vy ?? CAL_VY;
  const rawH = interpolate(vx, vy, voteH);
  const rawD = interpolate(vx, vy, voteD);
  const rawL = interpolate(vx, vy, voteL);
  const sum = rawH + rawD + rawL;
  if (sum <= 0) return { pWin: 0, pDraw: 0, pLose: 0 };
  return {
    pWin: (rawH / sum) * 100,
    pDraw: (rawD / sum) * 100,
    pLose: (rawL / sum) * 100,
  };
}
