-- ============================================================
-- 토토 Z — 팀→리그 사전 테이블
-- 데이터에 리그 정보가 없어 팀명으로 판별한 결과를 저장한다.
-- name은 정규화(공백제거) 팀명. league null = 미상(후속 보완).
-- ============================================================
create table if not exists wooz_toto_teams (
  name       text primary key,
  league     text,
  updated_ts timestamptz not null default now()
);

alter table wooz_toto_teams enable row level security;
drop policy if exists "public_read" on wooz_toto_teams;
create policy "public_read" on wooz_toto_teams for select to anon, authenticated using (true);
