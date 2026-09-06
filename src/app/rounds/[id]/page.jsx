import { notFound } from 'next/navigation';
import { getRoundsList, getRoundDetail } from '@/lib/queries';
import RoundDashboard from '@/components/RoundDashboard';

export const revalidate = 300;

export default async function RoundPage({ params }) {
  const { id } = await params;
  const [detail, roundsList] = await Promise.all([getRoundDetail(id), getRoundsList()]);

  if (!detail) notFound();

  return (
    <RoundDashboard
      round={detail.round}
      matches={detail.matches}
      roundsList={roundsList}
      currentId={detail.round.id}
    />
  );
}
