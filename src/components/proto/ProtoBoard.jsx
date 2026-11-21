"use client";
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ResponsibleNotice from '@/components/ResponsibleNotice';
import { BET_GROUPS, roundSummary } from '@/lib/proto/accuracy';

const SPORT_ORDER = ['SC', 'BK', 'VL', 'BS'];
const SPORT_LABEL = { SC: '축구', BK: '농구', VL: '배구', BS: '야구' };
const COL = ['text-home', 'text-draw', 'text-away'];
const FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'overheat', label: '국내과열', test: (g) => g.pred?.flags?.includes('국내과열') },
  { id: 'value', label: '가치(EV≥1)', test: (g) => g.pred?.flags?.includes('가치') },
  { id: 'ext', label: '해외배당', test: (g) => g.pred && g.pred.prob_source !== 'domestic' },
  { id: 'settled', label: '결과확정', test: (g) => g.result_idx != null },
];

const pct = (x, d = 0) => (x == null ? '-' : `${(Number(x) * 100).toFixed(d)}%`);
const fmtTs = (ts) => (ts ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)) : '-');
const roundLabel = (gmTs) => `${String(gmTs).slice(0, 2)}년 ${Number(String(gmTs).slice(2))}회차`;
const handiLabel = (g) => {
  if (g.handi == null || Number(g.handi) === 0) return '';
  if (g.bet_type_id === '7') return ` ${g.handi}`;
  return ` ${Number(g.handi) > 0 ? '+' : ''}${g.handi}`;
};

function Chips({ items, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button key={it.id} onClick={() => onChange(it.id)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${value === it.id ? 'border-pine bg-pine text-white' : 'border-line bg-card text-sub hover:text-pine'}`}>
          {it.label}{it.count != null && <span className="ml-1 font-mono opacity-70">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** 선택지 셀: 표기·국내배당·우리확률·국내구매 + 픽/가치/결과 표시 */
function OptionCell({ g, i }) {
  const txt = [g.txt_w, g.txt_d, g.txt_l][i];
  const odds = Number([g.odds_w, g.odds_d, g.odds_l][i]);
  if (!txt || !(odds > 1)) return <td className="px-2 py-1.5 text-center text-xs text-line">—</td>;
  const p = g.pred ? Number([g.pred.p_w, g.pred.p_d, g.pred.p_l][i]) : null;
  const bets = [g.bets_w, g.bets_d, g.bets_l]; const tot = bets.every((b) => b != null) ? bets[0] + bets[1] + bets[2] : 0;
  const crowd = tot ? bets[i] / tot : null;
  const isPick = g.pred?.pick_idx === i;
  const isValue = g.pred?.value_idx === i && Number(g.pred?.value_ev) >= 0.95;
  const decided = g.result_idx != null && g.result_idx !== 4;
  const isResult = decided && g.result_idx === i;
  const ring = isPick ? (decided ? (isResult ? 'ring-2 ring-pine bg-pine/10' : 'ring-2 ring-away/60 bg-away/5') : 'ring-2 ring-pine bg-pine/5') : isResult ? 'bg-paper' : '';
  return (
    <td className="px-1 py-1">
      <div className={`rounded-lg px-2 py-1 ${ring}`}>
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-xs font-bold ${COL[i]}`}>{txt}{isValue && <span className="ml-0.5 text-draw" title={`가치 픽 · 기대값 ${g.pred.value_ev}`}>★</span>}{isResult && <span className="ml-0.5 text-ink">✓</span>}</span>
          <span className="font-mono text-xs tabular-nums text-ink">{odds.toFixed(2)}</span>
        </div>
        <div className="mt-0.5 flex justify-between gap-1 font-mono text-[10px] tabular-nums text-sub">
          <span title="우리 예측 확률">{p != null ? pct(p) : '-'}</span>
          <span title="국내 구매 비중">{crowd != null ? `구매 ${pct(crowd)}` : ''}</span>
        </div>
      </div>
    </td>
  );
}

