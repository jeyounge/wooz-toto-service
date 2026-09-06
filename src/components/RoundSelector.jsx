"use client";
import { useRouter } from 'next/navigation';

/**
 * RoundSelector — 회차 드롭다운. 선택 시 /rounds/[id]로 이동.
 * @param {{rounds: Array<{id,season,round_no}>, currentId?: number|string}} props
 */
export default function RoundSelector({ rounds, currentId }) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="round-select" className="font-mono text-xs text-sub">회차</label>
      <select
        id="round-select"
        value={currentId ?? ''}
        onChange={(e) => router.push(`/rounds/${e.target.value}`)}
        className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm text-ink focus:border-pine focus:outline-none"
      >
        {rounds.map((r) => (
          <option key={r.id} value={r.id}>
            {r.season}년 {r.round_no}회차
          </option>
        ))}
      </select>
    </div>
  );
}
