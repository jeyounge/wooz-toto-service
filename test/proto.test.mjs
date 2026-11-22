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

test('roundSummary: 유형군(일반/핸디/언오버/홀짝)별 적중·대기, 특례 제외', async () => {
  const { roundSummary, betGroup } = await import('../src/lib/proto/accuracy.js');
  assert.equal(betGroup('1'), 'normal'); assert.equal(betGroup('13'), 'handi'); assert.equal(betGroup('7'), 'ou'); assert.equal(betGroup('9'), 'oe');
  const P = (pick, prob = 0.6) => ({ pick_idx: pick, pick_prob: prob });
  const s = roundSummary([
    { bet_type_id: '1', result_idx: 0, pred: P(0) },   // 일반 적중
    { bet_type_id: '2', result_idx: 2, pred: P(0) },   // 일반 실패
    { bet_type_id: '4', result_idx: 1, pred: P(1) },   // 핸디 적중
    { bet_type_id: '7', result_idx: null, pred: P(0) },// 언오버 대기
    { bet_type_id: '9', result_idx: 4, pred: P(0) },   // 홀짝 특례 → 제외
    { bet_type_id: '1', result_idx: 0, pred: null },   // 예측 없음 → 제외
  ]);
  assert.deepEqual([s.all.hit, s.all.settled, s.all.pending], [2, 3, 1]);
  assert.equal(s.normal.rate, 0.5); assert.equal(s.handi.rate, 1);
  assert.equal(s.ou.pending, 1); assert.equal(s.oe.settled, 0);
});

test('isHit: 특례(4)·미정은 null', () => {
  assert.equal(isHit(4, 0), null);
  assert.equal(isHit(null, 0), null);
  assert.equal(isHit(2, 2), true);
  assert.equal(isHit(1, 0), false);
});

test('retro: 실제 스코어 복원 — 전반전 마켓은 분리, 핸디 행은 핸디를 빼서', async () => {
  const { rawScoreOf, outcomeIdx } = await import('../src/lib/proto/retro.js');
  const rows = [
    { bet_type_id: '1', bet_name: '축구 승무패', result_score: '0:1' },
    { bet_type_id: '1', bet_name: '축구 전반 승무패', result_score: '0:0' },
  ];
  assert.deepEqual(rawScoreOf(rows), [0, 1]);
  assert.deepEqual(rawScoreOf(rows, true), [0, 0]);
  assert.deepEqual(rawScoreOf([{ bet_type_id: '4', handi: -2, result_score: '-1:4' }]), [1, 4]);
  // 베트맨 결과 재현 (138회차 실제 행)
  assert.equal(outcomeIdx('4', 2, 0, -2), 1);   // 본머스 2:0, -2 → 무
  assert.equal(outcomeIdx('5', 4, 0, -3.5), 0); // 레버쿠젠 4:0, -3.5 → 승
  assert.equal(outcomeIdx('7', 1, 4, 2.5), 2);  // 총점 5 > 2.5 → 오버
  assert.equal(outcomeIdx('9', 1, 4), 0);       // 5 홀
});

