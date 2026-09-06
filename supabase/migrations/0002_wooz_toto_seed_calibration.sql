-- ============================================================
-- 토토 Z — 캘리브레이션 곡선 시드
-- src/lib/methodology.js 의 CAL_VX / CAL_VY 와 동일해야 한다(단일 진실원).
-- 곡선 재적합(rolling window) 시 새 row를 append 하여 버전관리(PRD §3).
-- ============================================================

insert into wooz_toto_calibration (window_desc, curve)
select
  '엑셀 11,834경기 기준 (methodology v1.0.0)',
  '{"vx":[0,5,15,25,35,45,55,65,75,85,95.5,100],"vy":[3,14.8,23.2,28.5,32.7,40.8,47.6,52.1,56.7,68.4,81.3,88]}'::jsonb
where not exists (select 1 from wooz_toto_calibration);
