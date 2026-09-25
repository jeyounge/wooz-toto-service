import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  combosFromDoubles, poissonBinomial, rankProbs,
  awayCoverCount, meetsAwayCover, doubleCount, buildTicket,
  combosFromMarks, buildBudgetTicket, buildUpsetTicket,
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

// ── v2 예산 티켓 / 이변 헌터 (2026-09-16) ──────────────────────────
test('combosFromMarks: 마킹 수의 곱 (트리플 포함)', () => {
  assert.equal(combosFromMarks([[0], [0, 1], [0, 1, 2]]), 6);
  assert.equal(combosFromMarks([[0], [0], [0]]), 1);
  assert.equal(combosFromMarks([[0, 1, 2], [0, 1, 2], [0, 1, 2]]), 27);
});

test('buildBudgetTicket: 예산을 넘지 않는다', () => {
  const models = Array.from({ length: 14 }, () => [40, 33, 27]);
  for (const budget of [1, 8, 27, 32, 128]) {
    const marks = buildBudgetTicket(models, { budget });
    assert.ok(combosFromMarks(marks) <= budget, `budget ${budget}`);
    assert.equal(marks.length, 14);
  }
});

test('buildBudgetTicket: 애매한 경기부터 마킹을 늘린다', () => {
  const models = [[80, 12, 8], [34, 33, 33], [75, 15, 10]];
  const tight = buildBudgetTicket(models, { budget: 3 });
  assert.equal(tight[1].length, 3, '예산이 빠듯하면 가장 평평한 경기부터 넓힌다');
  assert.deepEqual(tight[0], [0], '확실한 경기는 단식으로 둔다');
  // 예산이 남으면 확실한 경기에도 순서대로 쓴다
  const loose = buildBudgetTicket(models, { budget: 12 });
  assert.ok(combosFromMarks(loose) > combosFromMarks(tight));
  assert.ok(loose.every((mk, i) => mk.length >= tight[i].length));
});

test('buildBudgetTicket: 수동 마킹은 고정되고 예산에 반영된다', () => {
  const models = Array.from({ length: 14 }, () => [40, 33, 27]);
  const marks = buildBudgetTicket(models, { budget: 32, forced: { 3: [1, 2] } });
  assert.deepEqual(marks[3], [1, 2]);
  assert.ok(combosFromMarks(marks) <= 32);
});

test('buildUpsetTicket: 이변 후보에 최하위 인기 픽을 단식으로 박는다', () => {
  const crowds = [
    [32, 35, 33],   // 평평 → 이변 후보
    [30, 36, 34],   // 평평 + 무가 1위 → 이변 후보
    [31, 35, 34],   // 평평 → 이변 후보
    [20, 30, 50], [25, 30, 45], [22, 28, 50],  // 헤지 후보
    [90, 6, 4], [88, 7, 5], [85, 9, 6], [92, 5, 3],
    [4, 10, 86], [6, 9, 85], [5, 12, 83], [7, 11, 82],
  ];
  const models = crowds.map((c) => [...c]);
  const marks = buildUpsetTicket(crowds, models, { upsetPicks: 3, doubles: 3 });
  assert.equal(combosFromMarks(marks), 8);
  const least = (c) => [0, 1, 2].sort((a, b) => c[a] - c[b])[0];
  const upsetSingles = marks.filter((mk, i) => mk.length === 1 && mk[0] === least(crowds[i])).length;
  assert.equal(upsetSingles, 3, '이변픽 3개');
  // 90% 쏠린 경기는 이변픽 대상이 아니다
  assert.deepEqual(marks[6], [0]);
});

test('buildBudgetTicket: 목표 rank4(4등내)가 기본이고 all보다 4등내 확률이 높다', () => {
  const models = [[70,18,12],[65,20,15],[40,33,27],[38,34,28],[55,25,20],[60,22,18],[45,30,25],
                  [52,26,22],[30,36,34],[44,31,25],[48,29,23],[25,30,45],[58,24,18],[22,29,49]];
  const cover = (mk) => mk.map((m, i) => {
    const t = models[i][0] + models[i][1] + models[i][2];
    return m.reduce((s, k) => s + models[i][k] / t, 0);
  });
  const r4 = buildBudgetTicket(models, { budget: 32 });
  const all = buildBudgetTicket(models, { budget: 32, objective: 'all' });
  assert.ok(rankProbs(cover(r4)).within3 >= rankProbs(cover(all)).within3, '기본 목표가 4등내를 더 높인다');
  assert.ok(combosFromMarks(r4) <= 32);
  assert.ok(cover(all).reduce((a, b) => a * b, 1) >= cover(r4).reduce((a, b) => a * b, 1), "objective:'all'은 1등 확률을 더 높인다");
});
