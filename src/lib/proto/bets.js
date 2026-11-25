/**
 * bets.js — 프로토 승부식 개인 배팅 기록: 검증·정산·집계 (순수함수, DB 없음).
 *
 * 정산 규칙 (베트맨 승부식 기준, 근사):
 *  - 레그 결과 = 게임 result_idx 와 pick_idx 비교. 4(적중특례)는 해당 레그 배당 1.00 으로 처리.
 *  - 조합 배당 = 레그 배당 곱, 소수 둘째 자리 절사, 최대 100배.
 *  - 적중금 = 구매금액 × 조합 배당, 10원 미만 절사. 실제 받은 금액(payout_actual)이 있으면 그 값을 쓴다.
 *  - 한 레그라도 틀리면 낙첨, 결과 대기 레그가 남으면 대기.
 */
export const STAKE_MIN = 100;
export const STAKE_MAX = 100000;
export const MAX_LEGS = 10;
export const MAX_TOTAL_ODDS = 100;

const trunc2 = (x) => Math.floor(x * 100 + 1e-9) / 100;

/** 레그 배당 → 조합 배당 */
export function comboOdds(odds) {
  const p = odds.reduce((a, o) => a * Number(o), 1);
  return Math.min(trunc2(p), MAX_TOTAL_ODDS);
}

/** 레그 결과: pending / hit / miss / void */
export function legResult(resultIdx, pickIdx) {
  if (resultIdx == null) return 'pending';
  if (Number(resultIdx) === 4) return 'void';
  return Number(resultIdx) === Number(pickIdx) ? 'hit' : 'miss';
}

/**
 * 구매 전 검증. 레그는 {game_id, match_key, pick_idx, odds}.
 * match_key(홈|원정|킥오프)가 같은 레그 = 같은 경기의 다른 마켓 → 베트맨은 같은 경기 조합을 막는다.
 * @returns {string|null} 오류 메시지
 */
export function validateSlip({ stake, legs }) {
  const s = Number(stake);
  if (!Number.isInteger(s) || s < STAKE_MIN || s > STAKE_MAX || s % 100 !== 0) return `구매금액은 ${STAKE_MIN.toLocaleString('ko-KR')}~${STAKE_MAX.toLocaleString('ko-KR')}원, 100원 단위입니다.`;
  if (!Array.isArray(legs) || legs.length < 1) return '선택한 게임이 없습니다.';
  if (legs.length > MAX_LEGS) return `한 장에 최대 ${MAX_LEGS}게임까지 담을 수 있습니다.`;
  const ids = new Set(); const keys = new Set();
  for (const l of legs) {
    if (![0, 1, 2].includes(Number(l.pick_idx))) return '선택지 오류';
    if (!(Number(l.odds) > 1)) return '배당 오류';
    if (ids.has(l.game_id)) return '같은 게임을 두 번 담았습니다.';
    if (l.match_key && keys.has(l.match_key)) return '같은 경기의 다른 마켓은 한 장에 조합할 수 없습니다.';
    ids.add(l.game_id); if (l.match_key) keys.add(l.match_key);
  }
  return null;
}

/** 모델 적중확률(레그 독립 가정)과 기대 회수율(확률 × 배당). 확률 없는 레그가 있으면 null. */
export function slipModel(legs, totalOdds) {
  if (!legs.length || legs.some((l) => l.model_prob == null)) return { prob: null, ev: null };
  const prob = legs.reduce((a, l) => a * Number(l.model_prob), 1);
  return { prob, ev: prob * Number(totalOdds) };
}

/**
 * 슬립 1장 정산.
 * @param {{stake:number, total_odds:number, payout_actual?:number|null, legs:Array<{pick_idx:number, odds:number, game:{result_idx:number|null}}>}} bet
 */
export function settleBet(bet) {
  const legs = (bet.legs || []).map((l) => ({ ...l, result: legResult(l.game?.result_idx, l.pick_idx) }));
  const stake = Number(bet.stake);
  const anyMiss = legs.some((l) => l.result === 'miss');
  const anyPending = legs.some((l) => l.result === 'pending');
  const anyVoid = legs.some((l) => l.result === 'void');
  const status = anyMiss ? 'lost' : anyPending ? 'pending' : legs.length && legs.every((l) => l.result === 'void') ? 'void' : 'won';
  // 적중특례가 끼면 그 레그만 1.00으로 다시 곱한다. 아니면 구매 시점 조합 배당 그대로.
  const effOdds = status === 'void' ? 1 : anyVoid ? comboOdds(legs.filter((l) => l.result !== 'void').map((l) => l.odds)) : Number(bet.total_odds);
  let payout = null;
  if (status === 'lost') payout = 0;
  else if (status === 'won' || status === 'void') payout = bet.payout_actual != null ? Number(bet.payout_actual) : Math.floor((stake * effOdds) / 10) * 10;
  return { status, legs, effOdds, payout, profit: payout == null ? null : payout - stake };
}

const blank = () => ({ n: 0, settled: 0, pending: 0, won: 0, stake: 0, payout: 0, legN: 0, legHit: 0, evStake: 0, evReturn: 0 });
function add(a, bet, s) {
  a.n++;
  if (s.status === 'pending') { a.pending++; return; }
  a.settled++; a.stake += Number(bet.stake); a.payout += s.payout;
  if (s.status === 'won') a.won++;
  for (const l of s.legs) if (l.result === 'hit' || l.result === 'miss') { a.legN++; if (l.result === 'hit') a.legHit++; }
  if (bet.model_prob != null) { a.evStake += Number(bet.stake); a.evReturn += Number(bet.stake) * Number(bet.model_prob) * Number(bet.total_odds); }
}
const finish = (a) => ({
  n: a.n, settled: a.settled, pending: a.pending, won: a.won,
  stake: a.stake, payout: a.payout, profit: a.payout - a.stake,
  roi: a.stake ? (a.payout - a.stake) / a.stake : null,        // 수익률 (0 = 본전)
  hitRate: a.settled ? a.won / a.settled : null,              // 슬립 적중률
  legRate: a.legN ? a.legHit / a.legN : null,                 // 레그(게임) 적중률
  legN: a.legN, legHit: a.legHit,
  expRoi: a.evStake ? (a.evReturn - a.evStake) / a.evStake : null, // 모델이 기대한 수익률 (확정 슬립 기준)
});
export const legBucket = (n) => (n <= 1 ? '단폴' : n === 2 ? '2폴' : n === 3 ? '3폴' : '4폴+');

/**
 * 배팅 기록 집계: 전체 / 회차별 / 폴더 수별.
 * @param {Array} bets settleBet 입력 형태 + round_gm_ts
 */
export function summarizeBets(bets) {
  const total = blank(); const byRound = {}; const byLegs = {};
  for (const b of bets) {
    const s = settleBet(b);
    add(total, b, s);
    const r = b.round_gm_ts ?? 'unknown'; (byRound[r] ||= blank()); add(byRound[r], b, s);
    const k = legBucket((b.legs || []).length); (byLegs[k] ||= blank()); add(byLegs[k], b, s);
  }
  return {
    total: finish(total),
    byRound: Object.entries(byRound).map(([k, a]) => ({ key: k, ...finish(a) })).sort((x, y) => Number(y.key) - Number(x.key)),
    byLegs: ['단폴', '2폴', '3폴', '4폴+'].filter((k) => byLegs[k]).map((k) => ({ key: k, ...finish(byLegs[k]) })),
  };
}
