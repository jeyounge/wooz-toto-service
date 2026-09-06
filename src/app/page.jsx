import { BASE_RATES, METHODOLOGY_VERSION } from '@/lib/methodology';

/**
 * 홈 (뼈대) — 화면 로직은 후속 작업(CLI-PROMPTS 00→09).
 * 지금은 서비스 정체성과 스캐폴드 동작 확인용 placeholder만.
 */
export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <section className="text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-pine">Z-Labs · Toto Z</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold text-ink sm:text-5xl">
          축구 승무패, 감이 아니라 <span className="text-pine">데이터</span>로.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl font-sans text-base leading-relaxed text-sub">
          17년치 투표율·결과 데이터로 시장 편향(favorite-longshot)을 계량하고, 회차별 확률·조합
          인사이트를 제공합니다. 앵커 규율 · 컨트래리언 · 조합수학.
        </p>
      </section>

      {/* 베이스레이트 미리보기 (methodology 상수 연결 확인용) */}
      <section className="mx-auto mt-12 grid max-w-3xl grid-cols-3 gap-4">
        {[
          { label: '승 (Home)', v: BASE_RATES.ALL_TIME.win, color: 'text-home' },
          { label: '무 (Draw)', v: BASE_RATES.ALL_TIME.draw, color: 'text-draw' },
          { label: '패 (Away)', v: BASE_RATES.ALL_TIME.lose, color: 'text-away' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-card p-5 text-center">
            <div className={`font-mono text-3xl font-bold ${s.color}`}>{s.v}%</div>
            <div className="mt-1 font-sans text-xs text-sub">{s.label}</div>
          </div>
        ))}
      </section>
      <p className="mt-3 text-center font-mono text-xs text-sub">
        역대 베이스레이트 · 방법론 v{METHODOLOGY_VERSION}
      </p>

      <p className="mt-16 text-center font-sans text-sm text-sub">
        🚧 화면 로직은 준비 중입니다. 현재는 스캐폴드(뼈대) 단계입니다.
      </p>
    </div>
  );
}
