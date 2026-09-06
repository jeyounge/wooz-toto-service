import { calibrateVotes } from '@/lib/calibration';
import { evaluateMatch } from '@/lib/rules';
import RoundSelector from './RoundSelector';

const RESULT_COLOR = { 승: 'text-home', 무: 'text-draw', 패: 'text-away' };
const RESULT_BG = { 승: 'bg-home', 무: 'bg-draw', 패: 'bg-away' };

function crowdPick(v) {
  if (!v) return null;
  const arr = [['승', v.vote_h], ['무', v.vote_d], ['패', v.vote_l]];
  arr.sort((a, b) => b[1] - a[1]);
  return arr[0][0];
}

/** 확률 3색 누적 바 */
function ProbBar({ pWin, pDraw, pLose }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full">
      <div className="bg-home" style={{ width: `${pWin}%` }} />
      <div className="bg-draw" style={{ width: `${pDraw}%` }} />
      <div className="bg-away" style={{ width: `${pLose}%` }} />
    </div>
  );
}

export default function RoundDashboard({ round, matches, roundsList, currentId }) {
  // 경기별 계산
  const rows = matches.map((m) => {
    const cal = m.vote ? calibrateVotes(m.vote.vote_h, m.vote.vote_d, m.vote.vote_l) : null;
    const evalRes = cal ? evaluateMatch(cal, { league: m.league }) : null;
    const crowd = crowdPick(m.vote);
    const ourHit = m.result && evalRes ? evalRes.marks.includes(m.result) : null;
    const crowdHit = m.result && crowd ? crowd === m.result : null;
    return { ...m, cal: evalRes?.probs ?? cal, marks: evalRes?.marks ?? [], kind: evalRes?.kind, reason: evalRes?.reason, crowd, ourHit, crowdHit };
  });

  // 요약 KPI (결과 있는 경기)
  const settled = rows.filter((r) => r.result);
  const ourHits = settled.filter((r) => r.ourHit).length;
  const crowdHits = settled.filter((r) => r.crowdHit).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">
            {round.season}년 {round.round_no}회차
          </h1>
          <p className="mt-1 font-mono text-xs text-sub">
            {matches.length}경기 · {round.status}
          </p>
        </div>
        <RoundSelector rounds={roundsList} currentId={currentId} />
      </div>

      {/* 요약 KPI */}
      {settled.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-card p-4 text-center">
            <div className="font-mono text-2xl font-bold text-pine">{ourHits}/{settled.length}</div>
            <div className="mt-1 text-xs text-sub">우제 마킹 적중</div>
          </div>
          <div className="rounded-xl border border-line bg-card p-4 text-center">
            <div className="font-mono text-2xl font-bold text-sub">{crowdHits}/{settled.length}</div>
            <div className="mt-1 text-xs text-sub">대중 최고픽 적중</div>
          </div>
          <div className="col-span-2 rounded-xl border border-line bg-card p-4 text-center sm:col-span-1">
            <div className="font-mono text-2xl font-bold text-ink">{ourHits - crowdHits >= 0 ? '+' : ''}{ourHits - crowdHits}</div>
            <div className="mt-1 text-xs text-sub">우제 − 대중</div>
          </div>
        </div>
      )}

      {/* 경기 리스트 */}
      <div className="mt-8 space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-sub">#{r.match_no}</span>
                {r.league && (
                  <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[10px] text-sub">{r.league}</span>
                )}
              </div>
              {r.result && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold text-white ${RESULT_BG[r.result]}`}>
                  결과 {r.result}
                </span>
              )}
            </div>

            {/* 대진 */}
            <div className="mt-2 flex items-center justify-between font-display text-base font-bold text-ink">
              <span className="flex-1">{r.home}</span>
              <span className="px-2 font-mono text-xs text-sub">vs</span>
              <span className="flex-1 text-right">{r.away}</span>
            </div>

            {r.cal ? (
              <>
                {/* 확률 바 */}
                <div className="mt-3"><ProbBar {...r.cal} /></div>
                <div className="mt-1 flex justify-between font-mono text-xs">
                  <span className="text-home">승 {r.cal.pWin.toFixed(0)}%</span>
                  <span className="text-draw">무 {r.cal.pDraw.toFixed(0)}%</span>
                  <span className="text-away">패 {r.cal.pLose.toFixed(0)}%</span>
                </div>
                {/* 투표율 */}
                <div className="mt-1 flex justify-between font-mono text-[10px] text-sub">
                  <span>투표 {r.vote.vote_h}</span>
                  <span>{r.vote.vote_d}</span>
                  <span>{r.vote.vote_l}</span>
                </div>

                {/* 마킹 */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="font-mono text-xs text-sub">우제:</span>
                  {r.marks.map((mk) => {
                    const hit = r.result ? (mk === r.result ? 'ring-2 ring-offset-1' : '') : '';
                    return (
                      <span key={mk} className={`rounded px-2 py-0.5 text-xs font-bold text-white ${RESULT_BG[mk]} ${hit}`}>
                        {mk}
                      </span>
                    );
                  })}
                  <span className="font-mono text-[10px] text-sub">
                    {r.kind === 'double' ? '더블' : '단식'}
                    {r.result && (r.ourHit ? ' · ✅' : ' · ❌')}
                  </span>
                </div>
                {r.reason && <p className="mt-1 font-mono text-[10px] text-sub">↳ {r.reason}</p>}
              </>
            ) : (
              <p className="mt-3 font-mono text-xs text-sub">투표율 데이터 없음</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
