import { notFound } from 'next/navigation';
import { getProtoRounds, getProtoRoundDetail, getProtoAccuracy } from '@/lib/protoQueries';
import ProtoBoard from '@/components/proto/ProtoBoard';
import ProtoPending from '@/components/proto/ProtoPending';

export const revalidate = 300;

export default async function ProtoRoundPage({ params }) {
  const { ts } = await params;
  if (!/^\d{6}$/.test(ts)) notFound();
  let detail, rounds, accuracy;
  try {
    [detail, rounds, accuracy] = await Promise.all([getProtoRoundDetail(ts), getProtoRounds(), getProtoAccuracy()]);
  } catch {
    return <ProtoPending message="데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." />;
  }
  if (!detail) notFound();
  return <ProtoBoard round={detail.round} games={detail.games} rounds={rounds} accuracy={accuracy} />;
}
