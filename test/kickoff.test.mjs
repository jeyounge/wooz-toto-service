import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKickoff, parseRoundKickoffs, fmtKickoff } from '../src/lib/kickoff.js';

test('parseKickoff: 연-월-일 시:분', () => {
  assert.equal(parseKickoff('2026-11-29 21:30'), '2026-11-29T21:30:00+09:00');
  assert.equal(parseKickoff('26.11.29 21:30'), '2026-11-29T21:30:00+09:00');
});

test('parseKickoff: 연도 없는 표기는 시즌 연도', () => {
  assert.equal(parseKickoff('11-29 (토) 21:30', { season: '2026' }), '2026-11-29T21:30:00+09:00');
  assert.equal(parseKickoff('11/30 04:00', { season: '2026' }), '2026-11-30T04:00:00+09:00');
  assert.equal(parseKickoff('11.29', { season: '2026' }), '2026-11-29T00:00:00+09:00');
});

test('parseKickoff: 해석 불가 → null', () => {
  assert.equal(parseKickoff(''), null);
  assert.equal(parseKickoff('미정'), null);
  assert.equal(parseKickoff('13-40 21:30'), null);
});

test('parseRoundKickoffs: 12월 회차의 1월 경기는 다음 해', () => {
  assert.deepEqual(parseRoundKickoffs(['12-31 23:00', '01-01 02:00'], { season: '2026' }),
    ['2026-12-31T23:00:00+09:00', '2027-01-01T02:00:00+09:00']);
});

test('fmtKickoff: KST 표기', () => {
  assert.equal(fmtKickoff('2026-11-29T21:30:00+09:00'), '11/29(일) 21:30');
  assert.equal(fmtKickoff(null), null);
});
