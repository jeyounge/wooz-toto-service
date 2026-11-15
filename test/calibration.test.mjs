import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpolate, calibrateVotes } from '../src/lib/calibration.js';
import { CAL_VX, CAL_VY } from '../src/lib/methodology.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('interpolate: 끝점은 그대로', () => {
  near(interpolate(CAL_VX, CAL_VY, 0), 3);
  near(interpolate(CAL_VX, CAL_VY, 100), 88);
});

test('interpolate: 격자점 정확', () => {
  near(interpolate(CAL_VX, CAL_VY, 45), 40.8);
  near(interpolate(CAL_VX, CAL_VY, 85), 68.4);
});

test('interpolate: 중간 선형보간', () => {
  // 5→14.8, 15→23.2 사이 x=10 → 중간값 19.0
  near(interpolate(CAL_VX, CAL_VY, 10), (14.8 + 23.2) / 2);
});

test('interpolate: 범위 밖 클램프', () => {
  near(interpolate(CAL_VX, CAL_VY, -50), 3);
  near(interpolate(CAL_VX, CAL_VY, 200), 88);
});

test('calibrateVotes: 합 = 100', () => {
  const { pWin, pDraw, pLose } = calibrateVotes(70, 20, 10);
  near(pWin + pDraw + pLose, 100);
});

test('calibrateVotes: favorite-longshot — 고투표율은 재정규화 후 소폭 하향', () => {
  // 투표율 90/6/4 → 승 확률은 90보다 낮아야(과대평가 보정)
  const { pWin } = calibrateVotes(90, 6, 4);
  assert.ok(pWin < 90, `pWin ${pWin} < 90`);
  assert.ok(pWin > 50, `pWin ${pWin} > 50 (여전히 최상위)`);
});

test('calibrateVotes: 승·패 대칭, 무는 전용 곡선으로 하향', () => {
  const r = calibrateVotes(33.3, 33.3, 33.3);
  near(r.pWin, r.pLose, 1e-6);
  assert.ok(r.pDraw < r.pWin, `pDraw ${r.pDraw} < pWin ${r.pWin}`);
});

test('calibrateVotes: 무 투표 40% → 무 확률 약 30% (공통 곡선이면 38%대)', () => {
  const { pDraw } = calibrateVotes(30, 40, 30);
  assert.ok(pDraw > 26 && pDraw < 33, `pDraw ${pDraw}`);
});

test('calibrateVotes: 곡선 오버라이드 vy만 주면 무에도 같은 곡선', () => {
  const r = calibrateVotes(33.3, 33.3, 33.3, { vy: CAL_VY });
  near(r.pWin, r.pDraw, 1e-6);
});

test('calibrateVotes: 0/0/0 → 균등 (각 baseline 3% 동일 → 재정규화 33.3)', () => {
  const r = calibrateVotes(0, 0, 0);
  near(r.pWin, 100 / 3, 1e-6);
  near(r.pDraw, 100 / 3, 1e-6);
  near(r.pLose, 100 / 3, 1e-6);
});
