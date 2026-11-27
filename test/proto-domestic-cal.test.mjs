import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDomesticCal, calibrateDomestic, DOM_CAL_K } from '../src/lib/proto/domesticCal.js';
import { planBotBets } from '../src/lib/proto/bot.js';

const game = (w, l, result_idx) => ({ odds_w: w, odds_d: 0, odds_l: l, result_idx });

test('buildDomesticCal: 표본 없으면 계수 1, 정배가 디빅보다 자주 맞으면 정배 구간 계수 > 1 (K로 수축)', () => {
  assert.ok(buildDomesticCal([]).every((b) => b.factor === 1));
  const rows = Array.from({ length: 400 }, (_, i) => game(1.2, 4.5, i % 10 === 0 ? 2 : 0)); // 정배 90% 적중
  const cal = buildDomesticCal(rows);
  const fav = cal.find((b) => b.lo === 1), dog = cal.find((b) => b.lo === 4);
  const imp = 400 * (1 / 1.2) / (1 / 1.2 + 1 / 4.5);
  assert.equal(fav.n, 400); assert.equal(fav.hit, 360);
  assert.ok(Math.abs(fav.factor - (360 + DOM_CAL_K) / (imp + DOM_CAL_K)) < 1e-9);
  assert.ok(fav.factor > 1 && dog.factor < 1);
  assert.equal(cal.find((b) => b.lo === 1.9).factor, 1); // 표본 없는 구간
});

test('buildDomesticCal: 적중특례(4)·미확정·한 선택지만 발매는 제외', () => {
  const cal = buildDomesticCal([game(1.8, 1.8, 4), game(1.8, 1.8, null), game(1.8, 0, 0)]);
  assert.ok(cal.every((b) => b.n === 0));
});

test('calibrateDomestic: 같은 구간 두 선택지(홀짝 1.8/1.8)는 보정해도 50:50, 합은 1', () => {
  const rows = Array.from({ length: 200 }, (_, i) => game(1.8, 1.8, i % 3 ? 0 : 2));
  const p = calibrateDomestic([1.8, 0, 1.8], buildDomesticCal(rows));
  assert.ok(Math.abs(p[0] - 0.5) < 1e-9 && p[1] === 0 && Math.abs(p[2] - 0.5) < 1e-9);
  const q = calibrateDomestic([1.31, 0, 2.59], buildDomesticCal(Array.from({ length: 400 }, () => game(1.2, 4.5, 0))));
  assert.ok(Math.abs(q[0] + q[2] - 1) < 1e-9);
});

const NOW = Date.parse('2026-11-27T00:00:00Z');
let seq = 0;
const dg = (w, l, h = 3) => ({
  id: ++seq, home: `H${seq}`, away: `A${seq}`, game_ts: new Date(NOW + h * 3600e3).toISOString(), result_idx: null,
  odds_w: w, odds_d: 0, odds_l: l, pred: { prob_source: 'domestic', p_w: 0.5, p_d: 0, p_l: 0.5 },
});
const flatCal = buildDomesticCal([]);

test('planBotBets v3: 국내배당 게임은 보정표 없으면 안 사고, 있으면 국내포함 슬립 1만원', () => {
  const gs = [dg(1.31, 2.59), dg(1.8, 1.8), dg(1.79, 1.69)];
  assert.equal(planBotBets(gs, { now: NOW }).bets.length, 0);
  const out = planBotBets(gs, { now: NOW, domesticCal: flatCal });
  assert.equal(out.bets.length, 1);
  const s = out.bets[0];
  assert.equal(s.stake, 10000);
  assert.ok(s.reason.startsWith('국내포함'));
  assert.ok(s.total_odds >= 2.0 && s.total_odds <= 3.5 && s.model_prob >= 0.28 && s.ev >= 0.78);
});

test('planBotBets: 국내포함 슬립은 회차 예산 40%(4만원, v4)까지만, 이미 산 국내포함 금액을 뺀다', () => {
  const gs = Array.from({ length: 12 }, (_, i) => (i % 2 ? dg(1.31, 2.59) : dg(1.8, 1.8)));
  const out = planBotBets(gs, { now: NOW, domesticCal: flatCal });
  assert.equal(out.bets.reduce((a, b) => a + b.stake, 0), 40000);
  const prev = [{ stake: 10000, reason: '국내포함 · 기본 · 2폴', legs: [] }];
  assert.equal(planBotBets(gs, { now: NOW, domesticCal: flatCal, prevBets: prev }).bets.length, 3);
});

test('planBotBets v3: onlyGameIds로 후보를 요청 경기로 한정', () => {
  const a = dg(1.31, 2.59), b = dg(1.8, 1.8), c = dg(1.3, 2.6), d = dg(1.8, 1.8);
  const out = planBotBets([a, b, c, d], { now: NOW, domesticCal: flatCal, onlyGameIds: new Set([c.id, d.id]) });
  assert.equal(out.bets.length, 1);
  assert.deepEqual(out.bets[0].legs.map((l) => l.game_id).sort(), [c.id, d.id].sort());
});

test('planBotBets v3: 국내 게임은 경기당 여러 마켓을 후보로 — 홀짝만으로 안 되면 다른 마켓(정배 승패)과 묶고, 같은 경기끼리는 안 묶는다', () => {
  const t = new Date(NOW + 3 * 3600e3).toISOString();
  const row = (home, away, w, l, h = t) => ({ ...dg(w, l), home, away, game_ts: h });
  const gs = [
    row('ARG', 'BAH', 1.8, 1.8), row('ARG', 'BAH', 1.79, 1.69),
    row('PAN', 'PUR', 1.8, 1.8), row('PAN', 'PUR', 2.59, 1.31),
  ];
  const out = planBotBets(gs, { now: NOW, domesticCal: flatCal });
  assert.equal(out.bets.length, 1);
  const legs = out.bets[0].legs.map((l) => gs.find((g) => g.id === l.game_id));
  assert.equal(new Set(legs.map((g) => g.home)).size, legs.length);
  assert.ok(legs.some((g) => g.odds_l === 1.31));
});
