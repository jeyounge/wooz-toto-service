import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devig, crowdShares, externalProbs, predictGame, isHit } from '../src/lib/proto/predict.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('devig: 3-way 합 1, 미발매(0) 선택지는 0', () => {
  const p = devig([2.0, 3.5, 3.5]);
  close(p[0] + p[1] + p[2], 1);
  const q = devig([1.8, 0, 1.8]);
  assert.equal(q[1], 0); close(q[0], 0.5);
});

test('crowdShares: 건수 → 비중, 누락이면 null', () => {
  const s = crowdShares([60, 20, 20]); close(s[0], 0.6);
  assert.equal(crowdShares([1, null, 2]), null);
});

test('1골 핸디: 홈 -1 패 = 홈 못 이김(무+원정), 홈 +1 승 = 홈 안 짐 — 해외 승무패만으로 정확', () => {
  const ext = { p1x2: [0.626, 0.22, 0.154] };
  const m1 = externalProbs({ bet_type_id: '4', handi: -1 }, ext, [0.5, 0.25, 0.25]);
  close(m1.p[2], 0.374);
  const p1 = externalProbs({ bet_type_id: '4', handi: 1 }, ext, [0.5, 0.25, 0.25]);
  close(p1.p[0], 0.846);
});

test('스프레드 ±1.5가 있으면 2골 차 확률을 그대로 쓴다 (라치오 -1.5 → 40.3%)', () => {
  const ext = { p1x2: [0.626, 0.22, 0.154], spread: { line: -1.5, pHome: 0.403 } };
  const r = externalProbs({ bet_type_id: '4', handi: -1 }, ext, [0.5, 0.25, 0.25]);
  assert.equal(r.source, 'espn_spread');
  close(r.p[0], 0.403); close(r.p[1], 0.223); close(r.p[2], 0.374);
});

test('predictGame: 최고확률 픽 + 국내과열 플래그 (구매 비중 - 확률 ≥ 15%p)', () => {
  const g = { bet_type_id: '1', handi: 0, odds_w: 1.61, odds_d: 3.55, odds_l: 3.85, bets_w: 76, bets_d: 17, bets_l: 7 };
  const p = predictGame(g, { p1x2: [0.55, 0.25, 0.20] });
  assert.equal(p.pick_idx, 0);
  assert.equal(p.prob_source, 'espn');
  assert.ok(p.flags.includes('국내과열'));
  assert.ok(p.flags.includes('해외배당'));
});

test('predictGame: 가치 픽은 확률 20% 이상 중 국내배당×확률 최고', () => {
  const g = { bet_type_id: '1', handi: 0, odds_w: 1.28, odds_d: 4.4, odds_l: 6.5, bets_w: null, bets_d: null, bets_l: null };
  const p = predictGame(g, { p1x2: [0.626, 0.22, 0.154] });
  assert.equal(p.value_idx, 1); // 패(15%)는 20% 미만이라 제외, 무 EV 0.968
  close(p.value_ev, 0.968, 2e-3);
  assert.equal(p.crowd_share, null);
});

test('predictGame: 발매 전(배당 0)은 null', () => {
  assert.equal(predictGame({ bet_type_id: '1', odds_w: 0, odds_d: 0, odds_l: 0 }), null);
});

test('nameSim: 한글 정식명 ↔ ESPN 영문명 — 같은 시각 챔피언십 경기를 이름으로 구분', async () => {
  const { nameSim } = await import('../src/lib/proto/espn.js');
  // 실제 138회차에서 배당만으로 오매칭됐던 같은 시각 그룹
  const groups = [
    [['링컨 시티', 'Lincoln City'], ['스토크 시티', 'Stoke City'], ['미들즈브러', 'Middlesbrough'], ['울버햄튼 원더러스', 'Wolverhampton Wanderers'], ['볼턴 원더러스', 'Bolton Wanderers'], ['셰필드 유나이티드', 'Sheffield United']],
    [['릴OSC', 'Lille'], ['RC스트라스부르', 'Strasbourg'], ['AS모나코', 'AS Monaco'], ['RC랑스', 'Lens']],
  ];
  for (const pairs of groups) for (const [ko, en] of pairs) {
    const self = nameSim(ko, en);
    for (const [, other] of pairs.filter(([k]) => k !== ko)) assert.ok(self > nameSim(ko, other), `${ko}: ${en}(${self.toFixed(2)}) > ${other}(${nameSim(ko, other).toFixed(2)})`);
  }
});

test('isHit: 특례(4)·미정은 null', () => {
  assert.equal(isHit(4, 0), null);
  assert.equal(isHit(null, 0), null);
  assert.equal(isHit(2, 2), true);
  assert.equal(isHit(1, 0), false);
});
