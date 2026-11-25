/**
 * bot.js — "Claude 배팅": 회차당 예산 안에서 규칙대로 스스로 사는 모의 배팅 (순수함수, DB 없음).
 *
 * 목적: 사용자 개인 배팅(/proto/my)과 같은 조건(회차 10만원, 베트맨 규칙)으로 분석 규칙만 따라 샀을 때의
 *       성적을 나란히 기록해 비교한다. 실제 구매가 아니라 기록용이다.
 *
 * 규칙 v2 (2026-11-25, 사용자 요청 반영)
 *  1) 2폴·3폴만. 단폴은 베트맨에서 되는 게임·안 되는 게임이 섞여 있어 아예 사지 않는다.
 *  2) 후보 레그 = 킥오프 minLeadMin분 이상 전(발매 마감 여유) · horizonH 시간 안 · 해외 확률이 있는 게임, 경기당 1개(EV 최고).
 *     같은 경기는 회차 안에서 한 번만 산다(다른 마켓 포함).
 *  3) 나눠 쓰기: 회차 예산 상한 = budget × (지금+horizonH 안에 시작하는 회차 게임 비율). 회차가 진행될수록 풀린다.
 *  4) 직전 결과로 모드 전환 (이 회차에서 가장 최근에 끝난 Claude 슬립 기준)
 *     - 기본: 2만원 · 조합 배당 2.0~3.5 · 적중확률 ≥ 28%
 *     - 적중 후(press): 저배당에 증액 — 3만원 · 1.8~2.6 · ≥ 38%
 *     - 낙첨 후(safe): 확률 우선 — 2만원 · 1.8~2.6 · ≥ 42%
 *  5) 모드 조건을 통과한 슬립 중 기대 회수율(조합 배당 × 확률곱) 높은 순, minEv 미만은 사지 않는다.
 *  ※ 국내과열 반대(◆)는 쓰지 않는다: 132건 재집계 ROI −0.8%로 우위가 사라졌고, 축구 언오버는 해외 확률이 없다.
 */
import { comboCandidates } from './combos.js';
import { comboOdds, settleBet } from './bets.js';

export const BOT_ID = 'claude-v2';
export const BOT_POLICY = Object.freeze({
  budget: 100000,   // 회차 예산(원)
  step: 10000,      // 금액 단위(원)
  horizonH: 24,     // 레그 후보·예산 풀림 기준 시간
  minLeadMin: 30,   // 킥오프까지 최소 여유(분) — 베트맨 발매 마감 전에 살 수 있는 게임만
  legMinEv: 0.85,   // 레그 기대 회수율 하한 (조합 후보 수 제한용)
  legMinProb: 0.3,  // 레그 확률 하한
  maxCands: 20,     // 조합에 쓰는 레그 후보 수 (EV 상위)
  minLegs: 2,
  maxLegs: 3,
  minEv: 0.88,      // 슬립 기대 회수율 하한
  modes: {
    normal: { label: '기본', stake: 20000, oddsMin: 2.0, oddsMax: 3.5, minProb: 0.28 },
    press: { label: '적중 후 저배당 증액', stake: 30000, oddsMin: 1.8, oddsMax: 2.6, minProb: 0.38 },
    safe: { label: '낙첨 후 확률 우선', stake: 20000, oddsMin: 1.8, oddsMax: 2.6, minProb: 0.42 },
  },
});

/** 경기 키. 킥오프는 epoch(ms)로 — DB('…+00:00')와 베트맨 수집값('…Z' 등) 문자열 형식이 달라도 같은 경기로 본다. */
export const matchKeyOf = (g) => `${g.home}|${g.away}|${new Date(g.game_ts).getTime()}`;

/**
 * 직전 결과 → 모드. 이 회차 Claude 슬립 중 결과가 난(적중/낙첨) 것 가운데 마지막 레그가 가장 늦게 시작한 슬립 기준.
 * @param {Array} prevBets settleBet 입력 형태 (legs[].game.{result_idx, game_ts})
 */
export function botMode(prevBets = []) {
  let last = null; let lastTs = -Infinity;
  for (const b of prevBets) {
    const s = settleBet(b);
    if (s.status !== 'won' && s.status !== 'lost') continue;
    const ts = Math.max(...(b.legs || []).map((l) => new Date(l.game?.game_ts).getTime() || 0));
    if (ts > lastTs) { lastTs = ts; last = s.status; }
  }
  return last === 'won' ? 'press' : last === 'lost' ? 'safe' : 'normal';
}

