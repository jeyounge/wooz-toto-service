-- ============================================================
-- 토토 Z — 프로토 승부식 개인 배팅 기록 (슬립 = 구매 1장, 레그 = 조합에 들어간 게임 1개)
--
-- 다중 사용자 전제: 모든 행은 Supabase Auth 사용자(user_id)에게 속하고 RLS로 본인 것만 읽고 쓴다.
--   is_public = true 슬립은 나중에 공유 화면에서 누구나 읽을 수 있다(기본 비공개).
-- 결과·적중금은 저장하지 않고 games.result_idx로 매번 계산한다(정산 배치 불필요, 결과 정정에도 안전).
--   단 실제 받은 금액이 다르면 payout_actual로 덮어쓴다.
-- 재실행 안전(if not exists / drop policy if exists).
-- ============================================================

create table if not exists wooz_toto_proto_bets (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  round_id       bigint not null references wooz_toto_proto_rounds(id) on delete cascade,
  stake          integer not null check (stake >= 100 and stake <= 100000 and stake % 100 = 0),  -- 구매금액(원)
  total_odds     numeric not null check (total_odds >= 1),   -- 구매 시점 조합 배당 (레그 배당 곱)
  model_prob     numeric,                                    -- 구매 시점 모델 적중확률 (레그 확률 곱, 독립 가정)
  payout_actual  integer,                                    -- 실제 받은 적중금(선택). null이면 계산값 사용
  note           text,
  is_public      boolean not null default false,
  placed_ts      timestamptz not null default now(),
  created_ts     timestamptz not null default now()
);

create table if not exists wooz_toto_proto_bet_legs (
  id          bigint generated always as identity primary key,
  bet_id      bigint not null references wooz_toto_proto_bets(id) on delete cascade,
  game_id     bigint not null references wooz_toto_proto_games(id) on delete cascade,
  pick_idx    smallint not null check (pick_idx in (0, 1, 2)),
  odds        numeric not null check (odds > 1),            -- 구매 시점 배당 (베트맨 배당 변동 대비 스냅샷)
  model_prob  numeric,                                       -- 구매 시점 모델 확률 스냅샷
  unique (bet_id, game_id)
);

create index if not exists idx_wooz_toto_proto_bets_user on wooz_toto_proto_bets(user_id, round_id);
create index if not exists idx_wooz_toto_proto_bet_legs_bet on wooz_toto_proto_bet_legs(bet_id);

alter table wooz_toto_proto_bets     enable row level security;
alter table wooz_toto_proto_bet_legs enable row level security;

drop policy if exists "own_all"     on wooz_toto_proto_bets;
drop policy if exists "public_read" on wooz_toto_proto_bets;
create policy "own_all" on wooz_toto_proto_bets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "public_read" on wooz_toto_proto_bets for select to anon, authenticated using (is_public);

drop policy if exists "own_all"     on wooz_toto_proto_bet_legs;
drop policy if exists "public_read" on wooz_toto_proto_bet_legs;
create policy "own_all" on wooz_toto_proto_bet_legs for all to authenticated
  using (exists (select 1 from wooz_toto_proto_bets b where b.id = bet_id and b.user_id = auth.uid()))
  with check (exists (select 1 from wooz_toto_proto_bets b where b.id = bet_id and b.user_id = auth.uid()));
create policy "public_read" on wooz_toto_proto_bet_legs for select to anon, authenticated
  using (exists (select 1 from wooz_toto_proto_bets b where b.id = bet_id and b.is_public));
