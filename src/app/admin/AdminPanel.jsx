"use client";
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { scrapeAndIngest } from './actions';

export default function AdminPanel({ email, suggestedRound }) {
  const router = useRouter();
  const [round, setRound] = useState(suggestedRound || '');
  const [status, setStatus] = useState(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setStatus(null);
    startTransition(async () => {
      const res = await scrapeAndIngest(round);
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
        <h2 className="font-display text-base font-bold text-ink">회차 수집 (betinfo)</h2>
        <p className="mt-1 text-xs text-sub">
          7자리 회차코드를 입력하고 수집하면 대진·투표율·결과가 DB에 반영됩니다.
          마감 직전(투표율 확정)·경기 후(결과)에 다시 눌러 갱신하세요.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={round}
            onChange={(e) => setRound(e.target.value)}
            placeholder="2026050"
            inputMode="numeric"
            className="w-40 rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm text-ink focus:border-pine focus:outline-none"
          />
          <button
            onClick={run} disabled={pending}
            className="rounded-lg bg-pine px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? '수집 중…' : '수집'}
          </button>
          {suggestedRound && (
            <span className="font-mono text-xs text-sub">추천: {suggestedRound} (최신+1)</span>
          )}
        </div>

        {status && (
          <p className={`mt-4 rounded-lg border p-3 text-xs ${status.ok ? 'border-pine/40 bg-pine/5 text-ink' : 'border-away/40 bg-away/5 text-away'}`}>
            {status.ok ? '✅ ' : '❌ '}{status.message}
          </p>
        )}

        <p className="mt-6 text-[11px] text-sub">
          회차코드 = 연도(4) + 회차(3). 예: 2026년 50회차 → <span className="font-mono">2026050</span>.
          betinfo 접근이 서버 환경에서 차단되면 로컬/프로덕션에서 실행하세요.
        </p>
      </section>
    </div>
  );
}
