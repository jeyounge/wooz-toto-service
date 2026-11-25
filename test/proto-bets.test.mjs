import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comboOdds, legResult, validateSlip, settleBet, summarizeBets, slipModel } from '../src/lib/proto/bets.js';
import { diagnose, payoutRate } from '../src/lib/proto/analysis.js';

const leg = (pick_idx, odds, result_idx) => ({ pick_idx, odds, game: { result_idx } });

test('comboOdds: 2폴 이상은 소수 둘째 자리에서 올림 → 첫째 자리(베트맨), 단폴 그대로, 최대 100배', () => {
  assert.equal(comboOdds([1.55, 1.83]), 2.9);  // 2.8365 → 2.9
  assert.equal(comboOdds([1.7, 2.6]), 4.5);    // 4.42 → 4.5
  assert.equal(comboOdds([1.5, 1.6]), 2.4);    // 딱 떨어지면 그대로 (부동소수 2.4000000000000004 → 2.5 아님)
  assert.equal(comboOdds([1.01, 1.01]), 1.1);  // 1.0201 → 1.1
  assert.equal(comboOdds([2.33]), 2.33);       // 단폴은 그대로
  assert.equal(comboOdds([1.11, 1.11, 1.11]), 1.4); // 1.367631 → 1.4
  assert.equal(comboOdds([10, 10, 2]), 100);
});

test('legResult: 미정/적중/오답/적중특례', () => {
  assert.equal(legResult(null, 0), 'pending');
  assert.equal(legResult(0, 0), 'hit');
  assert.equal(legResult(2, 0), 'miss');
  assert.equal(legResult(4, 1), 'void');
});

test('validateSlip: 금액 단위·같은 경기 다른 마켓 조합 금지', () => {
  const l = (id, k) => ({ game_id: id, match_key: k, pick_idx: 0, odds: 1.5 });
  assert.equal(validateSlip({ stake: 5000, legs: [l(1, 'a'), l(2, 'b')] }), null);
  assert.match(validateSlip({ stake: 5050, legs: [l(1, 'a')] }), /100원 단위/);
  assert.match(validateSlip({ stake: 5000, legs: [l(1, 'a'), l(2, 'a')] }), /같은 경기/);
});

test('settleBet: 한 레그라도 틀리면 낙첨, 대기 남으면 대기, 전부 맞으면 적중금 10원 절사', () => {
  assert.equal(settleBet({ stake: 1000, total_odds: 2.83, legs: [leg(0, 1.55, 0), leg(0, 1.83, 2)] }).status, 'lost');
  assert.equal(settleBet({ stake: 1000, total_odds: 2.83, legs: [leg(0, 1.55, 2), leg(0, 1.83, null)] }).payout, 0); // 낙첨이 대기보다 우선
  assert.equal(settleBet({ stake: 1000, total_odds: 2.83, legs: [leg(0, 1.55, 0), leg(0, 1.83, null)] }).status, 'pending');
  const w = settleBet({ stake: 1500, total_odds: 2.83, legs: [leg(0, 1.55, 0), leg(0, 1.83, 0)] });
  assert.equal(w.status, 'won'); assert.equal(w.payout, 4240); assert.equal(w.profit, 2740);
});

test('settleBet: 적중특례 레그는 배당 1.00으로 다시 계산, 실제 적중금 입력이 우선', () => {
  const v = settleBet({ stake: 1000, total_odds: 2.83, legs: [leg(0, 1.55, 0), leg(0, 1.83, 4)] });
  assert.equal(v.status, 'won'); assert.equal(v.effOdds, 1.55); assert.equal(v.payout, 1550);
  assert.equal(settleBet({ stake: 1000, total_odds: 2.83, payout_actual: 2800, legs: [leg(0, 1.55, 0), leg(0, 1.83, 0)] }).payout, 2800);
});

