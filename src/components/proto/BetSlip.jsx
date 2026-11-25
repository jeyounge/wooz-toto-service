"use client";
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { saveProtoBet } from '@/app/proto/actions';
import { comboOdds, slipModel, validateSlip, STAKE_MIN, STAKE_MAX } from '@/lib/proto/bets';

const won = (x) => `${Math.round(x).toLocaleString('ko-KR')}원`;
const pct = (x, d = 1) => (x == null ? '-' : `${(x * 100).toFixed(d)}%`);

/**
 * 배팅 슬립: 표에서 선택지를 눌러 담고, 실제 구매한 배당·금액을 적어 '내 배팅'에 기록한다.
 * 구매 대행이 아니라 기록 도구 — 베트맨에서 산 것을 그대로 옮겨 적는 용도.
 * @param {{round:{id:number, gm_ts:number}, legs:Array<{game:object, pick_idx:number, odds:number}>, onChange:Function}} props
 */
export default function BetSlip({ round, legs, onChange }) {
  const [user, setUser] = useState(undefined); // undefined = 확인 중
  const [stake, setStake] = useState(5000);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUser(data?.user || null)).catch(() => setUser(null));
  }, []);

  const view = useMemo(() => {
    const rows = legs.map((l) => {
      const g = l.game;
      const p = g.pred ? Number([g.pred.p_w, g.pred.p_d, g.pred.p_l][l.pick_idx]) : null;
      return { ...l, model_prob: p, match_key: `${g.home}|${g.away}|${g.game_ts}`, game_id: g.id };
    });
    const total = rows.length ? comboOdds(rows.map((r) => r.odds)) : 0;
    const m = slipModel(rows, total);
    return { rows, total, ...m, err: rows.length ? validateSlip({ stake: Number(stake), legs: rows }) : null };
  }, [legs, stake]);

  if (!legs.length) return null;
  const setOdds = (i, v) => onChange(legs.map((l, k) => (k === i ? { ...l, odds: v } : l)));
  const remove = (i) => onChange(legs.filter((_, k) => k !== i));

  const save = () => start(async () => {
    setMsg(null);
    const r = await saveProtoBet({
      roundId: round.id, stake: Number(stake), note,
      legs: view.rows.map((x) => ({ game_id: x.game_id, pick_idx: x.pick_idx, odds: Number(x.odds) })),
    });
    setMsg(r);
    if (r.ok) { onChange([]); setNote(''); }
  });

  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur md:inset-x-auto md:bottom-4 md:right-4 md:w-[380px] md:rounded-xl md:border">
      <div className="max-h-[60vh] overflow-y-auto p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-sm font-bold text-ink">배팅 기록 <span className="font-mono text-xs text-sub">{legs.length}게임</span></h3>
          <button onClick={() => onChange([])} className="text-[11px] text-sub hover:text-away">비우기</button>
        </div>
        <ul className="mt-2 divide-y divide-line/60">
          {view.rows.map((r, i) => {
            const g = r.game;
            const txt = [g.txt_w, g.txt_d, g.txt_l][r.pick_idx];
            return (
              <li key={g.id} className="flex items-center gap-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{g.home} vs {g.away}</div>
                  <div className="font-mono text-[10px] text-sub">{g.bet_type?.replace('일반 ', '')}{g.handi != null && Number(g.handi) !== 0 ? ` ${g.handi}` : ''} · <b className="text-ink">{txt}</b> · 모델 {pct(r.model_prob, 0)}</div>
                </div>
                <input type="number" step="0.01" min="1.01" value={r.odds} onChange={(e) => setOdds(i, e.target.value)} title="실제 구매 배당 (베트맨 배당이 바뀌었으면 고치세요)"
                  className="w-16 rounded border border-line bg-paper px-1.5 py-1 text-right font-mono text-xs tabular-nums text-ink focus:border-pine focus:outline-none" />
                <button onClick={() => remove(i)} className="px-1 text-sub hover:text-away" aria-label="빼기">×</button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-paper p-2 text-center font-mono text-[11px] tabular-nums">
          <div><div className="text-base font-bold text-ink">{view.total.toFixed(2)}</div><div className="text-sub">조합 배당</div></div>
          <div><div className="text-base font-bold text-ink">{pct(view.prob)}</div><div className="text-sub">모델 적중확률</div></div>
          <div title="모델 확률 × 배당. 1.00 미만이면 모델 기준으로도 손해 쪽">
            <div className={`text-base font-bold ${view.ev == null ? 'text-sub' : view.ev >= 1 ? 'text-pine' : 'text-away'}`}>{view.ev == null ? '-' : view.ev.toFixed(2)}</div><div className="text-sub">기대 회수율</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="font-mono text-[11px] text-sub" htmlFor="slip-stake">금액</label>
          <input id="slip-stake" type="number" step="100" min={STAKE_MIN} max={STAKE_MAX} value={stake} onChange={(e) => setStake(e.target.value)}
            className="w-28 rounded border border-line bg-paper px-2 py-1 text-right font-mono text-sm tabular-nums text-ink focus:border-pine focus:outline-none" />
          <span className="ml-auto font-mono text-[11px] text-sub">적중 시 <b className="text-ink">{won(Math.floor((Number(stake) * view.total) / 10) * 10)}</b></span>
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택)" maxLength={200}
          className="mt-2 w-full rounded border border-line bg-paper px-2 py-1 text-xs text-ink focus:border-pine focus:outline-none" />
        {view.err && <p className="mt-1 text-[11px] text-away">{view.err}</p>}
        {msg && <p className={`mt-1 text-[11px] ${msg.ok ? 'text-pine' : 'text-away'}`}>{msg.message}{msg.ok && <> · <Link href="/proto/my" className="underline">내 배팅 보기</Link></>}</p>}
        {user === null ? (
          <Link href={`/admin/login?next=/proto/${round.gm_ts}`} className="mt-2 block w-full rounded-lg bg-pine px-4 py-2 text-center text-sm font-semibold text-white">로그인하고 기록하기</Link>
        ) : (
          <button onClick={save} disabled={pending || !!view.err || user === undefined}
            className="mt-2 w-full rounded-lg bg-pine px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? '저장 중…' : '내 배팅에 기록'}</button>
        )}
        <p className="mt-1.5 text-[10px] leading-snug text-sub">기록 전용입니다(구매 대행 아님). 기대 회수율은 모델 확률 기준 추정이며 수익을 보장하지 않습니다.</p>
      </div>
    </aside>
  );
}
