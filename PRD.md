# 토토 Z (Toto Z) — 기획서 (PRD)

> **한 줄**: 17년치(2010~2026) 축구 승무패 투표율·결과 데이터로 시장 편향(favorite-longshot)을 계량해 회차별 확률·티켓 인사이트를 제공하는, Z-Labs의 데이터 분석 서비스.
> **포지셔닝**: 로또 Z의 형제, 우제트 베이스볼의 축구판. **개인 분석·기록·교육용**(사행성 조장 아님).
> 작성: 2026-09-05 · 담당: Wooz · 상태: 기획 확정, 개발 착수 대기

---

## 0. 전제 (고정 스펙 — 변경 금지)

- **런타임**: Node.js
- **DB/Auth/Storage**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **호스팅/배포/크론**: Vercel (Next.js 권장 · Vercel Cron · Serverless Functions)
- **생태계**: Z-Labs 패밀리. 기존 서비스(`lotto.z-labs.kr`, `balance.z-labs.kr`, `wooz.z-labs.kr`)의 코드·디자인·SEO·수익화(AdSense) 컨벤션을 **그대로 재사용**.
- **도메인**: 서비스 `toto.z-labs.kr` / 소개 `z-labs.kr/services/toto` / 블로그 `z-labs.kr/blog`(SEO).
- **네이밍**: 토토 Z (Toto Z). 시그니처 전략 브랜딩 = "앵커 규율 · 컨트래리언 · favorite-longshot 엣지".

> Claude Code 작업 시 **먼저 기존 z-labs 레포의 구조·컨벤션을 읽고 그대로 따를 것**. 본 문서와 충돌 시 기존 컨벤션 우선.

---

## 1. 문제 정의 & 가치

- 축구 승무패(14경기 승/무/패 예측)는 대중 투표율에 **체계적 편향**이 있다: 홈·정배 과대평가, 무·원정 과소평가(favorite-longshot).
- 우리는 17년치 데이터로 이 편향을 **캘리브레이션 곡선**(투표율→실제 적중률)으로 계량하고, 규칙엔진·조합수학으로 **회차별 확률·티켓 구조**를 제안한다.
- 로또 Z가 "빈도·패턴", 우제트 베이스볼이 "승률 모델"이듯, **토토 Z는 "시장 편향 계량 + 조합 최적화"**가 정체성.
- 목표는 "당첨"이 아니라 **예측→결과 로깅 루프**로 엣지를 검증·개선하는 데이터 실험(합법·개인 기록 범위).

---

## 2. 데이터 모델 (Supabase / Postgres)

> 인수인계 문서 §6.2 스키마를 Postgres로 확정. snake_case, `id bigint generated always as identity` 기본, 시계열은 `timestamptz`.

```
rounds        (id, season, round_no, league_mix, sales_open_ts, deadline_ts, note, status)
matches       (id, round_id fk, match_no, league, home, away, kickoff_ts,
               unique(round_id, match_no))
votes         (id, match_id fk, snapshot_ts, vote_h, vote_d, vote_l, total_votes)   -- 시계열(발매~마감)
form          (id, match_id fk, side['home'/'away'], last5 jsonb, streak, injuries jsonb)
h2h           (id, match_id fk, all_time_wdl, season_wdl, recent_trend)
model_probs   (id, match_id fk, p_win, p_draw, p_lose, source['cal'/'devig'/'form'],
               rules_applied jsonb, computed_ts)
tickets       (id, round_id fk, owner_id fk nullable, kind['main'/'satellite'],
               budget, combos, structure, marks jsonb, exp_rank_probs jsonb, created_ts)
overrides     (id, ticket_id fk, match_no, from_mark, to_mark, reason, by['model'/'gut'])
results       (id, match_id fk, result['승'/'무'/'패'])
ticket_results(id, ticket_id fk, wrong_cnt, rank)
kpi_log       (id, round_id fk, our_hit, crowd_hit, draw_hit, rule_hits jsonb)
calibration   (id, fit_ts, window_desc, curve jsonb)   -- vote%→적중% 곡선 버전관리
```

- **RLS**: Phase 1은 공개 read(rounds/matches/votes/model_probs/results/kpi_log) + admin write. Phase 2에서 `tickets.owner_id = auth.uid()` 소유자 정책.
- **인덱스**: `matches(round_id)`, `votes(match_id, snapshot_ts)`, `results(match_id)`.

---

## 3. 파이프라인 (주간 루프)

```
[Vercel Cron 주 1회+마감직전]
 1) 수집   betinfo 스크래퍼 → 대진·투표율(시계열)  (EUC-KR 디코더 필수)
 2) 폼/H2H  외부 소스 어댑터(worldfootball/soccerway 등) → form/h2h
 3) 캘리브레이션  votes → model_probs (vote%→적중% 곡선, 3결과 재정규화)
 4) 규칙엔진  규칙0~4 + 폼 오버레이 + 붕괴홈 금지 + 2nd 3%p 룰
 5) 조합기  예산→구조(2^더블) + Poisson-binomial 등수 + **패커버≥3 제약**
 6) 로거   결과 크롤 → results/ticket_results/kpi_log
```

- **수집은 서버 크론만** 트리거(사용자가 스크래핑 유발 금지 — 부하·합법성). 사용자에겐 **저장된 결과만 서빙**.
- **캘리브레이션은 rolling window 재적합**(엣지 소멸/변동 대비, 예: 2026 원정강세). `calibration` 테이블에 버전 저장.
- **EUC-KR 팀명 디코더**: betinfo 팀명이 깨지므로 투표율·킥오프·순위표로 대진 매핑(하단 부록 규칙).

