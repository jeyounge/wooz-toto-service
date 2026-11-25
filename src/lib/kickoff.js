/**
 * kickoff.js — betinfo '일시' 셀 → kickoff_ts(ISO, KST 기준) 변환 (순수함수).
 * 셀 표기가 회차마다 조금씩 달라 숫자만 뽑아 해석한다:
 *   '2026-11-29 21:30' · '26.11.29 21:30' · '11-29 (토) 21:30' · '11/29 21:30' · '11.29'
 * 연도가 없으면 회차 시즌 연도를 쓰되, 12월 회차에 1월 경기가 섞이면 다음 해로 넘긴다.
 * 해석이 안 되면 null (DB에는 kickoff_ts null 그대로).
 */
export function parseKickoff(raw, { season } = {}) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const dm = /(?:(\d{2,4})[-./년]\s*)?(\d{1,2})[-./월]\s*(\d{1,2})/.exec(s);
  if (!dm) return null;
  const tm = /(\d{1,2}):(\d{2})/.exec(s.slice(dm.index + dm[0].length));
  let year = dm[1] ? Number(dm[1]) : null;
  if (year != null && year < 100) year += 2000;
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year == null) {
    const base = Number(season) || new Date().getFullYear();
    year = base;
  }
  const hh = tm ? Number(tm[1]) : 0;
  const mi = tm ? Number(tm[2]) : 0;
  if (hh > 23 || mi > 59) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mi)}:00+09:00`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/**
 * 한 회차 경기들의 kickoff 목록 → 연도 넘김 보정.
 * 연도 없는 표기에서 12월 경기와 1월 경기가 함께 있으면 1월 쪽을 다음 해로 옮긴다.
 */
export function parseRoundKickoffs(raws, { season } = {}) {
  const list = raws.map((r) => ({ raw: r, iso: parseKickoff(r, { season }), explicitYear: /\d{2,4}[-./년]\s*\d{1,2}[-./월]\s*\d{1,2}/.test(String(r || '')) }));
  const months = list.filter((x) => x.iso && !x.explicitYear).map((x) => Number(x.iso.slice(5, 7)));
  const spansNewYear = months.includes(12) && months.includes(1);
  return list.map((x) => {
    if (!x.iso || x.explicitYear || !spansNewYear || Number(x.iso.slice(5, 7)) !== 1) return x.iso;
    return `${Number(x.iso.slice(0, 4)) + 1}${x.iso.slice(4)}`;
  });
}

/** 화면 표기: '11/29(토) 21:30' (KST) */
export function fmtKickoff(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.month}/${parts.day}(${parts.weekday}) ${parts.hour}:${parts.minute}`;
}
