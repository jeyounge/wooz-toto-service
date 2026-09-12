import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  combosFromDoubles, poissonBinomial, rankProbs,
  awayCoverCount, meetsAwayCover, doubleCount, buildTicket,
} from '../src/lib/combinatorics.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const sum = (a) => a.reduce((s, x) => s + x, 0);

test('combosFromDoubles: 2^n', () => {
  assert.equal(combosFromDoubles(0), 1);
  assert.equal(combosFromDoubles(5), 32);
  assert.equal(combosFromDoubles(6), 64);
});

test('combosFromDoubles: 잘못된 입력 예외', () => {
  assert.throws(() => combosFromDoubles(-1));
  assert.throws(() => combosFromDoubles(1.5));
});

test('poissonBinomial: 모두 안 틀림 → dist[0]=1', () => {
  const d = poissonBinomial([0, 0, 0]);
  near(d[0], 1);
  near(sum(d), 1);
});

test('poissonBinomial: 모두 틀림 → dist[n]=1', () => {
  const d = poissonBinomial([1, 1]);
  near(d[2], 1);
  near(sum(d), 1);
});

test('poissonBinomial: 확률 합 = 1', () => {
  const d = poissonBinomial([0.3, 0.5, 0.7, 0.2]);
  near(sum(d), 1);
  assert.equal(d.length, 5); // n+1
});

test('poissonBinomial: 독립 두 경기 수동 검산', () => {
  // 실패확률 0.2, 0.4 → P(0틀림)=0.8*0.6=0.48
  const d = poissonBinomial([0.2, 0.4]);
  near(d[0], 0.48);
  near(d[1], 0.8 * 0.4 + 0.2 * 0.6); // 0.44
  near(d[2], 0.2 * 0.4);             // 0.08
});

test('rankProbs: 완전 커버 → 1등확률 1', () => {
  const r = rankProbs([1, 1, 1, 1]);
  near(r.g0, 1);
  near(r.within3, 1);
});

test('rankProbs: 누적 단조 증가', () => {
  const r = rankProbs([0.7, 0.6, 0.8, 0.5, 0.9]);
  assert.ok(r.g0 <= r.within1);
  assert.ok(r.within1 <= r.within2);
  assert.ok(r.within2 <= r.within3);
});

test('awayCoverCount / meetsAwayCover: 패커버 ≥3', () => {
  const marks = [['승'], ['무', '패'], ['패'], ['승', '패'], ['무']];
  assert.equal(awayCoverCount(marks), 3);
  assert.equal(meetsAwayCover(marks), true);
  assert.equal(meetsAwayCover([['승'], ['무', '패'], ['패']]), false); // 2개
});

test('doubleCount: 더블 경기 수', () => {
  const marks = [['승'], ['무', '패'], ['승', '무', '패'], ['패']];
  assert.equal(doubleCount(marks), 2);
  assert.equal(combosFromDoubles(doubleCount(marks)), 4);
});

test('buildTicket: 목표 더블 수 = 조합 지수 (32조합=5더블)', () => {
  const models = Array.from({ length: 14 }, (_, i) => [50 - i, 30, 20 + i]);
  const t = buildTicket(models, { targetDoubles: 5 });
  assert.equal(t.filter((m) => m.length >= 2).length, 5);
  assert.equal(combosFromDoubles(5), 32);
});

test('buildTicket: 앵커는 단식 고정', () => {
  const models = [[90, 6, 4], [40, 35, 25], [38, 34, 28]];
  const t = buildTicket(models, { targetDoubles: 2, anchorIdx: [0] });
  assert.equal(t[0].length, 1);        // 앵커 단식 유지
  assert.deepEqual(t[0], [0]);         // 승 단식
});

test('buildTicket: 규칙더블 필수 포함', () => {
  const models = [[50, 30, 20], [45, 40, 15], [60, 25, 15]];
  const t = buildTicket(models, { targetDoubles: 1, ruleDoubleIdx: [1] });
  assert.ok(t[1].length >= 2);
});

test('buildTicket: 근소차(gap 작은) 경기 우선 더블', () => {
  const models = [[60, 25, 15], [40, 38, 22], [70, 20, 10]]; // idx1 gap=2 최소
  const t = buildTicket(models, { targetDoubles: 1 });
  assert.ok(t[1].length >= 2);
  assert.equal(t[0].length, 1);
  assert.equal(t[2].length, 1);
});

test('buildTicket: 단식은 top, 더블은 top+second 오름차순', () => {
  const t = buildTicket([[40, 38, 22]], { targetDoubles: 1 });
  assert.deepEqual(t[0], [0, 1]); // 승·무
});
