import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustProbs, decideMark, evaluateMatch } from '../src/lib/rules.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('adjustProbs: 비 K리그는 변화 없음(재정규화만)', () => {
  const { probs, applied } = adjustProbs({ pWin: 50, pDraw: 30, pLose: 20 }, { league: 'EPL' });
  near(probs.pWin, 50);
  assert.deepEqual(applied, []);
});

test('adjustProbs: R3 K리그 무 +2%p', () => {
  const { probs, applied } = adjustProbs({ pWin: 50, pDraw: 30, pLose: 20 }, { league: 'K리그' });
  assert.ok(applied.includes(3));
  // 무가 상대적으로 상승했는지 (재정규화 전 +2)
  assert.ok(probs.pDraw > 30 * 100 / 102 - 1);
  near(probs.pWin + probs.pDraw + probs.pLose, 100);
});

test('adjustProbs: R2 K리그 강팀홈 승 −10%p', () => {
  const base = { pWin: 60, pDraw: 25, pLose: 15 };
  const { probs, applied } = adjustProbs(base, { league: 'K리그', isStrongHomeKLeague: true });
  assert.ok(applied.includes(2));
  assert.ok(applied.includes(3));
  // 승 비중이 원본보다 낮아져야
  assert.ok(probs.pWin < 60);
  near(probs.pWin + probs.pDraw + probs.pLose, 100);
});

test('decideMark: R1 초강세(80~85%) 무헤지 단식 승', () => {
  const m = decideMark({ pWin: 82, pDraw: 12, pLose: 6 });
  assert.deepEqual(m.marks, ['승']);
  assert.equal(m.kind, 'single');
  assert.ok(m.applied.includes(1));
});

test('decideMark: 초강세라도 90%는 R1 범위 밖(기본 단식)', () => {
  const m = decideMark({ pWin: 90, pDraw: 6, pLose: 4 });
  assert.deepEqual(m.marks, ['승']);
  assert.equal(m.kind, 'single');
  assert.ok(!m.applied.includes(1));
});

test('decideMark: 교훈A 붕괴홈 정배 → 승·무 더블', () => {
  const m = decideMark({ pWin: 55, pDraw: 25, pLose: 20 }, { isCollapseHome: true });
  assert.deepEqual(m.marks, ['승', '무']);
  assert.equal(m.kind, 'double');
  assert.ok(m.applied.includes('A'));
});

test('decideMark: 교훈B 2nd 3%p 이내 → 더블', () => {
  const m = decideMark({ pWin: 40, pDraw: 38, pLose: 22 });
  assert.equal(m.kind, 'double');
  assert.deepEqual(m.marks.sort(), ['무', '승']);
  assert.ok(m.applied.includes('B'));
});

test('decideMark: 명확한 우세 → 기본 단식', () => {
  const m = decideMark({ pWin: 55, pDraw: 25, pLose: 20 });
  assert.deepEqual(m.marks, ['승']);
  assert.equal(m.kind, 'single');
  assert.equal(m.applied.length, 0);
});

test('decideMark: 교훈A가 R1보다 우선 (붕괴홈 + 초강세)', () => {
  const m = decideMark({ pWin: 82, pDraw: 12, pLose: 6 }, { isCollapseHome: true });
  assert.equal(m.kind, 'double'); // A 먼저
  assert.ok(m.applied.includes('A'));
});

test('evaluateMatch: 통합 파이프라인 (K리그 무 보정 + 마킹)', () => {
  const r = evaluateMatch({ pWin: 40, pDraw: 38, pLose: 22 }, { league: 'K리그' });
  near(r.probs.pWin + r.probs.pDraw + r.probs.pLose, 100);
  assert.ok(Array.isArray(r.marks));
  assert.ok(r.rulesApplied.includes(3)); // R3 적용
});
