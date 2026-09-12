-- ============================================================
-- 토토 Z — 경기별 뉴스 분석 근거 컬럼
-- 관리자 "뉴스 반영 재분석"(Claude + 웹검색) 결과를 저장.
-- ============================================================
alter table wooz_toto_matches add column if not exists news_reason     text;
alter table wooz_toto_matches add column if not exists news_updated_ts  timestamptz;
