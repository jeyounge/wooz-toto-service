import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harmonizePicks, outcomeHolds } from '../src/lib/proto/consistency.js';
import { predictGame } from '../src/lib/proto/predict.js';
import { planBotBets, buyWindow } from '../src/lib/proto/bot.js';

const T = '2026-11-27T08:40:00+00:00';
const row = (bet_type_id, handi, odds, extra = {}) => ({ home: 'MAC', away: 'MEL', game_ts: T, sport_code: 'SC', bet_type_id, handi, odds_w: odds[0], odds_d: odds[1], odds_l: odds[2], ...extra });
const withP = (g, p) => ({ g, p: { pick_idx: [0, 1, 2].reduce((b, i) => (p[i] > p[b] ? i : b), 0), p_w: p[0], p_d: p[1], p_l: p[2], flags: [] } });

test('outcomeHolds: 홈 +1 핸디 승 = 홈 안 짐, 무 = 홈 1점 차 패, 패 = 2점 차 이상 패', () => {
  const w = outcomeHolds('4', 1, 0), d = outcomeHolds('4', 1, 1), l = outcomeHolds('4', 1, 2);
  assert.deepEqual([0, -1, -2].map(w), [true, false, false]);
  assert.deepEqual([0, -1, -2].map(d), [false, true, false]);
  assert.deepEqual([0, -1, -2].map(l), [false, false, true]);
});

test('harmonizePicks: 승무패 패(원정승) + 홈 +1 핸디 승(홈 안 짐) 모순 → 핸디는 원정승과 맞는 무/패 중 확률 높은 쪽', () => {
  // 실제 260141 맥아서FC-멜버른 시티 확률
  const items = [withP(row('1', 0, [2.7, 3.25, 2.06]), [0.3374, 0.2519, 0.4107]), withP(row('4', 1, [1.59, 3.6, 3.9]), [0.5893, 0.2136, 0.1971])];
  assert.equal(items[1].p.pick_idx, 0); // 조정 전: 모순
  const out = harmonizePicks(items);
  assert.equal(out[0].p.pick_idx, 2);
  assert.equal(out[1].p.pick_idx, 1);
  assert.equal(out[1].p.pick_prob, 0.2136);
  assert.ok(out[1].p.flags.includes('일관성조정'));
  assert.equal(items[1].p.pick_idx, 0); // 입력은 안 바꾼다
});

test('harmonizePicks: 이미 맞는 픽은 그대로, 여러 핸디는 점수차 집합을 좁혀 가며 맞춘다', () => {
  // 홈 승 앵커 · -1 핸디 승(2점 차+) · -2 핸디: 2점 차+와 맞는 건 승(3+)·무(정확히 2) → 확률 높은 무
  const items = [
    withP(row('1', 0, [1.31, 4.45, 5.7]), [0.676, 0.1792, 0.1448]),
    withP(row('4', -1, [1.96, 3.45, 2.75]), [0.4754, 0.2006, 0.324]),
    withP(row('4', -2, [3.25, 3.95, 1.66]), [0.2645, 0.2176, 0.5179]),
  ];
  const out = harmonizePicks(items);
  assert.equal(out[1].p.pick_idx, 0);
  assert.ok(!out[1].p.flags.includes('일관성조정'));
  assert.equal(out[2].p.pick_idx, 0); // 승 0.2645 > 무 0.2176
});

test('harmonizePicks: 전반 마켓·언더오버·다른 경기는 건드리지 않는다', () => {
  const items = [
    withP(row('1', 0, [2.7, 3.25, 2.06]), [0.3374, 0.2519, 0.4107]),
    withP(row('4', 1, [1.59, 3.6, 3.9], { bet_name: '전반 핸디캡' }), [0.5893, 0.2136, 0.1971]),
    withP(row('7', 2.5, [2.18, 0, 1.45]), [0.4, 0, 0.6]),
    withP(row('4', 1, [1.59, 3.6, 3.9], { home: 'X' }), [0.5893, 0.2136, 0.1971]),
  ];
  const out = harmonizePicks(items);
  assert.deepEqual(out.map((x) => x.p.pick_idx), [2, 0, 2, 0]);
});

