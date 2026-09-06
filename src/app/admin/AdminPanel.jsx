"use client";
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { refreshData } from './actions';

const ACTIONS = [
  ['round', '신규 회차 대진 수집', '발매일: 새 회차·14경기 대진'],
  ['votes', '투표율 갱신', '마감 직전: 투표율 스냅샷'],
  ['results', '경기 결과 수집', '경기 후: 승/무/패 결과'],
];

export default function AdminPanel({ email }) {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();

  const run = (kind) => {
    setStatus(null);
    startTransition(async () => {
      const res = await refreshData(kind);
      setStatus(res);
    });
  };

  const logout = async () => {
    await createClient().auth.signOut();
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">관리자</h1>
          <p className="mt-1 font-mono text-xs text-sub">{email}</p>
        </div>
        <button onClick={logout} className="rounded-lg border border-line px-3 py-2 text-xs text-sub hover:bg-card">로그아웃</button>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-base font-bold text-ink">데이터 갱신</h2>
        <p className="mt-1 text-xs text-sub">관리자가 필요할 때 수동으로 수집을 트리거합니다 (사용자 자동 스크래핑 없음).</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {ACTIONS.map(([kind, label, desc]) => (
            <button
              key={kind} onClick={() => run(kind)} disabled={pending}
              className="rounded-xl border border-line bg-card p-4 text-left transition-colors hover:border-pine disabled:opacity-50"
            >
              <div className="font-display text-sm font-bold text-ink">{label}</div>
              <div className="mt-1 text-[11px] text-sub">{desc}</div>
            </button>
          ))}
        </div>
        {pending && <p className="mt-4 text-xs text-sub">처리 중…</p>}
        {status && (
          <p className={`mt-4 rounded-lg border p-3 text-xs ${status.ok ? 'border-pine/40 bg-pine/5 text-ink' : 'border-away/40 bg-away/5 text-away'}`}>
            {status.ok ? '✅ ' : '❌ '}{status.message}
          </p>
        )}
      </section>
    </div>
  );
}
