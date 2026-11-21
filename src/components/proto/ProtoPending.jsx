/** 승부식 데이터가 없거나 불러오지 못했을 때 */
export default function ProtoPending({ message = '수집 배치가 아직 실행되지 않았습니다.' }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-32 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">승부식 데이터 준비 중</h1>
      <p className="mt-2 text-sm text-sub">{message}</p>
    </div>
  );
}