test('summarizeBets: 수익률·슬립/게임 적중률·회차·폴더별', () => {
  const bets = [
    { round_gm_ts: 260138, stake: 1000, total_odds: 2.83, model_prob: 0.4, legs: [leg(0, 1.55, 0), leg(0, 1.83, 0)] },
    { round_gm_ts: 260138, stake: 1000, total_odds: 2.0, model_prob: 0.5, legs: [leg(0, 2.0, 2)] },
    { round_gm_ts: 260139, stake: 1000, total_odds: 3.0, model_prob: 0.3, legs: [leg(0, 3.0, null)] },
  ];
  const s = summarizeBets(bets);
  assert.equal(s.total.settled, 2); assert.equal(s.total.pending, 1);
  assert.equal(s.total.stake, 2000); assert.equal(s.total.payout, 2830); assert.equal(s.total.profit, 830);
  assert.ok(Math.abs(s.total.roi - 0.415) < 1e-9);
  assert.equal(s.total.hitRate, 0.5); assert.equal(s.total.legHit, 2); assert.equal(s.total.legN, 3);
  assert.deepEqual(s.byLegs.map((x) => x.key), ['단폴', '2폴']);
  assert.equal(s.byRound[0].key, '260139');
});

test('slipModel: 레그 확률 곱 × 배당, 확률 없는 레그 있으면 null', () => {
  const m = slipModel([{ model_prob: 0.6 }, { model_prob: 0.5 }], 3.5);
  assert.ok(Math.abs(m.prob - 0.3) < 1e-9); assert.ok(Math.abs(m.ev - 1.05) < 1e-9);
  assert.equal(slipModel([{ model_prob: null }], 2).ev, null);
});

test('diagnose: 국내 디빅만 쓴 예측은 모든 선택지 기대값이 환급률로 같다', () => {
  const odds = [1.6, 3.6, 4.4];
  const r = payoutRate(odds);
  const inv = odds.map((o) => 1 / o); const s = inv.reduce((a, b) => a + b);
  const p = inv.map((x) => x / s);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(p[i] * odds[i] - r) < 1e-9);
  const g = { sport: '축구', bet_type_id: '1', odds_w: 1.6, odds_d: 3.6, odds_l: 4.4, result_idx: 0,
    pred: { p_w: p[0], p_d: p[1], p_l: p[2], pick_idx: 0, pick_prob: p[0], prob_source: 'domestic', value_idx: 0, value_ev: r, flags: [] } };
  const d = diagnose([g]);
  assert.equal(d.settled, 1);
  assert.equal(d.strategies.find((x) => x.name === '예측픽 전부').n, 1);
  assert.equal(d.strategies.find((x) => x.name.startsWith('가치픽 · 해외확률 · EV≥1.00')).n, 0);
});

test('contrarianIdx: 국내과열 픽이면 남은 선택지 중 확률 최고, 아니면 null', async () => {
  const { contrarianIdx } = await import('../src/lib/proto/analysis.js');
  const g = { odds_w: 1.4, odds_d: 4.2, odds_l: 6.5, pred: { pick_idx: 0, p_w: 0.62, p_d: 0.24, p_l: 0.14, flags: ['국내과열'] } };
  assert.equal(contrarianIdx(g), 1);
  assert.equal(contrarianIdx({ ...g, pred: { ...g.pred, flags: [] } }), null);
  assert.equal(contrarianIdx({ ...g, odds_d: 0, pred: { ...g.pred, p_d: 0 } }), 2); // 무 미발매
});

test('diagnose: 전략 수익률 표준오차 — 전부 적중이면 분산 0', () => {
  const g = (r) => ({ sport: '축구', bet_type_id: '2', odds_w: 2, odds_d: 0, odds_l: 2, result_idx: r,
    pred: { p_w: 0.5, p_d: 0, p_l: 0.5, pick_idx: 0, pick_prob: 0.5, prob_source: 'espn', flags: [] } });
  const s = diagnose([g(0), g(0)]).strategies.find((x) => x.name === '예측픽 전부');
  assert.equal(s.roi, 1); assert.equal(s.se, 0);
  const t = diagnose([g(0), g(2)]).strategies.find((x) => x.name === '예측픽 전부');
  assert.equal(t.roi, 0); assert.ok(Math.abs(t.se - Math.sqrt(1 / 2)) < 1e-9);
});