/** 회차 적중 요약: 유형군 카드(현재 종목·리그) + 종목 × 유형군 표(회차 전체) */
function RoundSummary({ scoped, scopeLabel, games, sports }) {
  const s = roundSummary(scoped);
  const cards = [{ id: 'all', label: '전체', desc: '예측한 모든 게임' }, ...BET_GROUPS];
  const bySport = sports.map((c) => ({ c, s: roundSummary(games.filter((g) => g.sport_code === c)) }));
  const total = roundSummary(games);
  const cell = (o) => {
    if (!o || !o.pred) return <span className="text-line">—</span>;
    if (!o.settled) return <span className="text-sub">대기 {o.pending}</span>;
    return <><b className="text-ink">{pct(o.rate)}</b> <span className="text-sub">({o.hit}/{o.settled})</span></>;
  };
  return (
    <section className="mt-6 rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-bold text-ink">이번 회차 적중 요약</h2>
        <span className="font-mono text-[11px] text-sub">{scopeLabel}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cards.map((c) => {
          const o = s[c.id];
          const diff = o?.rate != null && o?.exp != null ? o.rate - o.exp : null;
          return (
            <div key={c.id} className={`rounded-lg p-3 ${c.id === 'all' ? 'bg-pine/5 ring-1 ring-pine/20' : 'bg-paper'}`} title={c.desc}>
              <div className="text-xs font-semibold text-ink">{c.label}</div>
              {!o?.pred ? (
                <div className="mt-1 font-mono text-lg text-line">—</div>
              ) : o.settled ? (
                <>
                  <div className="mt-1 font-mono text-xl font-bold tabular-nums text-ink">{pct(o.rate, 1)}</div>
                  <div className="font-mono text-[11px] tabular-nums text-sub">적중 {o.hit}/{o.settled}</div>
                  <div className={`font-mono text-[10px] tabular-nums ${diff >= 0 ? 'text-pine' : 'text-away'}`}>예상 {pct(o.exp, 1)} ({diff >= 0 ? '+' : ''}{(diff * 100).toFixed(1)}%p)</div>
                </>
              ) : (
                <div className="mt-1 font-mono text-lg text-sub">대기</div>
              )}
              {o?.pending > 0 && <div className="mt-0.5 font-mono text-[10px] text-sub">결과 대기 {o.pending}</div>}
            </div>
          );
        })}
      </div>
      {sports.length > 1 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead><tr className="border-b border-line text-left font-mono text-[10px] text-sub">
              <th className="px-2 py-1.5">회차 전체</th><th className="px-2 py-1.5">전체</th>
              {BET_GROUPS.map((b) => <th key={b.id} className="px-2 py-1.5">{b.label}</th>)}
            </tr></thead>
            <tbody className="font-mono tabular-nums">
              {bySport.map(({ c, s: ss }) => (
                <tr key={c} className="border-b border-line/50">
                  <td className="px-2 py-1.5 font-sans font-medium text-ink">{SPORT_LABEL[c] || c}</td>
                  <td className="px-2 py-1.5">{cell(ss.all)}</td>
                  {BET_GROUPS.map((b) => <td key={b.id} className="px-2 py-1.5">{cell(ss[b.id])}</td>)}
                </tr>
              ))}
              <tr>
                <td className="px-2 py-1.5 font-sans font-semibold text-ink">합계</td>
                <td className="px-2 py-1.5">{cell(total.all)}</td>
                {BET_GROUPS.map((b) => <td key={b.id} className="px-2 py-1.5">{cell(total[b.id])}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-sub">적중 = 예측 픽(최고 확률 선택지)이 베트맨 공식 결과와 일치. 예상 = 예측 확률 평균. 적중특례·예측 전 시작 경기는 제외.</p>
    </section>
  );
}

function AccuracyPanel({ acc }) {
  const [axis, setAxis] = useState('sport');
  const AXES = [{ id: 'sport', label: '종목' }, { id: 'league', label: '리그' }, { id: 'group', label: '유형군' }, { id: 'type', label: '세부유형' }, { id: 'flag', label: '플래그' }, { id: 'source', label: '확률원천' }];
  const total = acc?.total?.['전체'];
  if (!total) return (
    <section className="mt-10 rounded-xl border border-line bg-card p-5">
      <h2 className="font-display text-base font-bold text-ink">누적 적중률</h2>
      <p className="mt-2 text-sm text-sub">아직 결과가 확정된 예측이 없습니다. 경기 다음 날 배치가 결과를 마킹하면 여기에 쌓입니다.</p>
    </section>
  );
  const rows = Object.entries(acc[axis] || {});
  const SRC = { domestic: '국내배당', espn: '해외배당', espn_spread: '해외 스프레드' };
  return (
    <section className="mt-10 rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-ink">누적 적중률</h2>
          <p className="mt-1 text-xs text-sub">예측 픽 = 최고 확률 선택지. 예상 = 평균 예측확률(적중률과 비슷할수록 확률이 잘 맞는 것). 가치 픽 회수율 = 1씩 걸었다고 가정한 환급/건수(1.00 = 본전).</p>
        </div>
        <Chips items={AXES} value={axis} onChange={setAxis} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-paper p-3"><div className="font-mono text-xl font-bold tabular-nums text-ink">{pct(total.rate, 1)}</div><div className="text-[11px] text-sub">적중률 ({total.hit}/{total.n})</div></div>
        <div className="rounded-lg bg-paper p-3"><div className="font-mono text-xl font-bold tabular-nums text-ink">{pct(total.exp, 1)}</div><div className="text-[11px] text-sub">예상 적중률</div></div>
        <div className="rounded-lg bg-paper p-3"><div className="font-mono text-xl font-bold tabular-nums text-ink">{total.valueRoi == null ? '-' : total.valueRoi.toFixed(2)}</div><div className="text-[11px] text-sub">가치 픽 회수율 ({total.valueN}건)</div></div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left font-mono text-[11px] text-sub">
            <th className="px-2 py-2">구분</th><th className="px-2 py-2 text-right">경기</th><th className="px-2 py-2 text-right">적중률</th><th className="px-2 py-2 text-right">예상</th><th className="px-2 py-2 text-right">차이</th><th className="px-2 py-2 text-right">가치 회수율</th>
          </tr></thead>
          <tbody>
            {rows.map(([k, a]) => {
              const diff = a.rate != null && a.exp != null ? a.rate - a.exp : null;
              return (
                <tr key={k} className="border-b border-line/60">
                  <td className="px-2 py-1.5 text-xs text-ink">{axis === 'source' ? SRC[k] || k : k}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-sub">{a.n}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-ink">{pct(a.rate, 1)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-sub">{pct(a.exp, 1)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono text-xs tabular-nums ${diff == null ? '' : diff >= 0 ? 'text-pine' : 'text-away'}`}>{diff == null ? '-' : `${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(1)}%p`}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-sub">{a.valueRoi == null ? '-' : `${a.valueRoi.toFixed(2)} (${a.valueN})`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && rows.some(([, a]) => a.n < 30) && <p className="mt-2 text-[11px] text-sub">표본 30경기 미만 구분은 우연의 영향이 큽니다.</p>}
    </section>
  );
}

export default function ProtoBoard({ round, games, rounds, accuracy }) {
  const router = useRouter();
  const sports = useMemo(() => SPORT_ORDER.filter((c) => games.some((g) => g.sport_code === c)), [games]);
  const [sport, setSport] = useState(sports[0] || 'SC');
  const [league, setLeague] = useState('all');
  const [type, setType] = useState('all');
  const [filter, setFilter] = useState('all');

  const inSport = useMemo(() => games.filter((g) => g.sport_code === sport), [games, sport]);
  const leagues = useMemo(() => {
    const m = new Map(); inSport.forEach((g) => m.set(g.league_code, { id: g.league_code, label: g.league_short || g.league, count: (m.get(g.league_code)?.count || 0) + 1 }));
    return [{ id: 'all', label: '전체', count: inSport.length }, ...[...m.values()].sort((a, b) => b.count - a.count)];
  }, [inSport]);
  const inLeague = useMemo(() => inSport.filter((g) => league === 'all' || g.league_code === league), [inSport, league]);
  const types = useMemo(() => {
    const m = new Map(); inLeague.forEach((g) => m.set(g.bet_type_id, { id: g.bet_type_id, label: g.bet_type.replace('일반 ', ''), count: (m.get(g.bet_type_id)?.count || 0) + 1 }));
    return [{ id: 'all', label: '전체', count: inLeague.length }, ...[...m.values()].sort((a, b) => Number(a.id) - Number(b.id))];
  }, [inLeague]);
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    return inLeague.filter((g) => (type === 'all' || g.bet_type_id === type) && (!f?.test || f.test(g)));
  }, [inLeague, type, filter]);

  // 경기별 묶음 (홈·원정·킥오프)
  const groups = useMemo(() => {
    const m = new Map();
    for (const g of shown) { const k = `${g.home}|${g.away}|${g.game_ts}`; if (!m.has(k)) m.set(k, []); m.get(k).push(g); }
    return [...m.values()];
  }, [shown]);

  const stat = useMemo(() => {
    const pred = shown.filter((g) => g.pred);
    const settled = pred.filter((g) => g.result_idx != null && g.result_idx !== 4);
    const hit = settled.filter((g) => g.result_idx === g.pred.pick_idx).length;
    const exp = settled.reduce((s, g) => s + Number(g.pred.pick_prob), 0);
    return { n: shown.length, pred: pred.length, settled: settled.length, hit, rate: settled.length ? hit / settled.length : null, exp: settled.length ? exp / settled.length : null };
  }, [shown]);

  const pickSport = (c) => { setSport(c); setLeague('all'); setType('all'); };
  const pickLeague = (c) => { setLeague(c); setType('all'); };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-pine">프로토 승부식 · {roundLabel(round.gm_ts)}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">승부식 예측 · 적중 기록</h1>
          <p className="mt-1 text-xs text-sub">발매 마감 {fmtTs(round.sale_end_ts)} · {round.status === 'settled' ? '결과 확정' : round.status === 'closed' ? '발매 마감 · 결과 대기' : '발매 중'} · 게임 {games.length}개</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="proto-round" className="font-mono text-xs text-sub">회차</label>
          <select id="proto-round" value={round.gm_ts} onChange={(e) => router.push(`/proto/${e.target.value}`)}
            className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm text-ink focus:border-pine focus:outline-none">
            {rounds.map((r) => <option key={r.gm_ts} value={r.gm_ts}>{roundLabel(r.gm_ts)}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4"><ResponsibleNotice variant="inline" /></div>

      {/* 종목 탭 */}
      <div className="mt-6 flex gap-1 border-b border-line">
        {sports.map((c) => {
          const n = games.filter((g) => g.sport_code === c).length;
          return (
            <button key={c} onClick={() => pickSport(c)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${sport === c ? 'border-pine text-pine' : 'border-transparent text-sub hover:text-ink'}`}>
              {SPORT_LABEL[c] || c}<span className="ml-1 font-mono text-[11px] opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <RoundSummary
        scoped={inLeague}
        scopeLabel={`${SPORT_LABEL[sport] || sport} · ${league === 'all' ? '전체 리그' : leagues.find((l) => l.id === league)?.label}`}
        games={games}
        sports={sports}
      />

      <div className="mt-4 space-y-2">
        <Chips items={leagues} value={league} onChange={pickLeague} />
        <Chips items={types} value={type} onChange={setType} />
        <Chips items={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-card px-4 py-2.5 font-mono text-xs text-sub">
        <span>게임 <b className="text-ink">{stat.n}</b></span>
        <span>예측 <b className="text-ink">{stat.pred}</b></span>
        <span>결과확정 <b className="text-ink">{stat.settled}</b></span>
        <span>적중 <b className="text-ink">{stat.hit}</b> ({pct(stat.rate, 1)} · 예상 {pct(stat.exp, 1)})</span>
        <span className="text-[11px]">테두리 = 예측 픽 · ★ = 가치 픽(기대값 0.95+) · ✓ = 결과</span>
      </div>

      <div className="mt-4 space-y-3">
        {groups.length === 0 && <p className="py-10 text-center text-sm text-sub">조건에 맞는 게임이 없습니다.</p>}
        {groups.map((gs) => {
          const h = gs[0];
          return (
            <div key={`${h.home}|${h.away}|${h.game_ts}`} className="rounded-xl border border-line bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-sub">{h.league_short || h.league}</span>
                <span className="text-sm font-semibold text-ink">{h.home} <span className="font-normal text-sub">vs</span> {h.away}</span>
                <span className="ml-auto font-mono text-[11px] text-sub">{fmtTs(h.game_ts)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <tbody>
                    {gs.map((g) => (
                      <tr key={g.match_seq} className="border-b border-line/50 last:border-0">
                        <td className="w-36 px-3 py-1.5 align-middle">
                          <div className="text-xs font-medium text-ink">{g.bet_type.replace('일반 ', '')}{handiLabel(g)}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            <span className="font-mono text-[10px] text-sub">#{g.match_seq}</span>
                            {(g.pred?.flags || []).filter((f) => f !== '가치').map((f) => (
                              <span key={f} className={`rounded px-1 font-mono text-[9px] ${f === '국내과열' ? 'bg-away/10 text-away' : f === '저평가무' ? 'bg-draw/10 text-draw' : 'bg-pine/10 text-pine'}`}>{f}</span>
                            ))}
                            {g.result_idx === 4 && <span className="rounded bg-paper px-1 font-mono text-[9px] text-sub">적중특례</span>}
                          </div>
                        </td>
                        {[0, 1, 2].map((i) => <OptionCell key={i} g={g} i={i} />)}
                        <td className="w-20 px-2 text-right font-mono text-[10px] text-sub">{g.result_score || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <AccuracyPanel acc={accuracy} />

      <section className="mt-8 rounded-xl border border-line bg-card p-5 text-xs leading-relaxed text-sub">
        <h2 className="font-display text-sm font-bold text-ink">예측 방법 (v1)</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>확률은 해외 배당(ESPN · DraftKings)을 우선하고, 없으면 국내 배당에서 마진을 걷어낸 값을 씁니다. 배당은 가격이고 구매 쏠림은 아니기 때문입니다.</li>
          <li>1골 핸디는 해외 승무패만으로 정확히 계산합니다(홈 −1 패 = 홈 못 이김, 홈 +1 승 = 홈 안 짐). 2골 차 확률은 해외 ±1.5 스프레드가 있을 때만 씁니다.</li>
          <li><b className="text-away">국내과열</b>: 예측 픽의 국내 구매 비중이 확률보다 15%p 이상 높을 때. 토토 승무패 복기에서 이런 정배가 자주 깨졌습니다.</li>
          <li><b className="text-draw">저평가무</b>: 무의 국내 배당 × 확률이 0.95 이상. <b className="text-ink">★ 가치 픽</b>: 확률 20% 이상 선택지 중 국내 배당 × 확률이 가장 큰 것.</li>
          <li>예측은 킥오프 전까지만 갱신되고 이후에는 고정됩니다. 결과는 경기 다음 날 배치가 베트맨 공식 결과로 마킹합니다.</li>
        </ul>
      </section>
    </div>
  );
}
