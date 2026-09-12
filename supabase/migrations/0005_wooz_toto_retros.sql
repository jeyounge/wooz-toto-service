-- ============================================================
-- 토토 Z — 복기(회고) 테이블
-- 회차 결과 후 마킹 vs 실제 대조 → 틀린 이유 분석·데이터화 → 규칙 접목.
-- 핵심: controllable(통제가능) 플래그로 '이변(노이즈)'과 '개선가능 실수'를 구분.
--   → controllable=true 인 miss_type 빈도만 누적해 규칙/파라미터 튜닝 근거로 사용.
--
-- miss_type 권장값(느슨한 text, 필요시 확장):
--   '이변'         : 늦은골/VAR/퇴장 등 통제 불가 (controllable=false)
--   '저득점무'     : 양팀 저조 0-0류 무
--   '정배과신'     : favorite-longshot 실현(모델 정배였으나 무/패)
--   '무_미커버'    : 무매그넷 놓침
--   '패_미커버'    : 더블/단식이 원정승 미커버
-- ============================================================
create table if not exists wooz_toto_retros (
  id            bigint generated always as identity primary key,
  round_id      bigint not null references wooz_toto_rounds(id) on delete cascade,
  match_no      integer not null,
  predicted     text,                         -- 마킹 (예: '승·무')
  actual        text check (actual in ('승','무','패')),
  wrong         boolean not null default false,
  miss_type     text,                         -- 위 권장값 (틀린 경기만)
  controllable  boolean,                      -- 이변이면 false → 튜닝 집계 제외
  reason        text,                         -- 틀린(또는 특기할) 원인 서술
  lesson        text,                         -- 다음 분석에 적용할 교훈
  created_ts    timestamptz not null default now(),
  unique (round_id, match_no)
);

create index if not exists idx_wooz_toto_retros_round on wooz_toto_retros(round_id);
create index if not exists idx_wooz_toto_retros_misstype on wooz_toto_retros(miss_type);

-- RLS: 공개 read + service_role write (다른 테이블과 동일)
alter table wooz_toto_retros enable row level security;
drop policy if exists "public_read" on wooz_toto_retros;
create policy "public_read" on wooz_toto_retros for select to anon, authenticated using (true);
