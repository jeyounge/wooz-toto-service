import { getLatestRound, getRoundsList, getRoundDetail } from '@/lib/queries';
import { buildRoundView } from '@/lib/roundView';
import TabbedDashboard from '@/components/TabbedDashboard';

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
  const view = buildRoundView(detail.round, detail.matches);

  return <TabbedDashboard view={view} roundsList={roundsList} currentId={latest.id} />;
}
