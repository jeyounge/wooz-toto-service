import { getLatestRound, getRoundsList, getRoundDetail } from '@/lib/queries';
import RoundDashboard from '@/components/RoundDashboard';

// 회차 데이터는 마감 후 갱신되므로 짧은 주기 재검증
export const revalidate = 300;

export default async function Home() {
  const [latest, roundsList] = await Promise.all([getLatestRound(), getRoundsList()]);

  if (!latest) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">데이터 준비 중</h1>
        <p className="mt-2 text-sm text-sub">회차 데이터가 아직 없습니다.</p>
      </div>
    );
  }

  const detail = await getRoundDetail(latest.id);

  return (
    <>
      <section className="border-b border-line bg-paper">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-pine">Z-Labs · Toto Z</p>
          <h1 className="mt-1 font-display text-xl font-extrabold text-ink sm:text-2xl">
            축구 승무패 시장편향 계량 · 조합 인사이트
          </h1>
          <p className="mt-1 font-sans text-xs text-sub">
            투표율을 17년치 데이터로 캘리브레이션한 확률과 규칙 기반 마킹 (개인 분석·교육용)
          </p>
        </div>
      </section>
      <RoundDashboard
        round={detail.round}
        matches={detail.matches}
        roundsList={roundsList}
        currentId={latest.id}
      />
    </>
  );
}
