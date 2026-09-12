/**
 * roundView.js — 회차 상세를 화면용 뷰 데이터로 변환 (순수함수).
 * DB(대진/투표율/결과) + 계산(캘리브레이션/규칙/티켓빌더/조합)을 결합.
 * 원본 인사이트 HTML의 M[] 구조를 실데이터로 재현.
 */
import { calibrateVotes } from './calibration.js';
import { evaluateMatch } from './rules.js';
import { rankProbs, combosFromDoubles, buildTicket } from './combinatorics.js';

const KO = ['승', '무', '패'];
const KO_IDX = { 승: 0, 무: 1, 패: 2 };
const ANCHOR_MIN = 80; // 초강세 홈 단식 기준(%)

/** 경기별 분석 근거 문장 생성 (규칙 기반 자동). */
function buildReason(r) {
  const cr = r.crowd, mo = r.model;
  const parts = [];

  // 1) 크라우드 vs 모델 괴리 (홈승)
  const gapH = Math.round(cr[0] - mo[0]);
  if (Math.abs(gapH) >= 8) {
    parts.push(
      `대중 홈 ${cr[0]}% vs 모델 ${mo[0]}% — 홈 ${gapH > 0 ? '과대' : '과소'}평가(${Math.abs(gapH)}%p)${gapH >= 12 ? ', 페이드 후보' : ''}`
    );
  }

  // 2) 마킹 방향/이유
  const arr = [[0, mo[0]], [1, mo[1]], [2, mo[2]]].sort((a, b) => b[1] - a[1]);
  const gap = arr[0][1] - arr[1][1];
  if (r.markIdx.length === 1) {
    parts.push(`${KO[r.markIdx[0]]} 우세(${mo[r.markIdx[0]]}%)로 단식`);
    if (r.tag === '★') parts.push('클래스 격차 확실 → 앵커');
  } else {
    parts.push(`${r.marks.join('·')} 근소(1·2위 ${gap}%p차)로 더블 헤지`);
  }

  // 3) favorite-longshot: 저평가 무/원정 흡수
  if (r.markIdx.includes(1) && mo[1] >= cr[1] + 5) parts.push('무 저평가 흡수');
  if (r.markIdx.includes(2) && mo[2] >= cr[2] + 5) parts.push('원정 저평가 흡수');

  return parts.join(' · ');
}

export function buildRoundView(round, matches, { targetDoubles = 5 } = {}) {
  // 1) 경기별 기본 계산 (캘리브레이션 + 규칙 확률보정)
  const parseManual = (s) => {
    if (!s) return null;
    const idx = String(s).split(',').map((x) => KO_IDX[x.trim()]).filter((x) => x != null);
    return idx.length ? idx : null;
  };

  const base = matches.map((m) => {
    const newsReason = m.news_reason || null;
    const manualMarks = parseManual(m.manual_marks);
    if (!m.vote) {
      return { no: m.match_no, home: m.home, away: m.away, league: m.league, hasVote: false, result: m.result, newsReason };
    }
    const crowd = [m.vote.vote_h, m.vote.vote_d, m.vote.vote_l];
    const ev = evaluateMatch(calibrateVotes(crowd[0], crowd[1], crowd[2]), { league: m.league });
    const model = [ev.probs.pWin, ev.probs.pDraw, ev.probs.pLose].map((x) => Math.round(x));
    return {
      no: m.match_no, home: m.home, away: m.away, league: m.league,
      hasVote: true, crowd, model, _ev: ev, newsReason, manualMarks,
      result: m.result, resultIdx: m.result != null ? KO_IDX[m.result] : null,
    };
  });

  const voted = base.filter((r) => r.hasVote);

  // 2) 티켓 빌더 (32조합=5더블 기본) + 관리자 수동 오버라이드(forced)
  const models = voted.map((r) => r.model);
  const ruleDoubleIdx = voted.map((r, i) => (r._ev.kind === 'double' ? i : -1)).filter((i) => i >= 0);
  const anchorIdx = voted
    .map((r, i) => {
      const a = [[0, r.model[0]], [1, r.model[1]], [2, r.model[2]]].sort((x, y) => y[1] - x[1]);
      return a[0][0] === 0 && a[0][1] >= ANCHOR_MIN ? i : -1;
    })
    .filter((i) => i >= 0);
  const forced = {};
  voted.forEach((r, i) => { if (r.manualMarks) forced[i] = r.manualMarks; });
  const ticket = buildTicket(models, { targetDoubles, ruleDoubleIdx, anchorIdx, forced });

  // 3) 티켓 마킹 반영 + 근거 생성
  let vi = 0;
  const rows = base.map((r) => {
    if (!r.hasVote) return r;
    const markIdx = ticket[vi++];
    const marks = markIdx.map((k) => KO[k]);
    const kind = markIdx.length >= 2 ? 'double' : 'single';
    const a = [[0, r.model[0]], [1, r.model[1]], [2, r.model[2]]].sort((x, y) => y[1] - x[1]);
    const tag = kind === 'single' && a[0][0] === 0 && a[0][1] >= ANCHOR_MIN ? '★' : (kind === 'double' ? '◆' : '');
    const manual = !!r.manualMarks;
    const row = { ...r, markIdx, marks, kind, tag, manual };
    row.reason = (manual ? '✋ 관리자 수동 조정 · ' : '') + buildReason(row);
    delete row._ev;
    delete row.manualMarks;
    return row;
  });

  // 4) 확률 배열 + 요약
  const pb = voted.map((r) => {
    const t = r.model[0] + r.model[1] + r.model[2];
    return t > 0 ? r.model.map((x) => x / t) : [1 / 3, 1 / 3, 1 / 3];
  });
  const markIdxList = ticket;
  const coverProbs = markIdxList.map((mk, i) => mk.reduce((s, k) => s + pb[i][k], 0));
  const doubles = markIdxList.filter((mk) => mk.length >= 2).length;
  const rank = coverProbs.length ? rankProbs(coverProbs) : null;
  const awayCover = markIdxList.filter((mk) => mk.includes(2)).length;
  const anchors = rows.filter((r) => r.tag === '★').length;

  const settled = rows.filter((r) => r.hasVote && r.result);
  const ourHits = settled.filter((r) => r.marks.includes(r.result)).length;
  const crowdHits = settled.filter((r) => {
    const top = KO[r.crowd.indexOf(Math.max(...r.crowd))];
    return top === r.result;
  }).length;

  const summary = {
    total: rows.length,
    voted: voted.length,
    combos: combosFromDoubles(doubles),
    doubles, singles: voted.length - doubles,
    p1: rank ? rank.g0 : 0,
    within3: rank ? rank.within3 : 0,
    awayCover, anchors,
    settled: settled.length, ourHits, crowdHits,
    targetDoubles,
  };

  return { round, rows, summary, pb, markIdxList };
}
