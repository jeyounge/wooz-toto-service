"use client";
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ResponsibleNotice from '@/components/ResponsibleNotice';
import { settleBet, summarizeBets } from '@/lib/proto/bets';
import { deleteProtoBet, setProtoBetPayout } from '@/app/proto/actions';

const won = (x) => (x == null ? '-' : `${Math.round(x).toLocaleString('ko-KR')}원`);
const signed = (x) => (x == null ? '-' : `${x > 0 ? '+' : ''}${Math.round(x).toLocaleString('ko-KR')}원`);
const pct = (x, d = 1) => (x == null ? '-' : `${(x * 100).toFixed(d)}%`);
const spct = (x, d = 1) => (x == null ? '-' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(d)}%`);
const roundLabel = (gmTs) => (gmTs ? `${String(gmTs).slice(0, 2)}년 ${Number(String(gmTs).slice(2))}회차` : '-');
const fmtTs = (ts) => (ts ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)) : '-');
const STATUS = {
  won: { label: '적중', cls: 'bg-pine/10 text-pine' },
  lost: { label: '낙첨', cls: 'bg-away/10 text-away' },
  pending: { label: '대기', cls: 'bg-paper text-sub' },
  void: { label: '적중특례', cls: 'bg-draw/10 text-draw' },
};
const LEG = { hit: '✓', miss: '✗', pending: '…', void: '특례' };
const LEG_CLS = { hit: 'text-pine', miss: 'text-away', pending: 'text-sub', void: 'text-draw' };

function Stat({ label, value, sub, tone }) {
  return (
    <div className="rounded-lg bg-paper p-3">
      <div className="text-[11px] text-sub">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${tone || 'text-ink'}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] tabular-nums text-sub">{sub}</div>}
    </div>
  );
}

function SummaryTable({ title, rows, keyLabel }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-xs font-semibold text-ink">{title}</div>
      <table className="w-full min-w-[560px] text-xs">
        <thead><tr className="border-b border-line text-left font-mono text-[10px] text-sub">
          <th className="px-2 py-1.5">{keyLabel}</th><th className="px-2 py-1.5 text-right">장수</th><th className="px-2 py-1.5 text-right">구매</th>
          <th className="px-2 py-1.5 text-right">적중금</th><th className="px-2 py-1.5 text-right">손익</th><th className="px-2 py-1.5 text-right">수익률</th>
          <th className="px-2 py-1.5 text-right">슬립 적중</th><th className="px-2 py-1.5 text-right">게임 적중</th>
        </tr></thead>
        <tbody className="font-mono tabular-nums">
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line/50">
              <td className="px-2 py-1.5 font-sans text-ink">{keyLabel === '회차' ? roundLabel(r.key) : r.key}</td>
              <td className="px-2 py-1.5 text-right text-sub">{r.n}{r.pending ? <span className="text-[10px]"> (대기 {r.pending})</span> : null}</td>
              <td className="px-2 py-1.5 text-right">{won(r.stake)}</td>
              <td className="px-2 py-1.5 text-right">{won(r.payout)}</td>
              <td className={`px-2 py-1.5 text-right ${r.profit > 0 ? 'text-pine' : r.profit < 0 ? 'text-away' : ''}`}>{signed(r.profit)}</td>
              <td className={`px-2 py-1.5 text-right ${r.roi > 0 ? 'text-pine' : r.roi < 0 ? 'text-away' : ''}`}>{spct(r.roi)}</td>
              <td className="px-2 py-1.5 text-right">{pct(r.hitRate, 0)} <span className="text-sub">({r.won}/{r.settled})</span></td>
              <td className="px-2 py-1.5 text-right">{pct(r.legRate, 0)} <span className="text-sub">({r.legHit}/{r.legN})</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BetCard({ bet }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editPay, setEditPay] = useState(false);
  const [pay, setPay] = useState(bet.payout_actual ?? '');
  const s = settleBet(bet);
  const st = STATUS[s.status];
  const ev = bet.model_prob != null ? Number(bet.model_prob) * Number(bet.total_odds) : null;
  const del = () => { if (window.confirm('이 배팅 기록을 삭제할까요?')) start(async () => { await deleteProtoBet(bet.id); router.refresh(); }); };
  const savePay = () => start(async () => { await setProtoBetPayout(bet.id, pay); setEditPay(false); router.refresh(); });
  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
        <Link href={`/proto/${bet.round_gm_ts}`} className="font-mono text-[11px] text-sub hover:text-pine">{roundLabel(bet.round_gm_ts)}</Link>
        <span className="font-mono text-xs tabular-nums text-ink">{bet.legs.length}게임 · 배당 {Number(bet.total_odds).toFixed(2)} · {won(bet.stake)}</span>
        {ev != null && <span className={`font-mono text-[10px] ${ev >= 1 ? 'text-pine' : 'text-sub'}`} title="구매 시점 모델 확률 × 배당">기대 {ev.toFixed(2)} · 모델 {pct(Number(bet.model_prob), 0)}</span>}
        <span className={`ml-auto font-mono text-sm font-bold tabular-nums ${s.profit > 0 ? 'text-pine' : s.profit < 0 ? 'text-away' : 'text-sub'}`}>{s.status === 'pending' ? '대기' : signed(s.profit)}</span>
      </div>
      <ul className="divide-y divide-line/50 px-3">
        {s.legs.map((l) => {
          const g = l.game || {};
          return (
            <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-xs">
              <span className={`w-6 font-mono font-bold ${LEG_CLS[l.result]}`}>{LEG[l.result]}</span>
              <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] text-sub">{g.league_short || g.league}</span>
              <span className="font-medium text-ink">{g.home} vs {g.away}</span>
              <span className="text-sub">{String(g.bet_type || '').replace('일반 ', '')}{g.handi != null && Number(g.handi) !== 0 ? ` ${g.handi}` : ''}</span>
              <span className="font-semibold text-ink">{[g.txt_w, g.txt_d, g.txt_l][l.pick_idx]} {Number(l.odds).toFixed(2)}</span>
              <span className="ml-auto font-mono text-[10px] text-sub">{g.result_score || fmtTs(g.game_ts)}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-3 py-1.5 text-[11px] text-sub">
        <span>{fmtTs(bet.placed_ts)} 기록</span>
        {bet.note && <span className="text-ink">· {bet.note}</span>}
        {s.status !== 'lost' && s.status !== 'pending' && (
          editPay ? (
            <span className="flex items-center gap-1">
              <input type="number" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="실제 적중금" className="w-24 rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px]" />
              <button onClick={savePay} disabled={pending} className="text-pine">저장</button>
            </span>
          ) : (
            <button onClick={() => setEditPay(true)} className="hover:text-pine">적중금 {won(s.payout)}{bet.payout_actual != null ? ' (직접 입력)' : ''} · 수정</button>
          )
        )}
        <button onClick={del} disabled={pending} className="ml-auto hover:text-away">삭제</button>
      </div>
    </div>
  );
}

export default function MyBets({ bets }) {
  const [round, setRound] = useState('all');
  const rounds = useMemo(() => [...new Set(bets.map((b) => b.round_gm_ts))].sort((a, b) => b - a), [bets]);
  const shown = round === 'all' ? bets : bets.filter((b) => String(b.round_gm_ts) === String(round));
  const sum = useMemo(() => summarizeBets(shown), [shown]);
  const t = sum.total;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-pine">프로토 승부식 · 내 기록</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">내 배팅 기록</h1>
          <p className="mt-1 text-xs text-sub">승부식 화면에서 선택지를 눌러 담고 기록하면 결과가 나오는 대로 자동 정산됩니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="my-round" className="font-mono text-xs text-sub">회차</label>
          <select id="my-round" value={round} onChange={(e) => setRound(e.target.value)}
            className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm text-ink focus:border-pine focus:outline-none">
            <option value="all">전체</option>
            {rounds.map((r) => <option key={r} value={r}>{roundLabel(r)}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4"><ResponsibleNotice variant="inline" /></div>

      {bets.length === 0 ? (
        <div className="mt-8 rounded-xl border border-line bg-card p-6 text-center text-sm text-sub">
          아직 기록이 없습니다. <Link href="/proto" className="text-pine underline">승부식 화면</Link>에서 선택지를 눌러 담아 보세요.
        </div>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="손익 (확정)" value={signed(t.profit)} sub={`구매 ${won(t.stake)} → 적중금 ${won(t.payout)}`} tone={t.profit > 0 ? 'text-pine' : t.profit < 0 ? 'text-away' : ''} />
            <Stat label="수익률" value={spct(t.roi)} sub={t.expRoi == null ? '' : `모델 기대 ${spct(t.expRoi)}`} tone={t.roi > 0 ? 'text-pine' : t.roi < 0 ? 'text-away' : ''} />
            <Stat label="슬립 적중률" value={pct(t.hitRate)} sub={`${t.won}/${t.settled}장 · 대기 ${t.pending}`} />
            <Stat label="게임 적중률" value={pct(t.legRate)} sub={`${t.legHit}/${t.legN}게임`} />
          </section>
          <section className="mt-4 space-y-4 rounded-xl border border-line bg-card p-4">
            {round === 'all' && <SummaryTable title="회차별" keyLabel="회차" rows={sum.byRound} />}
            <SummaryTable title="폴더 수별 (몇 게임 조합)" keyLabel="폴더" rows={sum.byLegs} />
            <p className="text-[11px] text-sub">수익률 = (적중금 − 구매) ÷ 구매, 확정된 장만. 모델 기대 = 구매 시점 모델 확률 × 배당 − 1. 실제 수익률이 기대보다 계속 낮으면 모델 확률이 과대평가된 것입니다. 표본 30장 미만은 운의 영향이 큽니다.</p>
          </section>
          <section className="mt-6 space-y-3">
            {shown.map((b) => <BetCard key={b.id} bet={b} />)}
          </section>
        </>
      )}
    </div>
  );
}
