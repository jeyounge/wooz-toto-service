import { getProtoRounds, getProtoRoundDetail, getProtoAccuracy } from '@/lib/protoQueries';
import ProtoBoard from '@/components/proto/ProtoBoard';
import ProtoPending from '@/components/proto/ProtoPending';

export const revalidate = 300;
export const metadata = {
  title: '프로토 승부식 예측·적중 기록 | 토토 Z',
  description: '프로토 승부식 전 경기의 배당 기반 확률·국내 구매 쏠림·예측 적중률 기록 (개인 분석·기록·교육용).',
};

export default async function ProtoPage() {
  let detail, rounds, accuracy;
  try {
    [detail, rounds, accuracy] = await Promise.all([getProtoRoundDetail(null), getProtoRounds(), getProtoAccuracy()]);
  } catch {
    // 테이블 생성(0007 마이그레이션) 전이거나 일시 오류 — 페이지는 깨지지 않게
    return <ProtoPending message="데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." />;
  }
  if (!detail) return <ProtoPending />;
  return <ProtoBoard round={detail.round} games={detail.games} rounds={rounds} accuracy={accuracy} />;
}
