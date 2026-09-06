/**
 * tables.js — Supabase 테이블 이름 (단일 관리)
 *
 * 토토 Z는 기존 z-labs Supabase 프로젝트(로또 서비스와 동일 인스턴스)를 공유한다.
 * rounds/matches/results/votes 등 흔한 이름이 다른 서비스와 충돌하지 않도록
 * 모든 테이블에 프리픽스를 강제한다. 프리픽스 변경은 이 파일 한 줄만 수정.
 *
 * 쿼리 예: supabase.from(TABLES.rounds)  // → wooz_toto_rounds
 */
export const TABLE_PREFIX = 'wooz_toto_';

const t = (name) => `${TABLE_PREFIX}${name}`;

export const TABLES = {
  rounds: t('rounds'),
  matches: t('matches'),
  votes: t('votes'),
  form: t('form'),
  h2h: t('h2h'),
  modelProbs: t('model_probs'),
  tickets: t('tickets'),
  overrides: t('overrides'),
  results: t('results'),
  ticketResults: t('ticket_results'),
  kpiLog: t('kpi_log'),
  calibration: t('calibration'),
};
