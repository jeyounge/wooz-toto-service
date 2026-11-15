import { CAL_VX, CAL_VY, CAL_VY_DRAW, AWAY_COVER, BASE_RATES, METHODOLOGY_VERSION } from '@/lib/methodology';
import ResponsibleNotice from '@/components/ResponsibleNotice';

export const metadata = {
  title: '방법론 | 토토 Z',
  description:
    '토토 Z의 방법론 공개: 캘리브레이션 곡선(투표율→적중률), 베이스레이트, 패커버 룰. 교육 목적.',
};

/**
 * 방법론 페이지 (뼈대) — 교육 포지셔닝. 상수 노출 확인용 placeholder.
 * 상세 시각화·수식 설명은 후속 작업.
 */
export default function MethodologyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="font-display text-3xl font-extrabold text-ink">방법론</h1>
      <p className="mt-3 font-sans text-sm text-sub">
        토토 Z는 시장 편향을 계량합니다. 아래는 공개 상수의 일부입니다 (교육 목적, 방법론 v
        {METHODOLOGY_VERSION}).
      </p>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-ink">캘리브레이션 곡선 (투표율 → 적중률)</h2>
        <p className="mt-2 font-sans text-sm text-sub">
          엑셀 11,834경기 기준. 투표율 버킷별 실제 적중률을 보간해 세 결과를 재정규화합니다. 무는 투표가 많이 몰려도 실제 무 비율이 25~30%에서 잘 오르지 않아 전용 곡선을 씁니다(v1.1, 11,606경기).
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-line text-sub">
                <th className="px-3 py-2 text-left">투표율 %</th>
                {CAL_VX.map((x) => (
                  <th key={x} className="px-3 py-2 text-right">{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 text-left text-sub">승·패 적중률 %</td>
                {CAL_VY.map((y, i) => (
                  <td key={i} className="px-3 py-2 text-right text-ink">{y}</td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2 text-left text-sub">무 적중률 %</td>
                {CAL_VY_DRAW.map((y, i) => (
                  <td key={i} className="px-3 py-2 text-right text-ink">{y}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-ink">패커버 룰</h2>
        <p className="mt-2 font-sans text-sm text-sub">{AWAY_COVER.RATIONALE}</p>
        <p className="mt-1 font-mono text-sm text-ink">
          최소 패 커버 = {AWAY_COVER.MIN_AWAY_COVER}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-ink">베이스레이트</h2>
        <ul className="mt-2 font-mono text-sm text-ink space-y-1">
          <li>역대: 승 {BASE_RATES.ALL_TIME.win} / 무 {BASE_RATES.ALL_TIME.draw} / 패 {BASE_RATES.ALL_TIME.lose}</li>
          <li>2026: 승 {BASE_RATES.Y2026.win} / 무 {BASE_RATES.Y2026.draw} / 패 {BASE_RATES.Y2026.lose} <span className="text-sub">(원정강세 이상치)</span></li>
        </ul>
      </section>

      <div className="mt-12">
        <ResponsibleNotice variant="inline" />
      </div>
    </div>
  );
}
