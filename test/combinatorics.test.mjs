import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  combosFromDoubles, poissonBinomial, rankProbs,
  awayCoverCount, meetsAwayCover, doubleCount,
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
