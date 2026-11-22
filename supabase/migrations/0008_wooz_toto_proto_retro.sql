-- 0008 프로토 승부식 자동 복기 (규칙 기반, LLM 없음) + 마켓 이름
-- 재실행 안전(idempotent).

-- 마켓 이름(베트맨 betNm, 예: '축구 전반 승무패'). betTypNm만으로는 전반/풀타임이 구분되지 않는다.
alter table wooz_toto_proto_games add column if not exists bet_name text;

-- 배치가 결과 확정 후 예측 1건마다 실패 원인 태그를 붙인다. 적중은 빈 배열로 처리 완료만 표시.
alter table wooz_toto_proto_preds add column if not exists miss_tags  text[];       -- late_goal / penalty / red_card / dominated / wasteful / margin / coin / upset / draw_trap / overheat
alter table wooz_toto_proto_preds add column if not exists retro_note text;         -- 한 줄 복기 (예: 픽 승 72% → 무 1:1 · 90+1' 골 · 슈팅 25:6)
alter table wooz_toto_proto_preds add column if not exists retro_ts   timestamptz;  -- 복기 처리 시각 (null = 미처리)