test('retro: 막판골·PK·내용 우세는 변수, 기준선 1골 이내는 근소, 나머지는 판단 실패', async () => {
  const { classifyPred, verdictOf } = await import('../src/lib/proto/retro.js');
  const base = { sport_code: 'SC', bet_type_id: '1', handi: 0, txt_w: '승', txt_d: '무', txt_l: '패' };
  // 세비야 1-1 베티스: 패 픽, 90+1' 동점골
  const late = classifyPred({ ...base, result_idx: 1 }, { pick_idx: 2, pick_prob: 0.39, flags: [] }, [1, 1],
    { goals: [{ base: 50, min: "50'", side: 'a', pen: false }, { base: 90, min: "90+1'", side: 'h', pen: false }], reds: [], shots: { h: 25, a: 6 }, sot: { h: 6, a: 3 } });
  assert.ok(late.tags.includes('late_goal')); assert.equal(verdictOf(late.tags), 'luck');
  assert.match(late.note, /90\+1' 골/);
  // 라요 0-1 발렌시아: 승 픽, 슈팅 21:11 → 내용 우세
  const dom = classifyPred({ ...base, result_idx: 2 }, { pick_idx: 0, pick_prob: 0.6, flags: [] }, [0, 1],
    { goals: [{ base: 41, min: "41'", side: 'a', pen: false }], reds: [], shots: { h: 21, a: 11 }, sot: { h: 5, a: 2 } });
  assert.ok(dom.tags.includes('dominated'));
  // 첼시 1-4 리즈 승 픽: PK 빼도 패 → PK 태그 없음, 슈팅 열세 → 판단 실패
  const read = classifyPred({ ...base, result_idx: 2 }, { pick_idx: 0, pick_prob: 0.6, flags: ['국내과열'] }, [1, 4],
    { goals: [{ base: 25, side: 'h' }, { base: 28, side: 'a' }, { base: 53, side: 'a', pen: true, min: "53'" }, { base: 58, side: 'a' }, { base: 90, side: 'a', min: "90+1'" }], reds: [], shots: { h: 14, a: 21 }, sot: { h: 3, a: 8 } });
  assert.ok(!read.tags.includes('penalty') && !read.tags.includes('late_goal'));
  assert.ok(read.tags.includes('overheat')); assert.equal(verdictOf(read.tags), 'read');
  // 핸디 -1 승 픽인데 1골 차 승 → 무: 한 끗(근소)
  const m = classifyPred({ ...base, bet_type_id: '4', handi: -1, result_idx: 1 }, { pick_idx: 0, pick_prob: 0.6, flags: [] }, [2, 1], null);
  assert.deepEqual(m.tags, ['margin']); assert.equal(verdictOf(m.tags), 'close');
  // 오버 픽 1:0인데 유효슈팅 12 → 기회 무산
  const w = classifyPred({ ...base, bet_type_id: '7', handi: 2.5, result_idx: 0, result_score: '1:0' }, { pick_idx: 2, pick_prob: 0.58, flags: [] }, [1, 0],
    { goals: [{ base: 30, side: 'h' }], reds: [], shots: { h: 22, a: 12 }, sot: { h: 10, a: 2 } });
  assert.ok(w.tags.includes('wasteful'));
  // 적중은 태그 없음, 특례는 null
  assert.deepEqual(classifyPred({ ...base, result_idx: 0 }, { pick_idx: 0, pick_prob: 0.6 }, [1, 0], null).tags, []);
  assert.equal(classifyPred({ ...base, result_idx: 4 }, { pick_idx: 0, pick_prob: 0.6 }, [1, 0], null), null);
});

test('retro: 배구 언오버는 자기 행 총점으로 근소 판정 (세트 스코어 아님)', async () => {
  const { classifyPred } = await import('../src/lib/proto/retro.js');
  const r = classifyPred({ sport_code: 'VL', bet_type_id: '7', handi: 183.5, result_idx: 2, result_score: '184:0', txt_w: '언더', txt_l: '오버' },
    { pick_idx: 0, pick_prob: 0.56, flags: [] }, [3, 1], null);
  assert.ok(r.tags.includes('margin')); assert.match(r.note, /총점 184/);
});

test('retro: 회차 요약 — 판정 집계·판단 실패는 확률 높은 순', async () => {
  const { roundRetro } = await import('../src/lib/proto/retro.js');
  const G = (prob, hit, tags) => ({ sport: '축구', league_short: 'EPL', bet_type: '승무패', bet_type_id: '1', result_idx: hit ? 0 : 2,
    pred: { pick_idx: 0, pick_prob: prob, miss_tags: hit ? [] : tags, retro_note: hit ? null : 'x' } });
  const r = roundRetro([G(0.8, false, ['upset']), G(0.6, false, ['late_goal']), G(0.7, false, []), G(0.6, true), G(0.55, false, null)]);
  assert.equal(r.misses, 4); assert.equal(r.done, 3);
  assert.deepEqual(r.verdict, { luck: 1, close: 0, read: 2 });
  assert.deepEqual(r.worst.map((g) => g.pred.pick_prob), [0.8, 0.7]);
});

test('typeLabel: 전반전 마켓 구분', async () => {
  const { typeLabel, isFirstHalf } = await import('../src/lib/proto/accuracy.js');
  assert.equal(typeLabel({ bet_type: '승무패', bet_name: '축구 전반 승무패' }), '전반 승무패');
  assert.equal(typeLabel({ bet_type: '일반 정수핸디캡', bet_name: '축구 핸디캡' }), '정수핸디캡');
  assert.equal(isFirstHalf({}), false);
});