---

## 4. 핵심 방법론 (제품 IP — 그대로 코드화)

- **캘리브레이션 곡선**(엑셀 11,834경기): 투표율 버킷별 실제 적중률
  `<10%→14.8 · 20~30%→28.5 · 40~50%→40.8 · 60~70%→52.1 · 80~90%→68.4 · 90%+→81.3`
  변환: `vx=[0,5,15,25,35,45,55,65,75,85,95.5,100], vy=[3,14.8,23.2,28.5,32.7,40.8,47.6,52.1,56.7,68.4,81.3,88]` → 세 결과 각각 보간 후 합=100 재정규화.
- **규칙0** de-vig 우선(라이브 배당 없으면 캘리브레이션 대체).
- **규칙1** 80~85% 초강세 정배 무 헤지 · **규칙2** K리그 강팀홈 −10%p · **규칙3** K리그 무 +2%p.
- **규칙4** 이월 컨트래리언(과대정배 페이드·저평가 무/원정 흡수, 메인=모델최적 / 위성=무·원정 다른세계).
- **48회차 교훈A** 붕괴팀(연속완패) 홈정배 단식 승 금지 → 승·무 더블.
- **48회차 교훈B** 2nd 결과 3%p 이내 단식 금지 → 더블/명시 희생.
- **패커버 룰(신설·중요)**: 엑셀 807개 14경기 회차 중 **패 1개 이하는 4.0%뿐(96%가 패 2+, 중앙값 4)** → **티켓 패 커버 최소 3 강제**. 코인에서 "무 드롭 승·패 더블"이 패 커버 확보에 유용.
- **조합수학**: 조합수=2^(더블수). 32=9단5더, 64=8단6더. 등수=Poisson-binomial 전개(G0=1등…G0~G3=4등내).

---

## 5. 화면 (프론트)

> 기존 회차별 단일 HTML 대시보드(cream #F5F4EF / pine #0F5C4A / Space Grotesk·Inter·JetBrains Mono, 4탭·차트·시뮬레이터·실시간추적)를 **회차 선택형 SPA + Supabase API**로 승격. lotto/wooz의 페이지·헤더·푸터·광고 슬롯 컴포넌트 재사용.

- **메인**: 회차 셀렉터 → 대진·마킹 / 경기별 분석 / 티켓·조합수학(시뮬레이터) / 방법론·규칙적용 (기존 4탭 이식).
- **실시간 추적**: 경기 결과 입력/자동반영 → 틀린개수·등수 실시간(기존 로직 재사용).
- **방법론 페이지**: 캘리브레이션·베이스레이트·패커버 룰 공개(교육 포지셔닝).
- **소개/블로그**: `z-labs.kr/services/toto` + SEO 블로그(회차 프리뷰·사후분석·방법론 해설). 로또 Z/우제트 블로그 톤 계승.
- **수익화**: 기존 AdSense 슬롯 컨벤션 그대로.

---

## 6. 마일스톤

### Phase 1 — 지인 공유 MVP (`toto.z-labs.kr` Live)
1. Supabase 스키마 + RLS(공개 read/admin write).
2. 엑셀 852회차 시드 적재 + 캘리브레이션 곡선 산출/저장.
3. betinfo 스크래퍼(EUC-KR 디코더) + Vercel Cron(주간·마감직전).
4. 규칙엔진 + 조합기(패커버≥3) → model_probs·tickets 생성.
5. 회차 선택 SPA(기존 4탭 이식) 배포. 인증 없음(링크 공유).
6. z-labs.kr/services/toto 소개 + 첫 블로그.

### Phase 2 — 공개 서비스 (회원)
7. Supabase Auth(카카오/구글) + `tickets.owner_id` RLS.
8. 유저 티켓 저장·나의 로깅·KPI 히스토리(우제 vs 대중 적중률 등).
9. 결과 로거 자동화 + 주간 리포트/블로그 자동 초안.
10. AdSense·SEO 최적화, 방법론 유료/프리미엄 검토.

---

## 7. 비기능 / 리스크 / 준법

- **부하·합법**: 스크래핑은 서버 크론만. betinfo robots/부하 존중, 캐시.
- **사행성 오해 방지(중요)**: 전 화면·카피에 "개인 분석·기록·교육용, 베팅 권유 아님" 명시. 미성년 접근·직접 베팅 링크 금지. 로또 Z와 동일 기조.
- **엣지 소멸**: 캘리브레이션 rolling 재적합, 규칙 버전관리로 성능 추적.
- **개인 촉(override) 로깅**: 모델 대비 EV 검증(우제 vs 대중 KPI).
- **표본 한계**: 주 1회 → 당첨보다 "top픽 적중률 vs 대중" 연속지표로 성능 평가.

---

## 부록 A. betinfo EUC-KR 디코딩 규칙
팀명 깨짐 → (1) 하단 순위표(리그 소속·W-D-L)로 팀 식별, (2) 투표율 패턴+킥오프(KST)로 대진 매핑, (3) 리그 판별(EPL 순위표에 없으면 세리에A 등). 임의 추정 금지, 3중 교차검증.

## 부록 B. 도메인 용어
앵커(클래스격차 확실 단식) · 컨트래리언(이월 차별화) · de-vig(배당 마진 제거) · 우제확률(모델 승/무/패) · 단식/더블 · 무매그넷 · 권외(4등 밖) · 패커버(원정 커버 경기수).
