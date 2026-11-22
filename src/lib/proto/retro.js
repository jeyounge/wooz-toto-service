/**
 * retro.js — 프로토 예측 자동 복기 (순수함수, 규칙 기반 · LLM 없음).
 *
 * 결과 확정된 예측 1건마다 실패 원인 태그를 붙이고, 회차 단위로 "어디서 왜 틀렸나"를 요약한다.
 * 판정은 세 갈래:
 *   luck  (변수)  막판골·PK·퇴장으로 결과가 바뀌었거나, 픽한 팀이 경기 내용(슈팅)에서 압도하고도 못 이김, 오버 픽인데 슈팅만 쏟아짐
 *   close (근소)  핸디·언오버 기준선과 1골(농구 3점) 이내, 또는 50:50에 가까운 픽(홀짝 등)
 *   read  (판단)  위 둘이 아님 → 우리가 경기를 잘못 읽은 것. 복기 대상은 주로 여기.
 *
 * 점수 형식(베트맨 mchScore): 승무패·승패 행 = 실제 스코어(배구는 세트), 핸디 행 = (홈+핸디):원정, 언오버·홀짝 행 = 총점:0.
 * 전반전 마켓(K리그 등)은 같은 경기라도 전반 스코어 기준이라 풀타임 행과 섞지 않는다.
 */
import { isHit } from './predict.js';
import { isFirstHalf, typeLabel } from './accuracy.js';

export const TAGS = {
  late_goal: { label: '막판골', verdict: 'luck', desc: '85분 이후 골이 없었다면 적중' },
  penalty: { label: 'PK 결정', verdict: 'luck', desc: 'PK 골을 빼면 적중' },
  red_card: { label: '퇴장', verdict: 'luck', desc: '픽한 쪽(또는 경기 전체) 퇴장 발생' },
  dominated: { label: '내용 우세', verdict: 'luck', desc: '픽한 팀이 슈팅에서 압도하고도 실패' },
  wasteful: { label: '기회 무산', verdict: 'luck', desc: '오버 픽인데 양 팀 유효슈팅 10개 이상' },
  margin: { label: '한 끗', verdict: 'close', desc: '핸디·기준점과 1골(농구 3점) 이내' },
  coin: { label: '박빙', verdict: 'close', desc: '픽 확률 55% 미만 (홀짝 포함)' },
  upset: { label: '정배 이변', verdict: null, desc: '픽 확률 70% 이상 실패' },
  draw_trap: { label: '무 미커버', verdict: null, desc: '승무패에서 무' },
  overheat: { label: '과열 붕괴', verdict: null, desc: '국내과열 플래그 정배 실패' },
};
export const VERDICTS = {
  luck: { label: '변수', desc: '막판골·PK·퇴장·내용 우세' },
  close: { label: '근소', desc: '한 끗 차이·박빙' },
  read: { label: '판단 실패', desc: '경기를 잘못 읽음 — 복기 대상' },
};
const OPT = ['승', '무', '패'];

