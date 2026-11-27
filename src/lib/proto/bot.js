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
 *
 * 규칙 v3 (2026-11-27, 사용자 요청: 해외 배당 없는 게임도 국내배당으로 분석해 산다)
 *  6) 국내배당만 있는 게임도 후보. 확률 = 국내 디빅 × 구간별 보정(domesticCal.js, 우리 DB 확정 경기로 측정).
 *     정보가 해외보다 약하므로 별도 칸으로 관리한다:
 *     - 국내 레그가 하나라도 낀 슬립 = '국내포함' 슬립: 1만원 고정 · 회차 예산의 20%까지 · 슬립 기대 회수율 ≥ 0.78
 *       (국내 레그 하나 EV ≈ 0.87~0.90 → 2폴 ≈ 0.76~0.81. 환급률 한계 안에서 가장 나은 것만)
 *     - 해외 확률만으로 된 슬립을 먼저 사고, 남은 예산·경기로 국내포함 슬립을 산다.
 *     - 국내 레그 후보는 해외 후보(maxCands)와 따로 domMaxCands개 (홀짝 같은 0.9 레그가 해외 후보를 밀어내지 않게).
 *     - 국내 게임은 경기당 마켓 domPerMatch개까지 후보(홀짝만 남으면 2폴 확률 25% < 28%). 같은 경기끼리는 한 슬립에 묶지 않는다.
 *
 * 규칙 v4 (2026-11-27, 사용자 요청)
 *  7) 구매 시간: 베트맨처럼 매일 23시(KST)까지만 산다. 23시~06시 배치는 결과 마킹만 하고 사지 않는다.
 *     자정 넘어 시작하는 경기는 전날 23시 전에 사야 하므로, 22시 배치(그날 마지막 구매 기회)는 '마감 소진':
 *     나눠 쓰기 상한까지 남은 돈을 기준을 낮춰(해외 EV ≥ 0.80, 국내포함 ≥ 0.70) 채운다 → 회차 10만원을 남기지 않는다.
 *     현재 모드(press/safe)로 못 채우면 기본 모드 범위로 한 번 더 찾는다.
 *  8) 무: 레그 확률 하한 30% 때문에 무(보통 22~30%)가 구조적으로 빠졌다. 무 레그는 22%부터 후보,
 *     무가 낀 슬립은 기본 모드에서 배당 5.0·확률 18%까지 허용(EV 기준은 같음). 확률 우선 모드(press/safe)는 그대로.
 *  9) 국내포함 칸 회차 예산 20% → 40%.
 *  10) 예산·중복은 버전과 무관하게 이 회차의 모든 Claude 슬립으로 센다(버전을 올려도 예산이 다시 풀리지 않게).
 */
import { comboCandidates } from './combos.js';
import { comboOdds, settleBet } from './bets.js';

const DOM_TAG = '국내포함';

export const BOT_ID = 'claude-v4';
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
  domMaxCands: 30,  // 국내 레그 후보 수 (EV 상위) — 홀짝(0.90)이 위를 채우므로 승패·핸디까지 들어오게 넉넉히
  domPerMatch: 3,   // 국내 게임은 경기당 마켓 3개까지 후보 (홀짝만 남으면 2폴 확률이 25%라 조합이 안 됨)
  domestic: { stake: 10000, capShare: 0.4, minEv: 0.78 }, // 국내포함 슬립 칸
  perMatch: 2,      // 해외 게임도 경기당 마켓 2개까지 후보 (무 같은 다른 선택지가 같은 경기 최선 레그에 가려지지 않게)
  draw: { legMinProb: 0.22, oddsMax: 5.0, minProb: 0.18 }, // 무 레그·무 포함 슬립 (기본 모드만)
  buyHours: { open: 6, close: 23, lastCall: 22 }, // KST. close 이후 ~ open 전에는 안 산다. lastCall 시(時)는 마감 소진
  lastCall: { minEv: 0.80, domMinEv: 0.70 },
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

const kstHour = (t) => new Date(t + 9 * 3600e3).getUTCHours();
/** 구매 가능 시간(KST open~close)인지, 그날 마지막 구매 시(時)인지 */
export function buyWindow(now = Date.now(), policy = BOT_POLICY) {
  const h = kstHour(now); const B = policy.buyHours;
  return { open: h >= B.open && h < B.close, lastCall: h === B.lastCall };
}

/**
 * 이번 배치에서 살 슬립.
 * @param {Array} games 회차 전체 proto_games 행 + pred({p_w,p_d,p_l,prob_source})
 * @param {{now?:number, prevBets?:Array, policy?:object}} opts prevBets = 이 회차에 이미 산 Claude 슬립(레그·게임 포함)
 * @returns {{mode:string, cap:number, spent:number, closed:boolean, lastCall:boolean, bets:Array<{stake, total_odds, model_prob, ev, reason, legs}>}}
 */
