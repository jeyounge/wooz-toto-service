-- ============================================================
-- 토토 Z — 프로토 승부식(G101) 수집·예측·적중 기록
-- 회차(gm_ts, 예 260138) → 게임(경기×베팅유형 1행) → 예측(모델 버전별 1행)
--
-- 카테고리 구조: 종목(sport_code) > 리그(league_code) > 베팅유형(bet_type_id)
--   화면은 종목 탭 + 리그 칩 + 유형 칩으로 필터, 적중률은 세 축 모두로 집계.
--
-- 결과 인덱스(result_idx): 0=첫 선택(승/언더/홀) 1=무(또는 핸디 무) 2=셋째(패/오버/짝) 4=적중특례(무효)
-- 재실행 안전(if not exists / drop policy if exists).
-- ============================================================

create table if not exists wooz_toto_proto_rounds (
  id            bigint generated always as identity primary key,
  gm_ts         integer not null unique,          -- 베트맨 회차키 (YY + 4자리 회차) 예: 260138
  sale_end_ts   timestamptz,                      -- 회차 전체 발매 마감
  status        text not null default 'open',     -- open / closed / settled
  created_ts    timestamptz not null default now(),
  updated_ts    timestamptz not null default now()
);

create table if not exists wooz_toto_proto_games (
  id            bigint generated always as identity primary key,
  round_id      bigint not null references wooz_toto_proto_rounds(id) on delete cascade,
  match_seq     integer not null,                 -- 베트맨 게임번호 (회차 내 유일)
  sport_code    text not null,                    -- SC 축구 / BK 농구 / VL 배구 / BS 야구
  sport         text not null,
  league_code   text,
  league        text,                             -- 예: 잉글랜드 프리미어리그
  league_short  text,                             -- 예: EPL
  home          text not null,
  away          text not null,
  game_ts       timestamptz,                      -- 킥오프
  end_ts        timestamptz,                      -- 발매 마감
  bet_type_id   text not null,                    -- 1 승무패 / 2 승패 / 3 승N패 / 4 정수핸디 / 5 소수핸디 / 7 언더오버 / 9 홀짝 / 13 세트핸디
  bet_type      text not null,
  handi         numeric,                          -- 홈 기준 핸디 또는 언오버 기준점
  txt_w         text, txt_d text, txt_l text,     -- 선택지 표기 (승/무/패, 언더/-/오버 …)
  odds_w        numeric, odds_d numeric, odds_l numeric,   -- 국내 배당 (0 = 미발매 선택지)
  bets_w        integer, bets_d integer, bets_l integer,   -- 국내 구매 건수 (쏠림 계산용)
  proto_status  text,                             -- 베트맨 상태코드 (2 발매중, 4 결과확정 …)
  result_idx    smallint check (result_idx in (0, 1, 2, 4)),
  result_score  text,                             -- 베트맨 mchScore (핸디 반영 스코어)
  result_ts     timestamptz,                      -- 결과 마킹 시각
  updated_ts    timestamptz not null default now(),
  unique (round_id, match_seq)
);

create index if not exists idx_wooz_toto_proto_games_round on wooz_toto_proto_games(round_id);
create index if not exists idx_wooz_toto_proto_games_cat on wooz_toto_proto_games(sport_code, league_code, bet_type_id);
create index if not exists idx_wooz_toto_proto_games_pending on wooz_toto_proto_games(game_ts) where result_idx is null;

create table if not exists wooz_toto_proto_preds (
  id                bigint generated always as identity primary key,
  game_id           bigint not null references wooz_toto_proto_games(id) on delete cascade,
  model_version     text not null default 'v1',
  p_w               numeric, p_d numeric, p_l numeric,   -- 예측 확률 (합 1)
  prob_source       text not null,                 -- domestic(국내배당 디빅) / espn(해외 디빅) / espn_spread(해외 스프레드 파생)
  pick_idx          smallint not null check (pick_idx in (0, 1, 2)),   -- 적중 예측 = 최고 확률
  pick_prob         numeric,
  pick_odds         numeric,
  value_idx         smallint check (value_idx in (0, 1, 2)),         -- 가치 픽 = 기대값 최고 (확률 20%+)
  value_ev          numeric,                       -- 가치 픽의 국내배당 × 확률
  crowd_share       numeric,                       -- 예측 픽의 국내 구매 비중 (0~1)
  flags             text[],                        -- 과열정배 / 저평가무 / 해외배당 등
  created_ts        timestamptz not null default now(),
  unique (game_id, model_version)
);

create index if not exists idx_wooz_toto_proto_preds_game on wooz_toto_proto_preds(game_id);

-- RLS: 공개 read + service_role write (다른 토토 테이블과 동일)
alter table wooz_toto_proto_rounds enable row level security;
alter table wooz_toto_proto_games  enable row level security;
alter table wooz_toto_proto_preds  enable row level security;
drop policy if exists "public_read" on wooz_toto_proto_rounds;
drop policy if exists "public_read" on wooz_toto_proto_games;
drop policy if exists "public_read" on wooz_toto_proto_preds;
create policy "public_read" on wooz_toto_proto_rounds for select to anon, authenticated using (true);
create policy "public_read" on wooz_toto_proto_games  for select to anon, authenticated using (true);
create policy "public_read" on wooz_toto_proto_preds  for select to anon, authenticated using (true);
