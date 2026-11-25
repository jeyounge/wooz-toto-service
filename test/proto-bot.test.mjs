import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBotBets, botMode, spendCap, matchKeyOf, BOT_POLICY } from '../src/lib/proto/bot.js';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const inH = (h) => new Date(NOW + h * 3600e3).toISOString();
let seq = 0;
/** 승(0) 선택지가 odds·prob, 패(2)는 EV가 낮게 */
const g = (odds, prob, extra = {}) => ({
  id: ++seq, home: `H${seq}`, away: `A${seq}`, game_ts: inH(5), result_idx: null,
  odds_w: odds, odds_d: 0, odds_l: 1.2,
  pred: { prob_source: 'espn', p_w: prob, p_d: 0, p_l: 1 - prob }, ...extra,
});
/** 이미 산 슬립 (결과 포함) */
const prev = (stake, legs) => ({ stake, total_odds: 2.5, legs: legs.map(([game, result_idx]) => ({ pick_idx: 0, odds: 1.6, game: { ...game, result_idx } })) });

test('spendCap: 지금+24시간 안에 시작하는 게임 비율만큼 예산을 만원 단위로 푼다', () => {
  const gs = [g(2, 0.5), g(2, 0.5, { game_ts: inH(30) }), g(2, 0.5, { game_ts: inH(50) })];
  assert.equal(spendCap(gs, { now: NOW }), 30000); // 1/3 → 33,333 → 30,000
  assert.equal(spendCap(gs, { now: NOW + 48 * 3600e3 }), 100000);
});

test('botMode: 직전(마지막 레그가 가장 늦은) 확정 슬립이 적중이면 press, 낙첨이면 safe, 없으면 normal', () => {
  const a = { home: 'a', away: 'b', game_ts: inH(1) }, b = { home: 'c', away: 'd', game_ts: inH(3) };
  assert.equal(botMode([]), 'normal');
  assert.equal(botMode([prev(20000, [[a, null]])]), 'normal');                     // 대기만
  assert.equal(botMode([prev(20000, [[a, 2]]), prev(20000, [[b, 0]])]), 'press');  // 늦게 끝난 b 적중
  assert.equal(botMode([prev(20000, [[a, 0]]), prev(20000, [[b, 2]])]), 'safe');
});

test('planBotBets: 단폴은 사지 않는다 — 단폴 EV가 높아도 2폴 이상만', () => {
  const out = planBotBets([g(2.6, 0.4)], { now: NOW }); // 레그 1개뿐 → 조합 불가
  assert.equal(out.bets.length, 0);
});

test('planBotBets: EV 기준 미달·국내 디빅·24시간 밖·이미 시작은 후보가 아니다', () => {
  const gs = [
    g(1.5, 0.5), g(1.6, 0.5),                                                     // 2.4 · 25% · EV 0.6
    g(1.5, 0.66, { pred: { prob_source: 'domestic', p_w: 0.66, p_d: 0, p_l: 0.34 } }),
    g(1.6, 0.62, { game_ts: inH(30) }),
    g(1.6, 0.62, { game_ts: inH(-1) }),
  ];
  assert.equal(planBotBets(gs, { now: NOW }).bets.length, 0);
});

test('planBotBets: 2폴 · 조합 배당은 첫째 자리 올림, 기본 모드 2만원', () => {
  const a = g(1.5, 0.66), b = g(1.6, 0.62); // 2.4 · 확률 40.9% · EV 0.982
  const out = planBotBets([a, b], { now: NOW });
  assert.equal(out.mode, 'normal');
  assert.equal(out.bets.length, 1);
  assert.equal(out.bets[0].legs.length, 2);
  assert.equal(out.bets[0].total_odds, 2.4);
  assert.equal(out.bets[0].stake, 20000);
  assert.ok(Math.abs(out.bets[0].ev - 2.4 * 0.66 * 0.62) < 1e-9);
});

test('planBotBets: 나눠 쓰기 상한을 넘지 않고, 경기는 한 번만', () => {
  const near = Array.from({ length: 6 }, () => g(1.55, 0.64));                     // 2폴 2.5 · EV 1.02
  const far = Array.from({ length: 6 }, () => g(1.55, 0.64, { game_ts: inH(40) }));
  const out = planBotBets([...near, ...far], { now: NOW });                       // 상한 5만
  assert.equal(out.cap, 50000);
  assert.equal(out.bets.reduce((a, b) => a + b.stake, 0), 50000);                // 2만 + 2만 + 1만
  assert.equal(out.bets.at(-1).stake, 10000);
  const ids = out.bets.flatMap((s) => s.legs.map((l) => l.game_id));
  assert.equal(new Set(ids).size, ids.length);
});

test('planBotBets: 적중 후엔 저배당(≤2.6)에 3만원, 낙첨 후엔 확률 42% 이상만', () => {
  const done = { home: 'x', away: 'y', game_ts: inH(-3) };
  const legs = [g(1.4, 0.75), g(1.45, 0.72), g(1.9, 0.5), g(1.95, 0.49)];
  const won = planBotBets(legs, { now: NOW, prevBets: [prev(20000, [[done, 0]])] });
  assert.equal(won.mode, 'press');
  assert.ok(won.bets.length >= 1 && won.bets.every((s) => s.stake === 30000 && s.total_odds <= 2.6));
  const lost = planBotBets(legs, { now: NOW, prevBets: [prev(20000, [[done, 2]])] });
  assert.equal(lost.mode, 'safe');
  assert.ok(lost.bets.length >= 1 && lost.bets.every((s) => s.model_prob >= 0.42 && s.stake === 20000));
});

test('planBotBets: 이미 산 경기는 킥오프 문자열 형식이 달라도 다시 사지 않는다 (DB +00:00 vs 수집값 Z)', () => {
  const a = g(1.5, 0.66, { game_ts: '2026-11-25T18:15:00.000Z' }), b = g(1.6, 0.62), c = g(1.6, 0.62);
  const bought = prev(20000, [[{ ...a, game_ts: '2026-11-25T18:15:00+00:00' }, null]]);
  const out = planBotBets([a, b, c], { now: NOW, prevBets: [bought] });
  assert.ok(out.bets.length >= 1);
  assert.ok(out.bets.every((s) => s.legs.every((l) => l.game_id !== a.id)));
  assert.equal(matchKeyOf({ home: 'h', away: 'a', game_ts: '2026-11-25T18:15:00+00:00' }), matchKeyOf({ home: 'h', away: 'a', game_ts: '2026-11-25T18:15:00.000Z' }));
});

test('planBotBets: 킥오프 30분 안쪽 게임은 발매 마감 여유가 없어 사지 않는다', () => {
  const soon = g(1.5, 0.66, { game_ts: inH(0.25) }), b = g(1.6, 0.62), c = g(1.6, 0.62);
  const out = planBotBets([soon, b, c], { now: NOW });
  assert.equal(out.bets.length, 1);
  assert.ok(out.bets[0].legs.every((l) => l.game_id !== soon.id));
});

test('planBotBets: 예산 소진 후엔 사지 않는다', () => {
  const gs = [g(1.5, 0.66), g(1.6, 0.62)];
  const spentAll = Array.from({ length: 5 }, (_, i) => prev(20000, [[{ home: `p${i}`, away: 'q', game_ts: inH(1) }, null]]));
  assert.equal(planBotBets(gs, { now: NOW, prevBets: spentAll }).bets.length, 0);
  assert.equal(BOT_POLICY.budget, 100000);
});
