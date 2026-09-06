import { notFound } from 'next/navigation';
import { getRoundsList, getRoundDetail } from '@/lib/queries';
import { buildRoundView } from '@/lib/roundView';
import TabbedDashboard from '@/components/TabbedDashboard';

export const revalidate = 300;

export default async function RoundPage({ params }) {
  const { id } = await params;
  const [detail, roundsList] = await Promise.all([getRoundDetail(id), getRoundsList()]);

  if (!detail) notFound();

  const view = buildRoundView(detail.round, detail.matches);
  return <TabbedDashboard view={view} roundsList={roundsList} currentId={detail.round.id} />;
}