export function planBotBets(games, { now = Date.now(), prevBets = [], policy = BOT_POLICY, domesticCal = null, onlyGameIds = null } = {}) {
  const P = { ...BOT_POLICY, ...policy };
  const mode = botMode(prevBets);
  const spent = prevBets.reduce((a, b) => a + Number(b.stake), 0);
  const cap = Math.min(spendCap(games, { now, policy: P }), P.budget);
  const used = new Set(prevBets.flatMap((b) => (b.legs || []).map((l) => l.game && matchKeyOf(l.game)).filter(Boolean)));
  const domSpent = prevBets.filter((b) => String(b.reason || '').startsWith(DOM_TAG)).reduce((a, b) => a + Number(b.stake), 0);
  const win = buyWindow(now, P);
  const out = { mode, cap, spent, closed: !win.open, lastCall: win.lastCall, bets: [] };
  let room = cap - spent;
  let domRoom = Math.floor((P.budget * P.domestic.capShare) / P.step) * P.step - domSpent;
  if (!win.open || room < P.step) return out;
  const minEv = win.lastCall ? P.lastCall.minEv : P.minEv;
  const domMinEv = win.lastCall ? P.lastCall.domMinEv : P.domestic.minEv;
  const horizon = now + P.horizonH * 3600e3;
  const near = games.filter((g) => g.game_ts && new Date(g.game_ts).getTime() <= horizon && !used.has(matchKeyOf(g))
    && (!onlyGameIds || onlyGameIds.has(g.id)));

  // 마감 소진(22시)인데 현재 모드(press/safe)로 못 채우면 기본 모드 범위로 한 번 더 — 회차 예산을 남기지 않게
  const passes = win.lastCall && mode !== 'normal' ? [mode, 'normal'] : [mode];
  for (const pm of passes) {
    if (room < P.step) break;
    const M = P.modes[pm];
    const drawOk = pm === 'normal';
    const lead = { now: now + P.minLeadMin * 60e3, minEv: P.legMinEv, minProb: P.legMinProb, drawMinProb: drawOk ? P.draw.legMinProb : P.legMinProb };
    const pool = near.filter((g) => !used.has(matchKeyOf(g)));
    const cands = [
      ...comboCandidates(pool, { ...lead, perMatch: P.perMatch }).slice(0, P.maxCands),
      ...(domesticCal ? comboCandidates(pool.filter((g) => g.pred?.prob_source === 'domestic'), { ...lead, domesticCal, perMatch: P.domPerMatch }).slice(0, P.domMaxCands) : []),
    ];

    const slips = [];
    const consider = (legs) => {
      if (new Set(legs.map((l) => matchKeyOf(l.game))).size < legs.length) return; // 같은 경기 다른 마켓끼리는 못 묶는다
      const odds = comboOdds(legs.map((l) => l.odds));
      const draw = drawOk && legs.some((l) => l.pick_idx === 1);
      if (odds < M.oddsMin || odds > (draw ? Math.max(M.oddsMax, P.draw.oddsMax) : M.oddsMax)) return;
      const prob = legs.reduce((a, l) => a * l.prob, 1);
      const ev = odds * prob;
      const domestic = legs.some((l) => l.domestic);
      if (prob >= (draw ? Math.min(M.minProb, P.draw.minProb) : M.minProb) && ev >= (domestic ? domMinEv : minEv)) slips.push({ legs, odds, prob, ev, domestic, draw });
    };
    const n = cands.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (P.minLegs <= 2) consider([cands[i], cands[j]]);
        if (P.maxLegs >= 3) for (let k = j + 1; k < n; k++) consider([cands[i], cands[j], cands[k]]);
      }
    }
    // 해외 확률만으로 된 슬립 먼저, 그다음 국내포함. 각각 기대 회수율 우선, 근소하면(0.005) 적중확률 높은 쪽
    slips.sort((a, b) => (a.domestic !== b.domestic ? (a.domestic ? 1 : -1)
      : Math.abs(b.ev - a.ev) > 0.005 ? b.ev - a.ev : b.prob - a.prob));

    for (const s of slips) {
      const limit = s.domestic ? Math.min(room, domRoom) : room;
      const stake = Math.min(s.domestic ? P.domestic.stake : M.stake, Math.floor(limit / P.step) * P.step);
      if (stake < P.step) { if (s.domestic) continue; break; }
      const keys = s.legs.map((l) => matchKeyOf(l.game));
      if (keys.some((k) => used.has(k))) continue;
      keys.forEach((k) => used.add(k));
      room -= stake;
      if (s.domestic) domRoom -= stake;
      out.bets.push({
        stake,
        total_odds: s.odds,
        model_prob: s.prob,
        ev: s.ev,
        reason: `${s.domestic ? `${DOM_TAG} · ` : ''}${win.lastCall ? '마감 소진 · ' : ''}${s.draw ? '무 포함 · ' : ''}${M.label} · ${s.legs.length}폴 · EV ${s.ev.toFixed(3)} · 확률 ${Math.round(s.prob * 100)}% · ${BOT_ID}`,
        legs: s.legs.map((l) => ({ game_id: l.game.id, pick_idx: l.pick_idx, odds: l.odds, model_prob: l.prob })),
      });
    }
  }
  return out;
}

/** 화면 안내용 규칙 요약 (UI와 규칙을 한 곳에서 관리) */
export const BOT_RULES_TEXT = `회차당 10만원을 회차 진행에 맞춰 나눠 씁니다(24시간 안에 시작하는 게임 비율만큼 예산이 풀림). 베트맨처럼 매일 23시까지만 사고, 22시 배치에서 그때까지 풀린 예산을 기준을 조금 낮춰 채웁니다. 2·3폴만 사고(단폴 없음), 해외 확률 슬립은 기대 회수율 ${BOT_POLICY.minEv} 이상만 삽니다. 해외 배당이 없는 게임은 국내배당을 우리 기록(배당 구간별 실제 적중률)으로 보정해 '국내포함' 슬립으로 1만원씩, 회차 예산의 ${Math.round(BOT_POLICY.domestic.capShare * 100)}%까지만 삽니다. 무는 확률 22%부터 후보로 보고, 무가 끼면 배당 5배까지 삽니다. 직전 슬립이 적중하면 저배당(1.8~2.6)에 3만원으로 늘리고, 낙첨하면 적중확률 42% 이상인 슬립만 삽니다. 실제 구매가 아닌 모의 기록입니다.`;
