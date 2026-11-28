import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBotBets, isWeekendBuy, isOfflineBet, matchKeyOf, BOT_POLICY } from '../src/lib/proto/bot.js';

// v5 (2026-11-28): 금·토·일은 온라인 10만원 + 오프라인 10만원(배당·금액 올림)
const kst = (s) => Date.parse(`${s}+09:00`);
const THU = kst('2026-11-26T15:00:00'), SAT = kst('2026-11-28T18:40:00'), SUN = kst('2026-11-29T12:00:00');
let seq = 0;
const g = (odds, prob, now, extra = {}) => ({
  id: ++seq, home: `H${seq}`, away: `A${seq}`, game_ts: new Date(now + 5 * 3600e3).toISOString(), result_idx: null,
  odds_w: odds, odds_d: 0, odds_l: 1.2, pred: { prob_source: 'espn', p_w: prob, p_d: 0, p_l: 1 - prob }, ...extra,
});
// 2폴 3.6 · 확률 26% · EV 0.94 (온라인 기본 3.5 초과 → 오프라인 칸만 살 수 있음)
const longPair = (now) => [g(1.9, 0.51, now), g(1.9, 0.51, now)];

test('isWeekendBuy: KST 금·토·일만', () => {
  assert.equal(isWeekendBuy(THU), false);
  assert.equal(isWeekendBuy(kst('2026-11-27T06:00:00')), true);  // 금
  assert.equal(isWeekendBuy(SAT), true);
  assert.equal(isWeekendBuy(SUN), true);
  assert.equal(isWeekendBuy(kst('2026-11-30T00:30:00')), false); // 월 새벽
});

test('주중엔 오프라인 칸이 없다', () => {
  const out = planBotBets(longPair(THU), { now: THU });
  assert.equal(out.weekend, false);
  assert.equal(out.offline.cap, 0);
  assert.equal(out.bets.length, 0);
});

test('주말: 배당 3~6 슬립을 3만원 오프라인 구매로 산다', () => {
  const out = planBotBets(longPair(SAT), { now: SAT });
  assert.equal(out.weekend, true);
  assert.equal(out.offline.cap, 100000);
  assert.equal(out.bets.length, 1);
  const b = out.bets[0];
  assert.ok(isOfflineBet(b));
  assert.ok(b.reason.startsWith('오프라인 구매 · '));
  assert.equal(b.stake, BOT_POLICY.weekend.stake);
  assert.ok(b.total_odds >= 3 && b.total_odds <= 6);
  assert.equal(out.offline.spent, 30000);
});

test('오프라인 칸 예산은 온라인과 따로: 온라인 10만원을 다 써도 오프라인은 산다, 오프라인 10만원은 못 넘는다', () => {
  const done = (i) => ({ home: `p${i}`, away: `q${i}`, game_ts: new Date(SAT - 3600e3).toISOString(), result_idx: null });
  const online = [0, 1, 2, 3, 4].map((i) => ({ stake: 20000, total_odds: 2.5, reason: '기본 · 2폴', legs: [{ pick_idx: 0, odds: 1.6, game: done(i) }] }));
  const offline = [5, 6, 7].map((i) => ({ stake: 30000, total_odds: 4, reason: '오프라인 구매 · 주말 고배당 · 2폴', legs: [{ pick_idx: 0, odds: 2, game: done(i) }] }));
  const gs = [...longPair(SAT), ...longPair(SAT), g(1.6, 0.62, SAT), g(1.55, 0.64, SAT)];
  const a = planBotBets(gs, { now: SAT, prevBets: online });
  assert.equal(a.spent, 100000);
  assert.ok(a.bets.length >= 1 && a.bets.every(isOfflineBet));       // 온라인은 꽉 참 → 오프라인만
  const b = planBotBets(gs, { now: SAT, prevBets: [...online, ...offline] });
  assert.equal(b.offline.spent, 100000);
  assert.equal(b.bets.reduce((s, x) => s + x.stake, 0), 10000);       // 남은 1만원만
  assert.ok(b.bets.every(isOfflineBet));
});

test('온라인 칸 모드·국내포함 칸은 오프라인 슬립 결과로 바뀌지 않는다', () => {
  const lost = { stake: 30000, total_odds: 4, reason: '오프라인 구매 · 주말 고배당 · 2폴', legs: [{ pick_idx: 0, odds: 2, game: { home: 'x', away: 'y', game_ts: new Date(SAT - 3 * 3600e3).toISOString(), result_idx: 2 } }] };
  assert.equal(planBotBets([], { now: SAT, prevBets: [lost] }).mode, 'normal');
});

test('두 칸이 같은 경기를 두 번 사지 않고, 오프라인 칸은 국내 레그를 쓰지 않는다', () => {
  const dom = { prob_source: 'domestic', p_w: 0.5, p_d: 0, p_l: 0.5 };
  const gs = [...longPair(SAT), ...longPair(SAT), g(1.5, 0.66, SAT), g(1.6, 0.62, SAT), g(1.9, 0.5, SAT, { odds_l: 1.9, pred: dom }), g(1.9, 0.5, SAT, { odds_l: 1.9, pred: dom })];
  const cal = [{ lo: 1, hi: 99, factor: 1 }];
  const out = planBotBets(gs, { now: SAT, domesticCal: cal });
  const keys = out.bets.flatMap((b) => b.legs.map((l) => matchKeyOf(gs.find((x) => x.id === l.game_id))));
  assert.equal(new Set(keys).size, keys.length);
  const domIds = new Set(gs.filter((x) => x.pred.prob_source === 'domestic').map((x) => x.id));
  for (const b of out.bets.filter(isOfflineBet)) assert.ok(b.legs.every((l) => !domIds.has(l.game_id)));
  assert.ok(out.bets.some(isOfflineBet) && out.bets.some((b) => !isOfflineBet(b)));
});

test("pools: ['offline']이면 오프라인 칸만", () => {
  const gs = [...longPair(SAT), g(1.5, 0.66, SAT), g(1.6, 0.62, SAT)];
  const out = planBotBets(gs, { now: SAT, pools: ['offline'] });
  assert.ok(out.bets.length >= 1 && out.bets.every(isOfflineBet));
});
