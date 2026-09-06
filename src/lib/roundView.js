/**
 * roundView.js — 회차 상세를 화면용 뷰 데이터로 변환 (순수함수).
 * DB(대진/투표율/결과) + 계산(캘리브레이션/규칙/조합)을 결합.
 * 원본 인사이트 HTML의 M[] 구조를 실데이터로 재현.
 */
import { calibrateVotes } from './calibration.js';
import { evaluateMatch } from './rules.js';
import { rankProbs, combosFromDoubles } from './combinatorics.js';

const KO_IDX = { 승: 0, 무: 1, 패: 2 };

/** 마킹 커버 확률: 마킹된 결과들의 모델확률 합 (0~1) */
function coverProb(markIdx, model) {
  const p = [model.pWin, model.pDraw, model.pLose];
  const tot = p[0] + p[1] + p[2];
  if (tot <= 0) return 0;
  return markIdx.reduce((s, k) => s + p[k] / tot, 0);
}

/**
 * @param {object} round
 * @param {Array} matches getRoundDetail().matches
 * @returns {{round, rows, summary, pb}}
 */
export function buildRoundView(round, matches) {
  const rows = matches.map((m) => {
    if (!m.vote) {
      return {
        no: m.match_no, home: m.home, away: m.away, league: m.league,
        hasVote: false, result: m.result,
      };
    }
    const crowd = [m.vote.vote_h, m.vote.vote_d, m.vote.vote_l];
    const model = evaluateMatch(calibrateVotes(crowd[0], crowd[1], crowd[2]), { league: m.league });
    const markIdx = model.marks.map((k) => KO_IDX[k]);
    const mp = [model.probs.pWin, model.probs.pDraw, model.probs.pLose];
    const tag = model.kind === 'double' ? '◆'
      : (model.marks[0] === '승' && model.probs.pWin >= 70 ? '★' : '');
    return {
      no: m.match_no, home: m.home, away: m.away, league: m.league,
      hasVote: true,
      crowd,                                  // 투표율 [승,무,패]
      model: mp.map((x) => Math.round(x)),    // 모델확률 [승,무,패]
      marks: model.marks,                     // ['승'] | ['승','무']
      markIdx,                                // [0] | [0,1]
      kind: model.kind, reason: model.reason, tag,
      result: m.result,
      resultIdx: m.result != null ? KO_IDX[m.result] : null,
    };
  });

  // 확률 배열(정규화, 시뮬레이터/등수용) — 투표율 있는 경기만
  const voted = rows.filter((r) => r.hasVote);
  const pb = voted.map((r) => {
    const t = r.model[0] + r.model[1] + r.model[2];
    return t > 0 ? [r.model[0] / t, r.model[1] / t, r.model[2] / t] : [1 / 3, 1 / 3, 1 / 3];
  });
  const markIdxList = voted.map((r) => r.markIdx);

  // 등수/조합 요약
  const coverProbs = markIdxList.map((mk, i) => {
    const [h, d, l] = pb[i];
    return mk.reduce((s, k) => s + [h, d, l][k], 0);
  });
  const doubles = markIdxList.filter((mk) => mk.length >= 2).length;
  const rank = coverProbs.length ? rankProbs(coverProbs) : null;
  const awayCover = markIdxList.filter((mk) => mk.includes(2)).length;
  const anchors = rows.filter((r) => r.tag === '★').length;

  // 결과 KPI
  const settled = rows.filter((r) => r.hasVote && r.result);
  const ourHits = settled.filter((r) => r.marks.includes(r.result)).length;
  const crowdHits = settled.filter((r) => {
    const top = ['승', '무', '패'][r.crowd.indexOf(Math.max(...r.crowd))];
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
  };

  return { round, rows, summary, pb, markIdxList };
}
