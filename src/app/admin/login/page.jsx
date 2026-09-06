"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError('로그인 실패: ' + error.message); return; }
    router.push('/admin');
    router.refresh();
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-24">
      <h1 className="font-display text-2xl font-extrabold text-ink">관리자 로그인</h1>
      <p className="mt-1 text-xs text-sub">토토 Z 데이터 관리 · 관리자 전용</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일" required autoComplete="username"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none"
        />
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호" required autoComplete="current-password"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink focus:border-pine focus:outline-none"
        />
        {error && <p className="text-xs text-away">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full rounded-lg bg-pine px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
