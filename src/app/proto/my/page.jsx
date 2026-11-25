import Link from 'next/link';
import { getMyProtoBets } from '@/lib/protoQueries';
import MyBets from '@/components/proto/MyBets';
import ProtoPending from '@/components/proto/ProtoPending';

export const dynamic = 'force-dynamic'; // 로그인 사용자별 화면
export const metadata = {
  title: '내 승부식 배팅 기록 | 토토 Z',
  description: '프로토 승부식 회차별 배팅 기록 · 결과 · 손익 · 수익률 (개인 분석·기록용).',
};

export default async function MyProtoBetsPage() {
  let res;
  try {
    res = await getMyProtoBets();
  } catch {
    return <ProtoPending message="배팅 기록을 불러오지 못했습니다. (0009 마이그레이션 적용 전이면 Supabase SQL Editor에서 먼저 실행하세요.)" />;
  }
  if (!res.user) {
    return (
      <div className="mx-auto max-w-md px-4 pb-16 pt-28 text-center">
        <h1 className="font-display text-xl font-bold text-ink">내 배팅 기록</h1>
        <p className="mt-2 text-sm text-sub">로그인하면 회차별로 기록한 배팅의 결과·손익·수익률을 볼 수 있습니다.</p>
        <Link href="/admin/login?next=/proto/my" className="mt-4 inline-block rounded-lg bg-pine px-5 py-2 text-sm font-semibold text-white">로그인</Link>
      </div>
    );
  }
  return <MyBets bets={res.bets} />;
}
