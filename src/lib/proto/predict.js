/**
 * predict.js — 프로토 승부식 예측 (순수함수, LLM 없음).
 *
 * 토토 승무패 분석에서 검증한 원칙을 그대로 옮긴다.
 *  - 확률 우선순위: 해외 배당 디빅 > 국내 배당 디빅 (배당은 가격, 구매 쏠림은 아님)
 *  - 1골 핸디는 해외 승무패만으로 정확히 계산된다: 홈 -1 '패' = 홈 못 이김(무+원정승), 홈 +1 '승' = 홈 안 짐(홈승+무)
 *    2골 차 확률은 해외 ±1.5 스프레드가 있을 때만 쓰고, 없으면 국내 배당 비율로 나눈다.
 *  - 국내 과열 정배(구매 비중 - 확률 ≥ 15%p)는 붕괴 위험 플래그 (토토 최근 사례: 격차 ≥16%p 정배 6개 중 4개 붕괴)
 *  - 적중 예측(pick) = 최고 확률, 가치 픽(value) = 국내배당 × 확률 최고 (확률 20% 이상만)
 */
export const MODEL_VERSION = 'v1';
export const OVERHEAT_GAP = 0.15;
export const VALUE_MIN_PROB = 0.2;

/** 배당 → 디빅 확률. 0/null 배당(미발매 선택지)은 0. */
export function devig(odds) {
  const inv = odds.map((o) => (o && o > 1 ? 1 / o : 0));
  const s = inv.reduce((a, b) => a + b, 0);
  return s > 0 ? inv.map((x) => x / s) : odds.map(() => 0);
}

/** 국내 구매 건수 → 비중. 데이터 없으면 null. */
export function crowdShares(bets) {
  if (!bets || bets.some((b) => b == null)) return null;
  const s = bets[0] + bets[1] + bets[2];
  return s > 0 ? bets.map((b) => b / s) : null;
}

const norm = (p) => { const s = p[0] + p[1] + p[2]; return s > 0 ? p.map((x) => x / s) : p; };

/**
 * 해외 정보로 이 게임의 확률을 만든다. 못 만들면 null.
 * @param {{bet_type_id:string, handi:number|null}} g
 * @param {{p1x2?:number[], pML?:number[], spread?:{line:number, pHome:number}}} ext
 *        spread.line = 홈 기준 라인(예 -1.5), pHome = 홈이 그 라인을 넘을 확률
 * @param {number[]} dom 국내 디빅 (나눌 때 비율용)
 */
export function externalProbs(g, ext, dom) {
  if (!ext) return null;
  const t = g.bet_type_id; const h = g.handi == null ? 0 : Number(g.handi);
  if (ext.pML && t === '2') return { p: [ext.pML[0], 0, ext.pML[1]], source: 'espn' };
  const P = ext.p1x2; if (!P) return null;
  const [H, D, A] = P;
  // 2골 차 이상 확률 (스프레드 ±1.5)
  const sp = ext.spread;
  const home2 = sp && sp.line === -1.5 ? sp.pHome : null;   // 홈 2골 차+
  const away2 = sp && sp.line === 1.5 ? 1 - sp.pHome : null; // 원정 2골 차+
  if (t === '1') return { p: [H, D, A], source: 'espn' };
  if (t === '5' && Math.abs(h) === 0.5) return { p: h < 0 ? [H, 0, D + A] : [H + D, 0, A], source: 'espn' };
  if (t === '5' && h === -1.5 && home2 != null) return { p: [home2, 0, 1 - home2], source: 'espn_spread' };
  if (t === '5' && h === 1.5 && away2 != null) return { p: [1 - away2, 0, away2], source: 'espn_spread' };
  if (t === '4' && h === -1) {
    const pL = D + A; // 홈 못 이김 (정확)
    if (home2 != null) return { p: [home2, Math.max(H - home2, 0), pL], source: 'espn_spread' };
    const r = dom[0] + dom[1] > 0 ? dom[0] / (dom[0] + dom[1]) : 0.5;
    return { p: [H * r, H * (1 - r), pL], source: 'espn' };
  }
  if (t === '4' && h === 1) {
    const pW = H + D; // 홈 안 짐 (정확)
    if (away2 != null) return { p: [pW, Math.max(A - away2, 0), away2], source: 'espn_spread' };
    const r = dom[1] + dom[2] > 0 ? dom[1] / (dom[1] + dom[2]) : 0.5;
    return { p: [pW, A * r, A * (1 - r)], source: 'espn' };
  }
  return null;
}

/**
 * 게임 1행 예측.
 * @param {object} g proto_games 행 (odds_*, bets_*, bet_type_id, handi, sport_code)
 * @param {object|null} ext 해외 정보 (externalProbs 참고)
 */
export function predictGame(g, ext = null) {
  const odds = [g.odds_w, g.odds_d, g.odds_l].map((o) => (o == null ? 0 : Number(o)));
  const avail = odds.map((o) => o > 1);
  if (avail.filter(Boolean).length < 2) return null; // 발매 전/미발매
  const dom = devig(odds);
  const e = externalProbs(g, ext, dom);
  const p = norm((e ? e.p : dom).map((x, i) => (avail[i] ? x : 0)));
  const source = e ? e.source : 'domestic';

  const idx = [0, 1, 2].filter((i) => avail[i]);
  const pick = idx.reduce((a, i) => (p[i] > p[a] ? i : a), idx[0]);
  const evs = odds.map((o, i) => (avail[i] ? o * p[i] : 0));
  const vIdx = idx.filter((i) => p[i] >= VALUE_MIN_PROB);
  const value = vIdx.length ? vIdx.reduce((a, i) => (evs[i] > evs[a] ? i : a), vIdx[0]) : null;

  const crowd = crowdShares([g.bets_w, g.bets_d, g.bets_l]);
  const flags = [];
  if (source !== 'domestic') flags.push('해외배당');
  if (crowd && crowd[pick] - p[pick] >= OVERHEAT_GAP) flags.push('국내과열');
  if (avail[1] && g.bet_type_id === '1' && evs[1] >= 0.95) flags.push('저평가무');
  if (value != null && evs[value] >= 1) flags.push('가치');

  return {
    model_version: MODEL_VERSION,
    p_w: round4(p[0]), p_d: round4(p[1]), p_l: round4(p[2]),
    prob_source: source,
    pick_idx: pick,
    pick_prob: round4(p[pick]),
    pick_odds: odds[pick],
    value_idx: value,
    value_ev: value == null ? null : round4(evs[value]),
    crowd_share: crowd ? round4(crowd[pick]) : null,
    flags,
  };
}
const round4 = (x) => Math.round(x * 1e4) / 1e4;

/** 결과 대비 적중 여부. 특례(4)/미정은 null. */
export function isHit(resultIdx, idx) {
  if (resultIdx == null || resultIdx === 4 || idx == null) return null;
  return resultIdx === idx;
}
