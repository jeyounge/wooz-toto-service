import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBotBets, matchKeyOf, BOT_POLICY } from '../src/lib/proto/bot.js';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const inH = (h) => new Date(NOW + h * 3600e3).toISOString();
let seq = 0;
/** 승(0) 선택지가 odds·prob, 패(2)는 EV가 낮게 */
const g = (odds, prob, extra = {}) => ({
  id: ++seq, home: `H${seq}`, away: `A${seq}`, game_ts: inH(5), result_idx: null,
  odds_w: odds, odds_d: 0, odds_l: 1.2,
  pred: { prob_source: 'espn', p_w: prob, p_d: 0, p_l: 1 - prob }, ...extra,
});

test('planBotBets: EV 기준 미달·국내 디빅·범위 밖 시각은 사지 않는다', () => {
  const gs = [
    g(2.6, 0.30),                                   // EV 0.78 미달
    g(2.6, 0.36, { pred: { prob_source: 'domestic', p_w: 0.36, p_d: 0, p_l: 0.64 } }),
    g(2.6, 0.38, { game_ts: inH(30) }),              // 24시간 밖
    g(2.6, 0.38, { game_ts: inH(-1) }),              // 이미 시작
  ];
  assert.deepEqual(planBotBets(gs, { now: NOW }), []);
});

test('planBotBets: 단폴이 범위 안이면 EV 높은 순, 경기는 한 번만, 예산 한도', () => {
  const gs = Array.from({ length: 8 }, (_, i) => g(2.5, 0.38 + i * 0.002)); // EV 0.95~0.985
  const out = planBotBets(gs, { now: NOW });
  assert.equal(out.length, BOT_POLICY.budget / BOT_POLICY.unit); // 5장
  assert.ok(out.every((s) => s.stake === 20000 && s.legs.length === 1));
  const ids = out.flatMap((s) => s.legs.map((l) => l.game_id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(out[0].ev >= out[4].ev);
});

test('planBotBets: 이미 쓴 예산·이미 산 경기 반영', () => {
  const gs = [g(2.5, 0.4), g(2.5, 0.39), g(2.5, 0.385)];
  assert.equal(planBotBets(gs, { now: NOW, spent: 100000 }).length, 0);
  const out = planBotBets(gs, { now: NOW, spent: 80000, usedKeys: [matchKeyOf(gs[0])] });
  assert.equal(out.length, 1);
  assert.equal(out[0].legs[0].game_id, gs[1].id);
});

test('planBotBets: 이미 산 경기는 킥오프 문자열 형식이 달라도 다시 사지 않는다 (DB +00:00 vs 수집값 Z)', () => {
  const a = g(2.5, 0.4, { game_ts: '2026-11-25T18:15:00.000Z' }), b = g(2.5, 0.39);
  const out = planBotBets([a, b], { now: NOW, spent: 80000, usedKeys: [matchKeyOf({ ...a, game_ts: '2026-11-25T18:15:00+00:00' })] });
  assert.equal(out.length, 1);
  assert.equal(out[0].legs[0].game_id, b.id);
});

test('planBotBets: 낮은 배당 둘은 2폴로 묶어 범위에 넣고, 조합 EV = 배당 곱(첫째 자리로 올림) × 확률 곱', () => {
  const a = g(1.5, 0.66), b = g(1.6, 0.62); // 단폴은 1.8 미만이라 제외, 2폴 2.40 · EV 0.982
  const out = planBotBets([a, b], { now: NOW });
  assert.equal(out.length, 1);
  assert.equal(out[0].legs.length, 2);
  assert.equal(out[0].total_odds, 2.4);
  assert.ok(Math.abs(out[0].ev - 2.4 * 0.66 * 0.62) < 1e-9);
});

test('planBotBets: 레그 EV가 하한(minEv) 미만이어도 짝 레그가 1을 넘으면 2폴 성립', () => {
  const a = g(1.45, 0.62), b = g(1.4, 0.76); // 0.899 × 1.064 → 2.03 · EV 0.956
  const out = planBotBets([a, b], { now: NOW });
  assert.equal(out.length, 1);
  assert.equal(out[0].legs.length, 2);
});
