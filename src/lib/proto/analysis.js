/**
 * analysis.js — 회차 묶음 진단 (순수함수). scripts/proto-analyze.mjs 가 쓴다.
 *
 * 질문 세 가지에 답한다.
 *  1) 확률이 맞나? — 예측확률 구간별 실제 적중률(캘리브레이션)
 *  2) 국내 배당이 얼마나 비싼가? — 환급률(1 / Σ 1/배당) 종목·유형별
 *  3) 어떤 픽을 샀으면 벌었나? — 전략별 단폴 1단위 회수율 (예측픽 전부 / 해외확률+EV / 고확률 …)
 */
import { isHit } from './predict.js';
import { betGroup, isFirstHalf } from './accuracy.js';

const odds3 = (g) => [g.odds_w, g.odds_d, g.odds_l].map((o) => (o == null ? 0 : Number(o)));
const probs3 = (p) => [p.p_w, p.p_d, p.p_l].map(Number);
export const payoutRate = (odds) => { const inv = odds.filter((o) => o > 1).map((o) => 1 / o); return inv.length >= 2 ? 1 / inv.reduce((a, b) => a + b, 0) : null; };

/** 전략: 게임 → 살 선택지 index 또는 null */
export const STRATEGIES = {
  '예측픽 전부': (g, p) => p.pick_idx,
  '예측픽 · 확률 60%+': (g, p) => (Number(p.pick_prob) >= 0.6 ? p.pick_idx : null),
  '예측픽 · 해외확률만': (g, p) => (p.prob_source !== 'domestic' ? p.pick_idx : null),
  '가치픽 · 해외확률 · EV≥1.00': (g, p) => (p.prob_source !== 'domestic' && p.value_idx != null && Number(p.value_ev) >= 1 ? p.value_idx : null),
  '가치픽 · 해외확률 · EV≥1.05': (g, p) => (p.prob_source !== 'domestic' && p.value_idx != null && Number(p.value_ev) >= 1.05 ? p.value_idx : null),
  '국내과열 픽 반대(차선)': (g, p) => {
    if (!(p.flags || []).includes('국내과열')) return null;
    const pr = probs3(p); const o = odds3(g);
    const alt = [0, 1, 2].filter((i) => i !== p.pick_idx && o[i] > 1).sort((a, b) => pr[b] - pr[a])[0];
    return alt ?? null;
  },
  '홀짝·언오버 제외 예측픽': (g, p) => (['ou', 'oe'].includes(betGroup(g.bet_type_id)) ? null : p.pick_idx),
};

const BUCKETS = [[0, 0.4], [0.4, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]];

/**
 * @param {Array} games proto_games 행 + pred (결과 미정 포함 가능)
 */
export function diagnose(games) {
  const settled = games.filter((g) => g.pred && isHit(g.result_idx, g.pred.pick_idx) != null);
  // 1) 캘리브레이션
  const calib = BUCKETS.map(([lo, hi]) => {
    const xs = settled.filter((g) => Number(g.pred.pick_prob) >= lo && Number(g.pred.pick_prob) < hi);
    const hit = xs.filter((g) => g.result_idx === g.pred.pick_idx).length;
    return { bucket: `${Math.round(lo * 100)}–${Math.min(100, Math.round(hi * 100))}%`, n: xs.length, hit, rate: xs.length ? hit / xs.length : null, exp: xs.length ? xs.reduce((s, g) => s + Number(g.pred.pick_prob), 0) / xs.length : null };
  });
  // 2) 환급률 (발매된 전 게임)
  const pr = {};
  for (const g of games) {
    const r = payoutRate(odds3(g)); if (r == null) continue;
    const k = `${g.sport} · ${isFirstHalf(g) ? '전반 ' : ''}${betGroup(g.bet_type_id)}`;
    (pr[k] ||= { n: 0, sum: 0 }); pr[k].n++; pr[k].sum += r;
  }
  const payout = Object.entries(pr).map(([k, v]) => ({ key: k, n: v.n, rate: v.sum / v.n })).sort((a, b) => b.n - a.n);
  // 3) 전략별 단폴 회수율
  const strategies = Object.entries(STRATEGIES).map(([name, fn]) => {
    let n = 0, hit = 0, ret = 0, expRet = 0;
    for (const g of settled) {
      const i = fn(g, g.pred); if (i == null) continue;
      const o = odds3(g)[i]; if (!(o > 1)) continue;
      n++; expRet += o * probs3(g.pred)[i];
      if (g.result_idx === i) { hit++; ret += o; }
    }
    return { name, n, hit, rate: n ? hit / n : null, roi: n ? ret / n - 1 : null, expRoi: n ? expRet / n - 1 : null };
  });
  // 4) 종목 × 유형군 × 확률원천
  const cells = {};
  for (const g of settled) {
    const k = `${g.sport} · ${betGroup(g.bet_type_id)} · ${g.pred.prob_source}`;
    (cells[k] ||= { n: 0, hit: 0, exp: 0 }); const c = cells[k];
    c.n++; c.exp += Number(g.pred.pick_prob); if (g.result_idx === g.pred.pick_idx) c.hit++;
  }
  const segments = Object.entries(cells).map(([k, c]) => ({ key: k, n: c.n, rate: c.hit / c.n, exp: c.exp / c.n })).sort((a, b) => b.n - a.n);
  const sourceMix = games.filter((g) => g.pred).reduce((m, g) => { m[g.pred.prob_source] = (m[g.pred.prob_source] || 0) + 1; return m; }, {});
  return { total: games.length, predicted: games.filter((g) => g.pred).length, settled: settled.length, sourceMix, calib, payout, strategies, segments };
}
