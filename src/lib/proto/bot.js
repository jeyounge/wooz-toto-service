/**
 * bot.js — "Claude 배팅": 회차당 예산 안에서 규칙대로 스스로 사는 모의 배팅 (순수함수, DB 없음).
 *
 * 목적: 사용자 개인 배팅(/proto/my)과 같은 조건(회차 10만원, 2만원 단위, 2~3배 안팎)으로
 *       분석 결과만 따라 샀을 때의 성적을 나란히 기록해 비교한다. 실제 구매가 아니라 기록용이다.
 *
 * 규칙 (2026-11-25 v1, 근거: proto-analyze 138~140회차 + 같은 날 UCL 검토)
 *  1) 후보 = 킥오프 전 · horizonH 시간 안 · 해외 확률이 있는 게임만.
 *     국내 배당 디빅만이면 모든 선택지 EV ≈ 환급률(0.86)이라 고를 근거가 없다.
 *  2) 경기당 선택지 1개(EV 최고, 확률 ≥ minProb). 같은 경기는 회차 안에서 한 번만 산다(다른 마켓 포함).
 *  3) 슬립 = 단폴 또는 2폴. 조합 배당 oddsMin~oddsMax. 레그가 늘면 베트맨 마진이 곱으로 쌓여 EV가 떨어지므로
 *     3폴 이상은 사지 않는다.
 *  4) 슬립 EV(= 조합 배당 × 확률곱) ≥ minEv 인 것만, EV 높은 순으로 예산이 남는 만큼 unit 원씩.
 *     기준 미달이면 사지 않는다(안 사는 것도 판단). 예산은 회차 전체 기준이라 배치가 여러 번 돌아도 넘지 않는다.
 *  ※ 국내과열 반대(◆)는 쓰지 않는다: 132건 재집계 ROI −0.8%로 우위가 사라졌고, 축구 언오버는 해외 확률이 없다.
 */
import { comboCandidates } from './combos.js';
import { comboOdds } from './bets.js';

export const BOT_ID = 'claude-v1';
export const BOT_POLICY = Object.freeze({
  budget: 100000,  // 회차 예산(원)
  unit: 20000,     // 슬립 1장 금액(원)
  horizonH: 24,    // 킥오프까지 남은 시간 상한 — 가까울수록 배당·확률이 최신
  minEv: 0.93,     // 슬립 기대 회수율 하한
  legMinEv: 0.85,  // 레그 기대 회수율 하한 (조합 후보 수 제한용, 최종 판단은 minEv)
  minProb: 0.3,    // 레그 확률 하한
  oddsMin: 1.8,    // 조합 배당 범위
  oddsMax: 3.5,
  maxLegs: 2,
});

export const matchKeyOf = (g) => `${g.home}|${g.away}|${g.game_ts}`;

/**
 * 이번 배치에서 살 슬립.
 * @param {Array} games proto_games 행 + pred({p_w,p_d,p_l,prob_source}) — 회차 전체를 넘겨도 된다
 * @param {{now?:number, spent?:number, usedKeys?:Iterable<string>, policy?:object}} opts
 *        spent = 이 회차에 이미 산 금액, usedKeys = 이미 산 경기(matchKeyOf)
 * @returns {Array<{stake:number, total_odds:number, model_prob:number, ev:number, reason:string,
 *                  legs:Array<{game_id:number, pick_idx:number, odds:number, model_prob:number}>}>}
 */
export function planBotBets(games, { now = Date.now(), spent = 0, usedKeys = [], policy = BOT_POLICY } = {}) {
  const P = { ...BOT_POLICY, ...policy };
  let slots = Math.floor((P.budget - spent) / P.unit);
  if (slots <= 0) return [];
  const used = new Set(usedKeys);
  const horizon = now + P.horizonH * 3600e3;
  const near = games.filter((g) => g.game_ts && new Date(g.game_ts).getTime() <= horizon && !used.has(matchKeyOf(g)));
  const cands = comboCandidates(near, { now, minEv: P.legMinEv, minProb: P.minProb });

  const slips = [];
  const push = (legs) => {
    const odds = comboOdds(legs.map((l) => l.odds));
    if (odds < P.oddsMin || odds > P.oddsMax) return;
    const prob = legs.reduce((a, l) => a * l.prob, 1);
    const ev = odds * prob;
    if (ev >= P.minEv) slips.push({ legs, odds, prob, ev });
  };
  for (let i = 0; i < cands.length; i++) {
    push([cands[i]]);
    if (P.maxLegs >= 2) for (let j = i + 1; j < cands.length; j++) push([cands[i], cands[j]]);
  }
  // EV 우선, 근소하면(0.005) 적중확률 높은 쪽 → 같은 EV면 분산이 작은 슬립
  slips.sort((a, b) => (Math.abs(b.ev - a.ev) > 0.005 ? b.ev - a.ev : b.prob - a.prob));

  const out = [];
  for (const s of slips) {
    if (slots <= 0) break;
    if (s.legs.some((l) => used.has(l.key))) continue;
    s.legs.forEach((l) => used.add(l.key));
    slots--;
    out.push({
      stake: P.unit,
      total_odds: s.odds,
      model_prob: s.prob,
      ev: s.ev,
      reason: `${s.legs.length === 1 ? '단폴' : `${s.legs.length}폴`} · EV ${s.ev.toFixed(3)} · 확률 ${Math.round(s.prob * 100)}% · ${BOT_ID}`,
      legs: s.legs.map((l) => ({ game_id: l.game.id, pick_idx: l.pick_idx, odds: l.odds, model_prob: l.prob })),
    });
  }
  return out;
}
