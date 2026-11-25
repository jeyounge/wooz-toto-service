import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normCdf, normInv, basketballProbs, externalProbs, predictGame } from '../src/lib/proto/predict.js';
import { comboCandidates, recommendCombos } from '../src/lib/proto/combos.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('normCdf / normInv: 왕복과 대표값', () => {
  close(normCdf(0), 0.5); close(normCdf(1.96), 0.975);
  for (const p of [0.05, 0.3, 0.5, 0.77, 0.99]) close(normCdf(normInv(p)), p, 1e-5);
});

test('농구 핸디: 베트맨 기준점이 해외 라인과 같으면 해외 확률 그대로, 멀어지면 단조', () => {
  const ext = { pML: [0.7, 0.3], spread: { line: -5.5, pHome: 0.5 } };
  const same = basketballProbs({ bet_type_id: '5', handi: -5.5 }, ext);
  close(same.p[0], 0.5); assert.equal(same.source, 'espn_line');
  const easier = basketballProbs({ bet_type_id: '5', handi: -2.5 }, ext);
  const harder = basketballProbs({ bet_type_id: '5', handi: -8.5 }, ext);
  assert.ok(easier.p[0] > 0.5 && harder.p[0] < 0.5);
  close(easier.p[0], normCdf(3 / 12));
});

test('농구 언오버: 0 = 언더, 2 = 오버, 해외 토탈과 같은 기준점이면 해외 확률', () => {
  const ext = { pML: [0.5, 0.5], total: { line: 220.5, pOver: 0.5 } };
  const r = basketballProbs({ bet_type_id: '7', handi: 220.5 }, ext);
  close(r.p[0], 0.5);
  const low = basketballProbs({ bet_type_id: '7', handi: 210.5 }, ext);
  assert.ok(low.p[2] > 0.65); // 기준점이 낮으면 오버 쪽
});

test('externalProbs: 승패(pML) 해외 정보는 농구에서만 핸디·언오버로 확장, 축구 승무패 경로는 그대로', () => {
  const ext = { pML: [0.6, 0.4], spread: { line: -3.5, pHome: 0.52 } };
  assert.equal(externalProbs({ bet_type_id: '5', handi: -3.5, sport_code: 'BK' }, ext, [0.5, 0, 0.5]).source, 'espn_line');
  assert.equal(externalProbs({ bet_type_id: '5', handi: -3.5, sport_code: 'VL' }, ext, [0.5, 0, 0.5]), null);
  // 해외 라인 확률이 생기면 가치 판단이 가능해진다 (국내 디빅이면 모든 EV = 환급률)
  const g = { bet_type_id: '5', handi: -2.5, sport_code: 'BK', odds_w: 1.9, odds_d: 0, odds_l: 1.65 };
  const p = predictGame(g, ext);
  assert.equal(p.prob_source, 'espn_line');
  assert.ok(p.value_ev > 1);
});

const game = (id, home, ev, prob, extra = {}) => ({
  id, home, away: `${home}B`, game_ts: '2099-01-01T00:00:00Z', result_idx: null,
  odds_w: ev / prob, odds_d: 0, odds_l: 1.5,
  pred: { prob_source: 'espn', p_w: prob, p_d: 0, p_l: 1 - prob }, ...extra,
});

test('comboCandidates: 해외 확률 · 킥오프 전 · EV 기준 · 경기당 1개', () => {
  const gs = [
    game(1, 'A', 1.08, 0.55),
    game(2, 'B', 1.04, 0.6),
    game(3, 'C', 0.98, 0.6),                                   // EV 미달
    game(4, 'D', 1.10, 0.5, { pred: { prob_source: 'domestic', p_w: 0.5, p_d: 0, p_l: 0.5 } }), // 국내 디빅
    game(5, 'E', 1.10, 0.5, { game_ts: '2000-01-01T00:00:00Z' }), // 이미 시작
    game(6, 'A', 1.05, 0.5, { id: 6 }),                        // A 경기 다른 마켓 → 더 낮은 EV라 제외
  ];
  gs[5].away = 'AB';
  const c = comboCandidates(gs, { now: Date.parse('2026-01-01') });
  assert.deepEqual(c.map((x) => x.game.id), [1, 2]);
});

test('recommendCombos: 2폴 기대 회수율 = 배당 곱(절사) × 확률 곱', () => {
  const gs = [game(1, 'A', 1.08, 0.55), game(2, 'B', 1.04, 0.6), game(3, 'C', 1.03, 0.7)];
  const r = recommendCombos(gs, { now: Date.parse('2026-01-01') });
  assert.equal(r.pairs.length, 3); assert.equal(r.triples.length, 1);
  const top = r.pairs[0];
  close(top.ev, top.odds * top.prob, 1e-9);
  assert.deepEqual(top.legs.map((l) => l.game.id).sort(), [1, 2]);
});