test('harmonizePicks: predictGame 결과와 함께 써도 동작 (축구 승무패 + 정수핸디)', () => {
  const a = row('1', 0, [2.7, 3.25, 2.06]), b = row('4', 1, [1.59, 3.6, 3.9]);
  const out = harmonizePicks([{ g: a, p: predictGame(a) }, { g: b, p: predictGame(b) }]);
  const ok = [0, 1, 2].filter((i) => [...Array(41).keys()].map((m) => m - 20).some((m) => outcomeHolds('1', 0, out[0].p.pick_idx)(m) && outcomeHolds('4', 1, out[1].p.pick_idx)(m)));
  assert.ok(ok.length > 0);
});

const kst = (s) => Date.parse(`${s}+09:00`);
test('buyWindow: 06~23시만 구매, 22시는 마감 소진', () => {
  assert.deepEqual(buyWindow(kst('2026-11-27T22:30:00')), { open: true, lastCall: true });
  assert.deepEqual(buyWindow(kst('2026-11-27T23:00:00')), { open: false, lastCall: false });
  assert.deepEqual(buyWindow(kst('2026-11-28T03:00:00')), { open: false, lastCall: false });
  assert.deepEqual(buyWindow(kst('2026-11-28T06:00:00')), { open: true, lastCall: false });
});

let seq = 0;
const g = (odds, prob, now, h = 5, extra = {}) => ({
  id: ++seq, home: `H${seq}`, away: `A${seq}`, game_ts: new Date(now + h * 3600e3).toISOString(), result_idx: null,
  odds_w: odds, odds_d: 0, odds_l: 1.2, pred: { prob_source: 'espn', p_w: prob, p_d: 0, p_l: 1 - prob }, ...extra,
});

test('planBotBets v4: 23시 이후엔 안 사고, 22시엔 EV 0.80까지 낮춰 상한을 채운다', () => {
  const night = kst('2026-11-27T23:30:00'), eve = kst('2026-11-27T20:00:00'), last = kst('2026-11-27T22:10:00');
  const mk = (now) => [g(1.5, 0.6, now), g(1.65, 0.56, now)]; // 2.5 · 33.6% · EV 0.84
  const closed = planBotBets(mk(night), { now: night });
  assert.equal(closed.closed, true); assert.equal(closed.bets.length, 0);
  assert.equal(planBotBets(mk(eve), { now: eve }).bets.length, 0);
  const lc = planBotBets(mk(last), { now: last });
  assert.equal(lc.lastCall, true); assert.equal(lc.bets.length, 1);
  assert.ok(lc.bets[0].reason.includes('마감 소진'));
});

test('planBotBets v4: 무(확률 22~30%)도 레그 후보, 무 포함 슬립은 배당 5.0까지', () => {
  const now = kst('2026-11-27T12:00:00');
  const draw = g(0, 0, now, 5, { odds_w: 2.4, odds_d: 3.4, odds_l: 3.0, bet_type_id: '1', pred: { prob_source: 'espn', p_w: 0.38, p_d: 0.29, p_l: 0.33 } });
  const fav = g(1.4, 0.72, now);
  const out = planBotBets([draw, fav], { now });
  assert.equal(out.bets.length, 1);
  const leg = out.bets[0].legs.find((l) => l.game_id === draw.id);
  assert.equal(leg.pick_idx, 1);
  assert.ok(out.bets[0].total_odds > 3.5 && out.bets[0].total_odds <= 5.0);
  assert.ok(out.bets[0].reason.includes('무 포함'));
});

test('planBotBets v4: 마감 소진 때 press 모드로 못 채우면 기본 모드 범위로 한 번 더', () => {
  const last = kst('2026-11-27T22:10:00');
  const done = { home: 'x', away: 'y', game_ts: new Date(last - 3 * 3600e3).toISOString(), result_idx: 0 };
  const prev = [{ stake: 10000, total_odds: 2.5, legs: [{ pick_idx: 0, odds: 1.6, game: done }] }]; // 적중 → press
  const gs2 = [g(1.7, 0.56, last), g(1.75, 0.55, last)]; // 3.0 · 30.8% · EV 0.92: press 배당 2.6 초과, 기본은 통과
  const out = planBotBets(gs2, { now: last, prevBets: prev });
  assert.equal(out.mode, 'press');
  assert.equal(out.bets.length, 1);
  assert.ok(out.bets[0].reason.includes('기본'));
  const day = kst('2026-11-27T15:00:00');
  assert.equal(planBotBets([g(1.7, 0.56, day), g(1.75, 0.55, day)], { now: day, prevBets: prev }).bets.length, 0); // 평소엔 press 그대로
});
