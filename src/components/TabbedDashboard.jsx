"use client";
import { useState, useMemo } from 'react';
import RoundSelector from './RoundSelector';
import { saveFinalPick } from '@/app/actions/finalPick';
import { rankProbs, combosFromMarks } from '@/lib/combinatorics';
import { RULES, LESSONS, AWAY_COVER, BASE_RATES, CAL_VX, CAL_VY } from '@/lib/methodology';

const OL = ['승', '무', '패'];
const BG = ['bg-home', 'bg-draw', 'bg-away'];
const TX = ['text-home', 'text-draw', 'text-away'];

/** 3색 누적 바 */
function Bar3({ p }) {
  const t = p[0] + p[1] + p[2] || 1;
  return (
    <div className="flex h-[7px] w-24 overflow-hidden rounded border border-line">
      <span className="bg-home" style={{ width: `${(p[0] / t) * 100}%` }} />
      <span className="bg-draw" style={{ width: `${(p[1] / t) * 100}%` }} />
      <span className="bg-away" style={{ width: `${(p[2] / t) * 100}%` }} />
    </div>
  );
}

function MarkChips({ idxs, resultIdx }) {
  return (
    <span className="flex flex-wrap gap-1">
      {idxs.map((k) => {
        const decided = resultIdx != null;
        const hit = decided && idxs.includes(resultIdx);
        const cls = decided ? (hit ? (k === resultIdx ? 'ring-2 ring-offset-1 ring-pine' : 'opacity-40 line-through') : 'opacity-40 line-through') : '';
        return <span key={k} className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${BG[k]} ${cls}`}>{OL[k]}</span>;
      })}
    </span>
  );
}

/** 인터랙티브 시뮬레이터 (메인/위성 공용) */
function Simulator({ title, subtitle, voted, pb, initialMarks, accent = 'pine', resetLabel = '복원', whys = {}, canSaveFinal = false, roundId = null }) {
  const [sim, setSim] = useState(() => initialMarks.map((mk) => [...mk]));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const onSaveFinal = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const picks = voted.map((r, i) => ({ no: r.no, marks: [...sim[i]].sort().map((k) => OL[k]).join('') }));
      const res = await saveFinalPick({ roundId, picks, note });
      setSaveMsg(res);
    } catch (e) {
      setSaveMsg({ ok: false, message: `저장 실패: ${e.message}` });
    } finally { setSaving(false); }
  };
  const result = useMemo(() => {
    if (sim.some((mk) => !mk.length)) return null;
    const coverProbs = sim.map((mk, i) => mk.reduce((s, k) => s + pb[i][k], 0));
    return { ...rankProbs(coverProbs), combos: combosFromMarks(sim) };
  }, [sim, pb]);
  const toggle = (i, k) => setSim((prev) => {
    const n = prev.map((mk) => [...mk]);
    const p = n[i].indexOf(k);
    if (p >= 0) { if (n[i].length > 1) n[i].splice(p, 1); } else n[i].push(k);
    n[i].sort();
    return n;
  });
  const expMiss = result ? (voted.length - sim.reduce((s, mk, i) => s + mk.reduce((a, k) => a + pb[i][k], 0), 0)) : 0;
  const border = accent === 'away' ? 'border-away' : 'border-pine';

  return (
    <div className="mt-8">
      <h2 className="font-display text-base font-bold text-ink">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-sub">{subtitle}</p>}
      <div className="mt-3 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-line bg-card p-4">
          {voted.map((r, i) => (
            <div key={r.no} className="flex items-center gap-2 border-b border-line py-1.5">
              <span className="flex-1 text-xs" title={whys[r.no] || undefined}>{r.no}. {r.home} <span className="text-sub">v</span> {r.away}{whys[r.no] && <span className="ml-1 text-pine">ⓘ</span>}</span>
              <span className="w-16 font-mono text-[10px] text-sub">{r.model.join('/')}</span>
              {[0, 1, 2].map((k) => (
                <button key={k} onClick={() => toggle(i, k)}
                  className={`h-7 w-8 rounded border font-mono text-[11px] font-bold ${sim[i].includes(k) ? `${BG[k]} border-transparent text-white` : 'border-line bg-paper text-sub'}`}>{OL[k]}</button>
              ))}
            </div>
          ))}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => setSim(initialMarks.map((mk) => [...mk]))} className="rounded border border-line px-3 py-1 font-mono text-xs text-sub hover:bg-paper">{resetLabel}</button>
            {canSaveFinal && (
              <>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택) — 왜 이렇게 골랐는지"
                  className="min-w-[180px] flex-1 rounded border border-line bg-paper px-2 py-1 text-xs text-ink placeholder:text-sub" />
                <button onClick={onSaveFinal} disabled={saving}
                  className="rounded bg-pine px-3 py-1 font-mono text-xs font-bold text-white disabled:opacity-50">
                  {saving ? '저장 중…' : '🙋 내 최종 픽으로 저장'}
                </button>
              </>
            )}
          </div>
          {saveMsg && <p className={`mt-2 text-xs ${saveMsg.ok ? 'text-pine' : 'text-away'}`}>{saveMsg.message}</p>}
          {canSaveFinal && <p className="mt-1 text-[11px] text-sub">현재 마킹 그대로 저장됩니다. 결과가 나오면 분석 티켓과 적중이 나란히 비교됩니다.</p>}
        </div>
        <div className={`h-fit rounded-xl border ${border} bg-card p-5 lg:sticky lg:top-20`}>
          <div className="font-display text-3xl font-bold text-ink">{result ? result.combos : '—'}</div>
          <div className="mb-3 font-mono text-xs text-sub">조합 · {result ? (result.combos * 1000).toLocaleString() : 0}원</div>
          <div className="flex justify-between border-b border-line py-2 text-sm"><span>1등 확률 (G0)</span><b className="font-mono">{result ? (result.g0 * 100).toFixed(3) + '%' : '—'}</b></div>
          <div className="flex justify-between border-b border-line py-2 text-sm"><span>4등내 (≤3틀림)</span><b className="font-mono">{result ? (result.within3 * 100).toFixed(1) + '%' : '—'}</b></div>
          <div className="flex justify-between py-2 text-sm"><span>기대 틀림</span><b className="font-mono">{result ? expMiss.toFixed(2) + '개' : '—'}</b></div>
          {!result && <p className="mt-2 text-xs font-semibold text-away">각 경기 최소 1개 마킹 필요</p>}
        </div>
      </div>
    </div>
  );
}

/** 티켓 선택 + 시뮬레이터. 버튼으로 27/32/8조합 등을 바꿔 보면 마킹이 그 티켓으로 초기화된다. */
function TicketSimulator({ options, voted, pb, canSaveFinal = false, roundId = null }) {
  const [sel, setSel] = useState(options[0]?.id);
  const cur = options.find((o) => o.id === sel) || options[0];
  if (!cur) return null;
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-display text-base font-bold text-ink">티켓 시뮬레이터</h2>
        {options.map((o) => (
          <button key={o.id} onClick={() => setSel(o.id)}
            className={`rounded-full border px-3 py-1 font-mono text-xs font-bold ${o.id === cur.id ? (o.accent === 'away' ? 'border-away bg-away text-white' : 'border-pine bg-pine text-white') : 'border-line bg-card text-sub hover:text-ink'}`}>
            {o.label}
          </button>
        ))}
      </div>
      <Simulator
        key={cur.id}
        title={cur.title}
        subtitle={`${cur.final ? '내가 최종 결정한 픽입니다(분석 티켓과 결과를 비교해 복기에 씁니다). ' : ''}${cur.note ? cur.note + ' ' : ''}마킹을 토글하면 조합수·등수 확률이 실시간 재계산됩니다. 숫자 = 모델 승/무/패 확률(%).`}
        voted={voted} pb={pb} initialMarks={cur.marks} accent={cur.accent} resetLabel="이 티켓으로 복원" whys={cur.whys}
        canSaveFinal={canSaveFinal} roundId={roundId}
      />
    </div>
  );
}

export default function TabbedDashboard({ view, roundsList, currentId, canSaveFinal = false }) {
  const { round, rows, summary, pb, markIdxList, satellite, storedTickets = [] } = view;
  const voted = useMemo(() => rows.filter((r) => r.hasVote), [rows]);
  const [tab, setTab] = useState('p1');
  const [track, setTrack] = useState(() => voted.map(() => null));

  const TABS = [
    ['p1', '🎯 대진 · 마킹'], ['p2', '🔬 경기별 분석'],
    ['p3', '🎫 티켓 · 조합수학'], ['p4', '📋 방법론 · 규칙적용'],
  ];

  // 실시간 추적: 메인 마킹 대비
  const trackStat = useMemo(() => {
    let decided = 0, wrong = 0;
    track.forEach((r, i) => {
      if (r == null) return;
      decided++;
      if (!markIdxList[i].includes(r)) wrong++;
    });
    const rank = wrong === 0 ? (decided === voted.length ? '🥇 1등 (0틀림)' : '생존') : `${wrong}틀림 → ${wrong <= 3 ? wrong + 1 + '등권' : '권외'}`;
    return { decided, wrong, rank };
  }, [track, markIdxList, voted.length]);

  const satMarkIdx = satellite ? satellite.rows.map((r) => r.markIdx) : [];
  const simOptions = useMemo(() => {
    if (storedTickets.length) {
      return storedTickets.map((t) => ({
        id: `t${t.id}`,
        label: t.isFinal ? `🙋 ${t.combos}조합` : `${t.combos}조합`,
        title: t.label,
        note: t.note,
        marks: t.rows.map((r) => r.markIdx),
        whys: Object.fromEntries(t.rows.filter((r) => r.why).map((r) => [r.no, r.why])),
        accent: t.isFinal ? 'pine' : (t.kind === 'satellite' ? 'away' : 'pine'),
        final: t.isFinal,
      }));
    }
    const list = [{ id: 'main', label: `${summary.combos}조합`, title: '메인 (자동 엔진)', note: '조합 예산 안에서 14경기 전부 커버할 확률이 가장 높게 배분.', marks: markIdxList, whys: {}, accent: 'pine' }];
    if (satellite) list.push({ id: 'sat', label: `${satellite.combos}조합`, title: '위성 (이변 헌터)', note: '이변 조건이 강한 경기에 최하위 인기 픽을 박는 티켓.', marks: satMarkIdx, whys: {}, accent: 'away' });
    return list;
  }, [storedTickets, summary.combos, markIdxList, satellite, satMarkIdx]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-pine">축구토토 승무패 · {round.season}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold text-ink">{round.round_no}회차 인사이트</h1>
        </div>
        <RoundSelector rounds={roundsList} currentId={currentId} />
      </div>

      {/* 탭 네비 */}
      <div className="mt-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 font-display text-sm font-semibold transition-colors ${tab === id ? 'border-pine text-pine' : 'border-transparent text-sub hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ===== TAB1 ===== */}
      {tab === 'p1' && (
        <div className="mt-6">
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['메인 조합', String(summary.combos), `${summary.singles}단식 + ${summary.doubles}더블 + ${summary.triples}트리플`],
              ['1등 확률', `${(summary.p1 * 100).toFixed(2)}%`, 'Poisson-binomial'],
              ['4등내', `${(summary.within3 * 100).toFixed(1)}%`, '≤3틀림'],
              ['앵커(★)', `${summary.anchors}개`, '초강세 단식'],
              ['패 커버', `${summary.awayCover}경기`, `최소 ${AWAY_COVER.MIN_AWAY_COVER}`],
              ['경기', `${summary.voted}`, `${round.status}`],
            ].map(([k, v, s]) => (
              <div key={k} className="rounded-xl border border-line bg-card p-4">
                <div className="text-xs text-sub">{k}</div>
                <div className="mt-2 font-display text-2xl font-bold text-ink">{v}</div>
                <div className="mt-1 text-[11px] text-sub">{s}</div>
              </div>
            ))}
          </div>

          {/* 실시간 추적 */}
          <div className="mt-6 rounded-xl border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">🔴 실시간 적중 추적 (메인 {summary.combos}조합)</div>
              <button onClick={() => setTrack(voted.map(() => null))} className="rounded border border-line px-2 py-1 font-mono text-[11px] text-sub hover:bg-paper">초기화</button>
            </div>
            <p className="mt-1 text-[11px] text-sub">각 경기 결과를 누르면 마킹 적중/틀림과 잠정 등수가 계산됩니다.</p>
            <div className="mt-3 inline-block rounded-lg border border-line bg-paper px-4 py-2">
              <span className="font-display text-lg font-bold text-ink">{trackStat.decided ? trackStat.rank : '대기중'}</span>
              <span className="ml-3 font-mono text-xs text-sub">판정 {trackStat.decided}/{voted.length} · 틀림 {trackStat.wrong}</span>
            </div>
          </div>

          {/* 메인 테이블 */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-sub">
                  <th className="px-3 py-2">#</th><th className="px-3 py-2">경기</th><th className="px-3 py-2">리그</th>
                  <th className="px-3 py-2">크라우드</th><th className="px-3 py-2">모델</th>
                  <th className="px-3 py-2">마킹</th><th className="px-3 py-2">결과입력</th>
                </tr>
              </thead>
              <tbody>
                {voted.map((r, i) => (
                  <tr key={r.no} className="border-b border-line/60">
                    <td className="px-3 py-2 font-mono">{r.no}{r.tag && <b className="ml-1 text-pine">{r.tag}</b>}</td>
                    <td className="px-3 py-2"><b className="text-ink">{r.home}</b> <span className="text-sub">v</span> {r.away}</td>
                    <td className="px-3 py-2"><span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-sub">{r.league}</span></td>
                    <td className="px-3 py-2"><div className="flex items-center gap-1"><Bar3 p={r.crowd} /><span className="font-mono text-[10px] text-sub">{r.crowd.join('/')}</span></div></td>
                    <td className="px-3 py-2"><div className="flex items-center gap-1"><Bar3 p={r.model} /><span className="font-mono text-[10px] text-sub">{r.model.join('/')}</span></div></td>
                    <td className="px-3 py-2"><MarkChips idxs={r.markIdx} resultIdx={track[i]} /></td>
                    <td className="px-3 py-2">
                      <span className="flex gap-1">
                        {[0, 1, 2].map((k) => (
                          <button key={k} onClick={() => setTrack((p) => p.map((v, idx) => idx === i ? (v === k ? null : k) : v))}
                            className={`h-6 w-6 rounded border font-mono text-[11px] ${track[i] === k ? `${BG[k]} border-transparent text-white` : 'border-line bg-paper text-sub'}`}>{OL[k]}</button>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-sub">★=앵커(단식 고정) · ◆=더블 · 🎲=트리플(승무패 전부) · 막대=<span className="text-home">승</span>/<span className="text-draw">무</span>/<span className="text-away">패</span>. 크라우드=투표율, 모델=캘리브레이션.</p>

          {/* 괴리 (크라우드 vs 모델 홈승%) */}
          <div className="mt-6">
            <h2 className="font-display text-base font-bold text-ink">크라우드 vs 모델 — 홈승 확률 괴리 (favorite-longshot)</h2>
            <div className="mt-3 space-y-1.5 rounded-xl border border-line bg-card p-4">
              {voted.map((r) => {
                const gap = r.crowd[0] - r.model[0];
                return (
                  <div key={r.no} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 truncate font-mono text-sub">{r.no}.{r.home}</span>
                    <div className="relative h-3 flex-1 rounded bg-paper">
                      <div className="absolute inset-y-0 left-0 rounded bg-away/70" style={{ width: `${r.crowd[0]}%` }} />
                      <div className="absolute inset-y-0 left-0 rounded bg-home" style={{ width: `${r.model[0]}%`, opacity: 0.6 }} />
                    </div>
                    <span className={`w-12 shrink-0 text-right font-mono ${Math.abs(gap) >= 12 ? 'font-bold text-away' : 'text-sub'}`}>{gap > 0 ? '+' : ''}{gap}</span>
                  </div>
                );
              })}
              <p className="pt-2 text-[11px] text-sub"><span className="text-away">■</span> 크라우드 홈승% · <span className="text-home">■</span> 모델 홈승%. 우측 숫자 = 괴리(+면 대중 과대평가 → 페이드 후보).</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB2 ===== */}
      {tab === 'p2' && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {voted.map((r) => (
            <div key={r.no} className="rounded-xl border border-line bg-card p-4" style={{ borderLeft: `4px solid var(--none)` }}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-base font-bold text-ink">{r.no}. {r.home} <span className="font-normal text-sub">v</span> {r.away} {r.tag && <span className="text-pine">{r.tag}</span>}</h3>
                <MarkChips idxs={r.markIdx} resultIdx={r.resultIdx} />
              </div>
              <div className="mt-1 font-mono text-[11px] text-sub">{r.league} · 크라우드 {r.crowd.join('/')} · 모델 {r.model.join('/')}</div>
              <p className="mt-2 text-xs leading-relaxed text-sub">↳ {r.reason}</p>
              {r.newsReason && (
                <div className="mt-2 rounded-lg bg-paper p-2.5 text-xs leading-relaxed text-ink">
                  <span className="font-semibold text-pine">🔎 뉴스 분석</span>
                  <p className="mt-1 whitespace-pre-line">{r.newsReason}</p>
                </div>
              )}
              {r.result && <p className="mt-2 font-mono text-[11px] text-ink">결과: <b className={TX[r.resultIdx]}>{r.result}</b> {r.marks.includes(r.result) ? '✅' : '❌'}</p>}
            </div>
          ))}
          <p className="col-span-full mt-2 text-[11px] text-sub">※ 규칙엔진 근거 + AI 뉴스 분석(관리자가 뉴스 반영 재분석 실행 시). 뉴스가 없으면 규칙 근거만 표기됩니다.</p>
        </div>
      )}

      {/* ===== TAB3 ===== */}
      {tab === 'p3' && (
        <div className="mt-6">
<div className="grid gap-4 md:grid-cols-2">
            {/* 메인 */}
            <div className="rounded-xl border border-line bg-card p-5" style={{ borderTop: '4px solid var(--pine)' }}>
              <div className="font-mono text-xs font-bold text-pine">메인 · {summary.combos}조합</div>
              <h3 className="mt-1 font-display text-xl font-bold text-ink">{summary.singles}단식 + {summary.doubles}더블 + {summary.triples}트리플</h3>
              <div className="mt-1 font-mono text-xs text-sub">1등 {(summary.p1 * 100).toFixed(3)}% · 4등내 {(summary.within3 * 100).toFixed(1)}% · 패커버 {summary.awayCover}</div>
              <p className="mt-2 text-[11px] text-sub">조합 예산 안에서 <b>4등내(11개 이상 적중)</b> 확률이 가장 높게 배분한다. 1등(14개)은 예산을 늘려도 0.05%대라 사실상 살 수 없지만, 4등내는 예산에 비례해 오른다(32조합 약 12%). 애매한 경기는 승무패 전부(🎲)로 확정.</p>
            </div>
            {/* 위성 */}
            {satellite && (
              <div className="rounded-xl border border-line bg-card p-5" style={{ borderTop: '4px solid var(--away)' }}>
                <div className="font-mono text-xs font-bold text-away">위성 · {satellite.combos}조합</div>
                <h3 className="mt-1 font-display text-xl font-bold text-ink">{satellite.singles}단식 + {satellite.doubles}더블 · 이변픽 {satellite.upsetPicks}</h3>
                <div className="mt-1 font-mono text-xs text-sub">1등 {(satellite.p1 * 100).toFixed(3)}% · 4등내 {(satellite.within3 * 100).toFixed(1)}% · 무{satellite.drawCover}·패{satellite.awayCover} 커버</div>
                <p className="mt-2 text-[11px] text-sub">이변 헌터 — 역대 이변 조건(3위 투표율 25%+·1·2위 격차 5%p 이내·투표 1위가 무)이 가장 강한 경기에 최하위 인기 픽을 그대로 박는 과감한 티켓. 메인이 죽는 회차를 노린다.</p>
              </div>
            )}
          </div>

          {/* 티켓 시뮬레이터 — 분석 티켓(27/32/8조합 등)이 있으면 선택, 없으면 자동 엔진 메인/위성 */}
          <TicketSimulator
            options={simOptions}
            voted={voted} pb={pb}
            canSaveFinal={canSaveFinal} roundId={round.id}
          />
        </div>
      )}

      {/* ===== TAB4 ===== */}
      {tab === 'p4' && (
        <div className="mt-6 space-y-8">
          <section>
            <h2 className="font-display text-lg font-bold text-ink">적용 규칙</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[...Object.values(RULES), ...Object.values(LESSONS)].map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-card p-4" style={{ borderTop: '3px solid var(--pine)' }}>
                  <div className="font-mono text-xs font-bold text-pine">{r.name}</div>
                  <p className="mt-2 text-xs leading-relaxed text-ink">{r.desc}</p>
                </div>
              ))}
              <div className="rounded-xl border border-line bg-card p-4" style={{ borderTop: '3px solid var(--pine)' }}>
                <div className="font-mono text-xs font-bold text-pine">패커버 룰</div>
                <p className="mt-2 text-xs leading-relaxed text-ink">{AWAY_COVER.RATIONALE} (최소 {AWAY_COVER.MIN_AWAY_COVER})</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-ink">favorite-longshot 캘리브레이션 (11,834경기)</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full font-mono text-xs">
                <thead><tr className="border-b border-line text-sub"><th className="px-3 py-2 text-left">투표율%</th>{CAL_VX.map((x) => <th key={x} className="px-3 py-2 text-right">{x}</th>)}</tr></thead>
                <tbody><tr><td className="px-3 py-2 text-left text-sub">적중률%</td>{CAL_VY.map((y, i) => <td key={i} className="px-3 py-2 text-right text-ink">{y}</td>)}</tr></tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="font-display text-base font-bold text-ink">리그 베이스레이트</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-[11px] uppercase text-sub"><th className="px-3 py-2">구분</th><th className="px-3 py-2 text-right">승</th><th className="px-3 py-2 text-right">무</th><th className="px-3 py-2 text-right">패</th></tr></thead>
                <tbody>
                  <tr className="border-b border-line/60"><td className="px-3 py-2">역대 전체</td><td className="px-3 py-2 text-right font-mono">{BASE_RATES.ALL_TIME.win}</td><td className="px-3 py-2 text-right font-mono">{BASE_RATES.ALL_TIME.draw}</td><td className="px-3 py-2 text-right font-mono">{BASE_RATES.ALL_TIME.lose}</td></tr>
                  <tr><td className="px-3 py-2 font-bold">2026 (원정강세)</td><td className="px-3 py-2 text-right font-mono">{BASE_RATES.Y2026.win}</td><td className="px-3 py-2 text-right font-mono">{BASE_RATES.Y2026.draw}</td><td className="px-3 py-2 text-right font-mono text-away">{BASE_RATES.Y2026.lose}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
