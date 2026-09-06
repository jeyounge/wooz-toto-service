# 토토 Z (Toto Z)

축구 승무패(14경기) **시장편향 계량 + 조합 인사이트** 서비스. Z-Labs 패밀리(로또 Z의 형제, 우제트 베이스볼의 축구판).

> **포지셔닝: 개인 분석·기록·교육용.** 사행성/베팅 권유 서비스가 아닙니다.

프로젝트 컨텍스트는 [`CLAUDE.md`](./CLAUDE.md), 기획은 [`PRD.md`](./PRD.md) 참조.

---

## 스택

- **Next.js 15 (App Router)** + React 19
- **Tailwind CSS 3.4** (디자인 토큰: `tailwind.config.js`)
- **Supabase** (`@supabase/ssr` — server/client 분리)
- **Vercel** 배포 (`toto.z-labs.kr`)
- AdSense 슬롯은 기존 z-labs 컨벤션 재사용

기존 z-labs 서비스(`z-labs-landing`, `wooz-lotto-service`)의 구조·env·디자인 토큰·AdSense 컨벤션을 계승합니다.

---

## 실행법

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.example`을 복사해 `.env.local` 생성 후 값 채우기:

```bash
cp .env.example .env.local
```

| 변수 | 설명 | 노출 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 브라우저 O |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (RLS 보호) | 브라우저 O |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (크론/시드/스크래퍼 전용) | **서버 전용** |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | AdSense 퍼블리셔 ID | 브라우저 O |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회하므로 서버 경로(`createAdminClient`)에서만 사용하고 클라이언트에 절대 노출하지 마세요.

### 3. 개발 서버

```bash
npm run dev
```

→ http://localhost:3000

### 4. 프로덕션 빌드 / 실행

```bash
npm run build
npm run start
```

### 5. 린트

```bash
npm run lint
```

---

## 디렉토리 구조 (현재 = 뼈대)

```
src/
  app/
    layout.jsx           # 루트 레이아웃: 폰트 + AdSense + Header/Footer/사행성 고지
    page.jsx             # 홈 (placeholder)
    methodology/page.jsx # 방법론 공개 (placeholder, 교육 포지셔닝)
    globals.css          # Tailwind + 디자인 토큰 base
  components/
    Header.jsx           # 상단 고정 네비 (z-labs 컨벤션)
    Footer.jsx           # 푸터 + 정책 링크
    AdSlot.jsx           # AdSense 슬롯 (뼈대: 플레이스홀더)
    ResponsibleNotice.jsx# 사행성 오해 방지 고지 (공통 레이아웃 필수)
  lib/
    methodology.js       # ⭐ 방법론 IP 상수 (CAL_VX/VY, 규칙0~4, 교훈, 패커버≥3, 조합수학, 베이스레이트)
    supabase/
      client.js          # 브라우저 Supabase 클라이언트
      server.js          # 서버 클라이언트 + createAdminClient (service_role)
```

> **현 단계는 스캐폴드(뼈대)입니다.** 화면 로직·데이터 파이프라인·규칙엔진·조합기는 후속 작업(`CLAUDE.md` 작업 순서 00→09)에서 구현합니다.

---

## 방법론 상수 (`src/lib/methodology.js`)

제품 핵심 IP. **임의 변경 금지** — 변경 시 커밋 메시지에 근거(회차·데이터) 명시.

- `CAL_VX` / `CAL_VY` — 캘리브레이션 곡선(투표율→적중률, 엑셀 11,834경기)
- `RULES` — 규칙 0(de-vig 우선)~4(이월 컨트래리언)
- `LESSONS` — 48회차 교훈 A(붕괴홈 단식금지)/B(2nd 3%p 이내 단식금지)
- `AWAY_COVER` — 패커버 ≥3 강제
- `COMBINATORICS` — 조합수=2^더블수, Poisson-binomial 등수
- `BASE_RATES` — 역대/2026 베이스레이트

---

## 준법 / 가드레일

- 사행성 오해 방지 고지(`ResponsibleNotice`)를 모든 화면 공통 레이아웃에 노출합니다.
- 직접 베팅 링크·미성년 유도 금지.
- 스크래핑/크론은 서버 전용. 사용자 요청으로 외부 스크래핑 트리거 금지.
- 개인정보/약관은 기존 z-labs(`z-labs.kr/privacy`, `/terms`) 계승.