export const parseScore = (s) => {
  const m = String(s ?? '').match(/^(-?[\d.]+):(-?[\d.]+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/**
 * 같은 경기(홈·원정·킥오프) 행들에서 실제 스코어 복원 — 같은 기간(전반/풀타임) 행만.
 * 승무패·승패 행이 있으면 그대로, 없으면 핸디 행에서 핸디를 빼서.
 */
export function rawScoreOf(allRows, half = false) {
  const rows = allRows.filter((r) => isFirstHalf(r) === half);
  const base = rows.find((r) => (r.bet_type_id === '1' || r.bet_type_id === '2') && r.result_score);
  if (base) return parseScore(base.result_score);
  const h = rows.find((r) => (r.bet_type_id === '4' || r.bet_type_id === '5') && r.result_score);
  const s = h && parseScore(h.result_score);
  return s ? [s[0] - Number(h.handi || 0), s[1]] : null;
}

/** 실제 스코어 → 해당 베팅유형의 결과 인덱스 (지원 안 하는 유형은 null) */
export function outcomeIdx(betTypeId, h, a, handi = 0) {
  const t = String(betTypeId);
  if (t === '1') return h > a ? 0 : h === a ? 1 : 2;
  if (t === '2') return h > a ? 0 : 2;
  if (t === '4' || t === '5') { const d = h + Number(handi) - a; return d > 0 ? 0 : d === 0 ? 1 : 2; }
  if (t === '7') { const tot = h + a; return tot < Number(handi) ? 0 : tot > Number(handi) ? 2 : null; }
  if (t === '9') return (h + a) % 2 === 1 ? 0 : 2;
  return null;
}

const optText = (g, i) => [g.txt_w, g.txt_d, g.txt_l][i] || OPT[i];
const pct = (x) => `${Math.round(Number(x) * 100)}%`;

/**
 * 예측 1건 복기.
 * @param {object} g    proto_games 행 (bet_type_id, handi, result_idx, result_score, sport_code, txt_*)
 * @param {object} p    proto_preds 행 (pick_idx, pick_prob, flags)
 * @param {number[]|null} raw 실제 스코어 [홈, 원정]
 * @param {object|null} ctx  ESPN 경기 기록 { goals:[{min, base, side:'h'|'a', pen}], reds:[{min, side}], shots:{h,a}, sot:{h,a} }
 * @returns {{tags:string[], note:string}|null} 특례·미정이면 null, 적중이면 tags=[]
 */
export function classifyPred(g, p, raw, ctx) {
  const hit = isHit(g.result_idx, p.pick_idx);
  if (hit == null) return null;
  if (hit) return { tags: [], note: null };
  const t = String(g.bet_type_id);
  const tags = [];
  const shown = ['7', '9'].includes(String(g.bet_type_id)) && g.sport_code !== 'SC' ? `총점 ${parseScore(g.result_score)?.[0] ?? '-'}` : raw ? `${raw[0]}:${raw[1]}` : '';
  const bits = [`픽 ${optText(g, p.pick_idx)} ${pct(p.pick_prob)} → ${optText(g, g.result_idx)}${shown ? ` ${shown}` : ''}${isFirstHalf(g) ? ' (전반)' : ''}`];
  const bk = g.sport_code === 'BK';
  const unit = bk ? 3 : 1;
  // 언오버·홀짝은 자기 행의 총점 (배구 승패 스코어는 세트라 못 쓴다)
  const total = ['7', '9'].includes(t) ? parseScore(g.result_score)?.[0] : raw ? raw[0] + raw[1] : null;

  // ---- 경기 기록 기반 (ESPN 매칭된 풀타임 축구, 홀짝 제외) ----
  if (ctx && raw && t !== '9' && !isFirstHalf(g)) {
    const goals = ctx.goals || [];
    const tally = (list) => list.reduce((s, x) => { s[x.side === 'h' ? 0 : 1]++; return s; }, [0, 0]);
    const late = goals.filter((x) => x.base >= 85);
    if (late.length) {
      const before = tally(goals.filter((x) => x.base < 85));
      if (outcomeIdx(t, before[0], before[1], g.handi) === p.pick_idx) {
        tags.push('late_goal');
        bits.push(`${late.map((x) => x.min).join('·')} 골`);
      }
    }
    const pens = goals.filter((x) => x.pen);
    if (pens.length) {
      const noPen = tally(goals.filter((x) => !x.pen));
      if (outcomeIdx(t, noPen[0], noPen[1], g.handi) === p.pick_idx) { tags.push('penalty'); bits.push(`PK ${pens.map((x) => x.min).join('·')}`); }
    }
    const pickSide = ['1', '2', '4', '5'].includes(t) ? (p.pick_idx === 0 ? 'h' : p.pick_idx === 2 ? 'a' : null) : null;
    const reds = (ctx.reds || []).filter((r) => !pickSide || r.side === pickSide);
    if (reds.length) { tags.push('red_card'); bits.push(`퇴장 ${reds.map((r) => `${r.side === 'h' ? '홈' : '원정'} ${r.min}`).join('·')}`); }
    if (pickSide && ctx.shots && ctx.sot) {
      const o = pickSide === 'h' ? 'a' : 'h';
      const [s, so, os, oso] = [ctx.shots[pickSide], ctx.sot[pickSide], ctx.shots[o], ctx.sot[o]];
      if (so >= oso + 3 || (s >= os * 1.6 && s - os >= 8)) tags.push('dominated');
    }
    if (t === '7' && p.pick_idx === 2 && ctx.sot && ctx.sot.h + ctx.sot.a >= 10) tags.push('wasteful');
    if (ctx.shots) bits.push(`슈팅 ${ctx.shots.h}:${ctx.shots.a}${ctx.sot ? ` (유효 ${ctx.sot.h}:${ctx.sot.a})` : ''}`);
  }

  // ---- 스코어 기반 ----
  if (raw && ['4', '5'].includes(t) && Math.abs(raw[0] + Number(g.handi) - raw[1]) <= unit) tags.push('margin');
  if (total != null && t === '7' && Math.abs(total - Number(g.handi)) <= (g.sport_code === 'SC' ? 0.5 : 3)) tags.push('margin');
  if (t === '9' || Number(p.pick_prob) < 0.55) tags.push('coin');
  if (Number(p.pick_prob) >= 0.7) tags.push('upset');
  if (t === '1' && g.result_idx === 1 && p.pick_idx !== 1) tags.push('draw_trap');
  if ((p.flags || []).includes('국내과열')) tags.push('overheat');
  return { tags, note: bits.join(' · ') };
}

/** 태그 → 판정 (luck > close > read) */
export function verdictOf(tags) {
  if (!tags) return null;
  if (tags.some((k) => TAGS[k]?.verdict === 'luck')) return 'luck';
  if (tags.some((k) => TAGS[k]?.verdict === 'close')) return 'close';
  return 'read';
}

/**
 * 회차 복기 요약.
 * @param {Array} games proto_games 행 + pred(miss_tags, retro_note 포함)
 * @returns {{misses:number, hits:number, done:number, verdict:Record<string,number>, tags:Record<string,number>,
 *            weak:Array, strong:Array, worst:Array}}
 */
export function roundRetro(games) {
  const out = { misses: 0, hits: 0, done: 0, verdict: { luck: 0, close: 0, read: 0 }, tags: {}, weak: [], strong: [], worst: [] };
  const seg = {};
  const bump = (k, hit, prob) => { const s = (seg[k] ||= { n: 0, hit: 0, exp: 0 }); s.n++; s.hit += hit ? 1 : 0; s.exp += prob; };
  for (const g of games) {
    const p = g.pred; if (!p) continue;
    const hit = isHit(g.result_idx, p.pick_idx); if (hit == null) continue;
    const prob = Number(p.pick_prob);
    bump(`유형 · ${typeLabel(g)}`, hit, prob);
    bump(`리그 · ${g.sport} ${g.league_short || g.league}`, hit, prob);
    const b = Math.min(9, Math.floor(prob * 10)); bump(`확률 ${b * 10}~${b * 10 + 10}%`, hit, prob);
    if (hit) { out.hits++; continue; }
    out.misses++;
    if (!p.miss_tags) continue; // 아직 복기 전
    out.done++;
    const v = verdictOf(p.miss_tags); out.verdict[v]++;
    for (const k of p.miss_tags) out.tags[k] = (out.tags[k] || 0) + 1;
    if (v === 'read') out.worst.push({ g, prob });
  }
  // 예상 대비 ±8%p 이상 벗어난 구간 (표본 10 이상)
  for (const [k, s] of Object.entries(seg)) {
    if (s.n < 10) continue;
    const r = { key: k, n: s.n, hit: s.hit, rate: s.hit / s.n, exp: s.exp / s.n }; r.diff = r.rate - r.exp;
    if (r.diff <= -0.08) out.weak.push(r); else if (r.diff >= 0.08) out.strong.push(r);
  }
  out.weak.sort((a, b) => a.diff - b.diff); out.strong.sort((a, b) => b.diff - a.diff);
  out.worst = out.worst.sort((a, b) => b.prob - a.prob).slice(0, 10).map((x) => x.g);
  return out;
}