/** 나눠 쓰기 상한: 회차 게임 중 now+horizonH 안에 시작하는 비율만큼 예산을 푼다 (step 단위 내림). */
export function spendCap(games, { now = Date.now(), policy = BOT_POLICY } = {}) {
  const ts = games.map((g) => new Date(g.game_ts).getTime()).filter(Number.isFinite);
  if (!ts.length) return 0;
  const frac = ts.filter((t) => t <= now + policy.horizonH * 3600e3).length / ts.length;
  return Math.floor((policy.budget * frac) / policy.step) * policy.step;
}

/**
 * 이번 배치에서 살 슬립.
 * @param {Array} games 회차 전체 proto_games 행 + pred({p_w,p_d,p_l,prob_source})
 * @param {{now?:number, prevBets?:Array, policy?:object}} opts prevBets = 이 회차에 이미 산 Claude 슬립(레그·게임 포함)
 * @returns {{mode:string, cap:number, spent:number, bets:Array<{stake, total_odds, model_prob, ev, reason, legs}>}}
 */
export function planBotBets(games, { now = Date.now(), prevBets = [], policy = BOT_POLICY } = {}) {
  const P = { ...BOT_POLICY, ...policy };
  const mode = botMode(prevBets);
  const M = P.modes[mode];
  const spent = prevBets.reduce((a, b) => a + Number(b.stake), 0);
  const cap = Math.min(spendCap(games, { now, policy: P }), P.budget);
  const used = new Set(prevBets.flatMap((b) => (b.legs || []).map((l) => l.game && matchKeyOf(l.game)).filter(Boolean)));
  const out = { mode, cap, spent, bets: [] };
  let room = cap - spent;
  if (room < P.step) return out;

  const horizon = now + P.horizonH * 3600e3;
  const near = games.filter((g) => g.game_ts && new Date(g.game_ts).getTime() <= horizon && !used.has(matchKeyOf(g)));
  const cands = comboCandidates(near, { now: now + P.minLeadMin * 60e3, minEv: P.legMinEv, minProb: P.legMinProb }).slice(0, P.maxCands);

  const slips = [];
  const consider = (legs) => {
    const odds = comboOdds(legs.map((l) => l.odds));
    if (odds < M.oddsMin || odds > M.oddsMax) return;
    const prob = legs.reduce((a, l) => a * l.prob, 1);
    const ev = odds * prob;
    if (prob >= M.minProb && ev >= P.minEv) slips.push({ legs, odds, prob, ev });
  };
  const n = cands.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (P.minLegs <= 2) consider([cands[i], cands[j]]);
      if (P.maxLegs >= 3) for (let k = j + 1; k < n; k++) consider([cands[i], cands[j], cands[k]]);
    }
  }
  // 기대 회수율 우선, 근소하면(0.005) 적중확률 높은 쪽
  slips.sort((a, b) => (Math.abs(b.ev - a.ev) > 0.005 ? b.ev - a.ev : b.prob - a.prob));

  for (const s of slips) {
    const stake = Math.min(M.stake, Math.floor(room / P.step) * P.step);
    if (stake < P.step) break;
    const keys = s.legs.map((l) => matchKeyOf(l.game));
    if (keys.some((k) => used.has(k))) continue;
    keys.forEach((k) => used.add(k));
    room -= stake;
    out.bets.push({
      stake,
      total_odds: s.odds,
      model_prob: s.prob,
      ev: s.ev,
      reason: `${M.label} · ${s.legs.length}폴 · EV ${s.ev.toFixed(3)} · 확률 ${Math.round(s.prob * 100)}% · ${BOT_ID}`,
      legs: s.legs.map((l) => ({ game_id: l.game.id, pick_idx: l.pick_idx, odds: l.odds, model_prob: l.prob })),
    });
  }
  return out;
}

/** 화면 안내용 규칙 요약 (UI와 규칙을 한 곳에서 관리) */
export const BOT_RULES_TEXT = `회차당 10만원을 회차 진행에 맞춰 나눠 씁니다(24시간 안에 시작하는 게임 비율만큼 예산이 풀림). 2·3폴만 사고(단폴 없음), 해외 확률이 있는 게임만, 기대 회수율 ${BOT_POLICY.minEv} 이상만 삽니다. 직전 슬립이 적중하면 저배당(1.8~2.6)에 3만원으로 늘리고, 낙첨하면 적중확률 42% 이상인 슬립만 삽니다. 실제 구매가 아닌 모의 기록입니다.`;
