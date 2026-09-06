-- ============================================================
-- 토토 Z — 초기 스키마 (PRD.md §2)
-- 기존 z-labs Supabase 인스턴스 공유 → 모든 테이블 wooz_toto_ 프리픽스로 격리.
-- 컨벤션: snake_case · id bigint generated always as identity · 시계열 timestamptz.
-- RLS: Phase1 = 공개 read + admin(service_role) write.
-- ============================================================

-- ─────────────────────────────────────────────
-- rounds: 회차
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_rounds (
  id            bigint generated always as identity primary key,
  season        text,
  round_no      integer not null,
  league_mix    text,
  sales_open_ts timestamptz,
  deadline_ts   timestamptz,
  note          text,
  status        text default 'scheduled',  -- scheduled | open | closed | settled
  created_ts    timestamptz not null default now(),
  unique (season, round_no)
);

-- ─────────────────────────────────────────────
-- matches: 경기 (회차당 14경기)
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_matches (
  id         bigint generated always as identity primary key,
  round_id   bigint not null references wooz_toto_rounds(id) on delete cascade,
  match_no   integer not null,
  league     text,
  home       text,
  away       text,
  kickoff_ts timestamptz,
  unique (round_id, match_no)
);

-- ─────────────────────────────────────────────
-- votes: 투표율 시계열 (발매~마감)
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_votes (
  id          bigint generated always as identity primary key,
  match_id    bigint not null references wooz_toto_matches(id) on delete cascade,
  snapshot_ts timestamptz not null default now(),
  vote_h      numeric,   -- 승 투표율 %
  vote_d      numeric,   -- 무 투표율 %
  vote_l      numeric,   -- 패 투표율 %
  total_votes bigint
);

-- ─────────────────────────────────────────────
-- form: 팀 폼 (최근5·연속·부상)
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_form (
  id       bigint generated always as identity primary key,
  match_id bigint not null references wooz_toto_matches(id) on delete cascade,
  side     text not null check (side in ('home','away')),
  last5    jsonb,
  streak   integer,
  injuries jsonb,
  unique (match_id, side)
);

-- ─────────────────────────────────────────────
-- h2h: 상대전적
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_h2h (
  id           bigint generated always as identity primary key,
  match_id     bigint not null references wooz_toto_matches(id) on delete cascade,
  all_time_wdl jsonb,
  season_wdl   jsonb,
  recent_trend text,
  unique (match_id)
);

-- ─────────────────────────────────────────────
-- model_probs: 우제확률 (모델 승/무/패)
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_model_probs (
  id            bigint generated always as identity primary key,
  match_id      bigint not null references wooz_toto_matches(id) on delete cascade,
  p_win         numeric,
  p_draw        numeric,
  p_lose        numeric,
  source        text check (source in ('cal','devig','form')),
  rules_applied jsonb,
  computed_ts   timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- tickets: 티켓 (메인/위성). Phase1 owner_id nullable(링크 공유).
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_tickets (
  id             bigint generated always as identity primary key,
  round_id       bigint not null references wooz_toto_rounds(id) on delete cascade,
  owner_id       uuid references auth.users(id) on delete set null,  -- Phase2 소유자
  kind           text check (kind in ('main','satellite')),
  budget         integer,
  combos         integer,             -- 조합수 = 2^더블수
  structure      text,                -- 예: "9단5더"
  marks          jsonb,               -- 경기별 마킹(승/무/패, 단식/더블)
  exp_rank_probs jsonb,               -- Poisson-binomial 등수 확률
  created_ts     timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- overrides: 개인 촉(override) 로깅
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_overrides (
  id        bigint generated always as identity primary key,
  ticket_id bigint not null references wooz_toto_tickets(id) on delete cascade,
  match_no  integer,
  from_mark text,
  to_mark   text,
  reason    text,
  by        text check (by in ('model','gut'))
);

-- ─────────────────────────────────────────────
-- results: 경기 결과
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_results (
  id       bigint generated always as identity primary key,
  match_id bigint not null references wooz_toto_matches(id) on delete cascade,
  result   text check (result in ('승','무','패')),
  unique (match_id)
);

-- ─────────────────────────────────────────────
-- ticket_results: 티켓 채점 (틀린개수·등수)
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_ticket_results (
  id        bigint generated always as identity primary key,
  ticket_id bigint not null references wooz_toto_tickets(id) on delete cascade,
  wrong_cnt integer,
  rank      integer,
  unique (ticket_id)
);

-- ─────────────────────────────────────────────
-- kpi_log: 우제 vs 대중 KPI
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_kpi_log (
  id         bigint generated always as identity primary key,
  round_id   bigint not null references wooz_toto_rounds(id) on delete cascade,
  our_hit    integer,
  crowd_hit  integer,
  draw_hit   integer,
  rule_hits  jsonb,
  created_ts timestamptz not null default now(),
  unique (round_id)
);

-- ─────────────────────────────────────────────
-- calibration: 투표율→적중률 곡선 버전관리
-- ─────────────────────────────────────────────
create table if not exists wooz_toto_calibration (
  id          bigint generated always as identity primary key,
  fit_ts      timestamptz not null default now(),
  window_desc text,
  curve       jsonb   -- {"vx":[...], "vy":[...]}
);

-- ============================================================
-- 인덱스 (PRD §2)
-- ============================================================
create index if not exists idx_wooz_toto_matches_round      on wooz_toto_matches(round_id);
create index if not exists idx_wooz_toto_votes_match_ts      on wooz_toto_votes(match_id, snapshot_ts);
create index if not exists idx_wooz_toto_results_match       on wooz_toto_results(match_id);
create index if not exists idx_wooz_toto_model_probs_match   on wooz_toto_model_probs(match_id);
create index if not exists idx_wooz_toto_tickets_round       on wooz_toto_tickets(round_id);
create index if not exists idx_wooz_toto_tickets_owner       on wooz_toto_tickets(owner_id);

-- ============================================================
-- RLS — Phase 1: 공개 read + admin(service_role) write
--   service_role은 RLS를 우회하므로 write 정책 불필요(수집 파이프라인 전용).
--   anon/authenticated에는 SELECT 정책만 부여 → write 차단.
--   tickets/overrides/ticket_results의 소유자 write는 Phase 2에서 추가.
-- ============================================================
do $$
declare
  tbl text;
  public_read text[] := array[
    'wooz_toto_rounds','wooz_toto_matches','wooz_toto_votes','wooz_toto_form',
    'wooz_toto_h2h','wooz_toto_model_probs','wooz_toto_tickets','wooz_toto_overrides',
    'wooz_toto_results','wooz_toto_ticket_results','wooz_toto_kpi_log','wooz_toto_calibration'
  ];
begin
  foreach tbl in array public_read loop
    execute format('alter table %I enable row level security;', tbl);
    execute format('drop policy if exists "public_read" on %I;', tbl);
    execute format(
      'create policy "public_read" on %I for select to anon, authenticated using (true);',
      tbl
    );
  end loop;
end $$;
