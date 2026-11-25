-- ============================================================
-- 토토 Z — 프로토 승부식 "Claude 배팅" (모의 배팅 기록, src/lib/proto/bot.js)
--
-- 배치(scripts/proto-batch.mjs)가 규칙대로 회차 예산 안에서 스스로 산 슬립을 기록한다. 실제 구매 아님.
-- 사용자 배팅(0009)과 같은 모양이라 정산·집계(settleBet/summarizeBets)를 그대로 쓴다.
-- 쓰기는 service_role(배치)만, 읽기는 공개(비교 화면).
-- 재실행 안전(if not exists / drop policy if exists).
-- ============================================================

create table if not exists wooz_toto_proto_bot_bets (
  id           bigint generated always as identity primary key,
  bot          text not null default 'claude-v1',          -- 규칙 버전 (bot.js BOT_ID)
  round_id     bigint not null references wooz_toto_proto_rounds(id) on delete cascade,
  stake        integer not null check (stake >= 100 and stake <= 100000 and stake % 100 = 0),
  total_odds   numeric not null check (total_odds >= 1),
  model_prob   numeric,
  reason       text,                                       -- 고른 근거 (EV · 확률 · 규칙)
  placed_ts    timestamptz not null default now(),
  created_ts   timestamptz not null default now()
);

create table if not exists wooz_toto_proto_bot_bet_legs (
  id          bigint generated always as identity primary key,
  bet_id      bigint not null references wooz_toto_proto_bot_bets(id) on delete cascade,
  game_id     bigint not null references wooz_toto_proto_games(id) on delete cascade,
  pick_idx    smallint not null check (pick_idx in (0, 1, 2)),
  odds        numeric not null check (odds > 1),
  model_prob  numeric,
  unique (bet_id, game_id)
);

create index if not exists idx_wooz_toto_proto_bot_bets_round on wooz_toto_proto_bot_bets(bot, round_id);
create index if not exists idx_wooz_toto_proto_bot_bet_legs_bet on wooz_toto_proto_bot_bet_legs(bet_id);

alter table wooz_toto_proto_bot_bets     enable row level security;
alter table wooz_toto_proto_bot_bet_legs enable row level security;

drop policy if exists "public_read" on wooz_toto_proto_bot_bets;
drop policy if exists "public_read" on wooz_toto_proto_bot_bet_legs;
create policy "public_read" on wooz_toto_proto_bot_bets     for select to anon, authenticated using (true);
create policy "public_read" on wooz_toto_proto_bot_bet_legs for select to anon, authenticated using (true);
