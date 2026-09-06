# CLAUDE.md — 토토 Z (Toto Z)

> Claude Code가 매 세션 자동으로 읽는 프로젝트 컨텍스트. 작업 전 이 파일과 `PRD.md`를 먼저 읽는다.
> **본 파일과 기존 z-labs 레포 컨벤션이 충돌하면 기존 컨벤션 우선.** 새 패턴을 만들기 전에 기존 서비스(lotto/wooz/balance) 코드를 먼저 확인할 것.

## 프로젝트 개요
- 축구 승무패(14경기) 시장편향 계량 + 조합 인사이트 서비스. Z-Labs 패밀리(로또 Z의 형제, 우제트 베이스볼의 축구판).
- 정체성: favorite-longshot 편향 계량 + 앵커 규율 + 컨트래리언 + 조합수학.
- 포지셔닝: **개인 분석·기록·교육용**(사행성/베팅 권유 아님) — 전 화면 카피에 명시.

## 고정 스택 (변경 금지)
- Node.js · Supabase(Postgres/Auth/Storage/Edge Functions) · Vercel(Next.js·Cron·Serverless).
- 배포: `toto.z-labs.kr` / 소개 `z-labs.kr/services/toto` / 블로그 `z-labs.kr/blog`.
- 수익화: 기존 AdSense 슬롯 컨벤션 재사용.
- 기존 z-labs 서비스의 디렉토리 구조·env 관리·Supabase 클라이언트 초기화·디자인 토큰을 재사용한다.

## 디자인 토큰 (기존 대시보드 계승)
- paper `#F5F4EF` / card `#FCFBF8` / ink `#16130F` / sub `#6B665C` / line `#E2DFD6` / pine(accent) `#0F5C4A`
- 결과색: 승(home) `#2A78D6` / 무(draw) `#C98500` / 패(away) `#D85A30`
- 폰트: Space Grotesk(제목) · Inter(본문) · JetBrains Mono(숫자/라벨). 숫자는 항상 tabular-nums.

## 방법론 IP (그대로 코드화 — 임의 변경 금지)
**캘리브레이션(투표율→실제적중%)**, 엑셀 11,834경기 기준:
```js
const CAL_VX = [0,5,15,25,35,45,55,65,75,85,95.5,100];
const CAL_VY = [3,14.8,23.2,28.5,32.7,40.8,47.6,52.1,56.7,68.4,81.3,88];
// model = 세 결과(vh,vd,vl) 각각 보간 → 합=100 재정규화
```
**규칙**: 0 de-vig 우선(없으면 캘리브레이션) · 1 초강세(80~85%) 무헤지 · 2 K리그 강팀홈 −10%p · 3 K리그 무 +2%p · 4 이월 컨트래리언(메인=모델최적/위성=무·원정).
**교훈A** 붕괴(연속완패)홈 정배 단식승 금지→더블. **교훈B** 2nd 3%p 이내 단식 금지→더블/명시희생.
**패커버 룰**: 807 14경기회차 중 패≤1은 4%뿐 → **패 커버 ≥3 강제**. 코인은 "무 드롭 승·패 더블"로 패커버 확보.
**조합수학**: 조합수=2^더블수. 등수=Poisson-binomial 전개(G0=1등…ΣG0~3=4등내).
**베이스레이트**: 역대 승42.9/무25.9/패31.1 · 2026 승38.1/무26.8/패35.1(원정강세 이상치).

## 데이터 모델
`PRD.md` §2 참조. 핵심 테이블: rounds, matches, votes(시계열), model_probs, tickets, results, kpi_log, calibration. snake_case, timestamptz, RLS(Phase1 공개read/admin write).
- **Supabase 인스턴스 공유**: 신규 프로젝트 생성 금지(무료 티어 제한). 기존 z-labs(로또 서비스) 프로젝트를 공유한다.
- **테이블 프리픽스 필수**: 충돌 방지 위해 모든 토토 테이블은 `wooz_toto_` 프리픽스. 테이블명은 `src/lib/tables.js`의 `TABLES` 상수로만 참조(하드코딩 금지). 예: `wooz_toto_rounds`.

## 도메인 용어(코드 주석·변수명에 일관 사용)
anchor(앵커) · contrarian · devig · model_probs(우제확률) · single/double(단식/더블) · draw_magnet(무매그넷) · out_of_prize(권외) · away_cover(패커버).

## 코딩 컨벤션
- 기존 z-labs 레포 스타일 우선. 없으면: ESM, async/await, 얇은 서비스 레이어, Supabase JS 클라이언트.
- 방법론 상수는 단일 모듈(`lib/methodology.js` 등)에 모아 버전관리. 규칙 변경은 커밋 메시지에 근거 명시.
- 스크래핑/크론은 서버 전용. 사용자 요청으로 외부 스크래핑 트리거 금지.
- 확률·조합 계산은 순수함수 + 유닛테스트(특히 Poisson-binomial, 캘리브레이션, 패커버≥3 제약).

## 가드레일
- 사행성 오해 방지 카피 필수. 직접 베팅 링크·미성년 유도 금지.
- betinfo 부하/robots 존중, 결과 캐시.
- 개인정보/약관은 기존 z-labs privacy/terms 계승.

## 작업 순서(프롬프트)
`prompts/` 또는 `CLI-PROMPTS.md`의 00→09 순서. 각 작업 전 관련 기존 코드 확인 → 구현 → 테스트 → 커밋.
