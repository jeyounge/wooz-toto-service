/**
 * betman.js — 베트맨(공식) 프로토 승부식 수집 (서버·배치 전용, 사용자 트리거 금지).
 *
 * gameInfoInq.do 응답:
 *   compSchedules {keys, datas}  게임 1행 = 경기 × 베팅유형
 *   voteStatus [{GM_SEQ, W_BET_CNT, D_BET_CNT, L_BET_CNT}]  국내 구매 건수
 * 결과: gameResult '0' 첫 선택 / '1' 무 / '2' 셋째 / '4' 적중특례, mchScore = 핸디 반영 스코어.
 */
const BASE = 'https://www.betman.co.kr';
const HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};
export const PROTO_GM_ID = 'G101';

/** POST + 재시도 (베트맨은 간헐적으로 ECONNRESET) */
async function post(path, body, referer, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + path, {
        method: 'POST',
        headers: { ...HEADERS, Referer: referer || `${BASE}/main/mainPage/gamebuy/buyableGameList.do` },
        body: JSON.stringify({ ...body, _sbmInfo: { debugMode: 'false' } }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`betman ${path} HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(`betman ${path}: ${lastErr?.cause?.code || lastErr?.message}`);
}

/** 현재 발매 중인 승부식 회차들 [{gmTs, saleEndTs}] */
export async function listOpenProtoRounds() {
  const j = await post('/buyPsblGame/inqCacheBuyAbleGameInfoList.do', {});
  return (j.protoGames || [])
    .filter((g) => g.gmId === PROTO_GM_ID)
    .map((g) => ({ gmTs: Number(g.gmTs), saleEndTs: g.saleEndDate ? new Date(g.saleEndDate).toISOString() : null }));
}

const num = (x) => (x == null || x === '' ? null : Number(x));
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

/** 회차 전체 게임 (정규화). 발매 전이면 배당 0. */
export async function fetchProtoRound(gmTs) {
  const j = await post('/buyPsblGame/gameInfoInq.do', { gmId: PROTO_GM_ID, gmTs: String(gmTs) },
    `${BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=${PROTO_GM_ID}&gmTs=${gmTs}`);
  if (!j.compSchedules) return [];
  const { keys, datas } = j.compSchedules;
  const bets = new Map((j.voteStatus || []).map((v) => [Number(v.GM_SEQ), v]));
  return datas.map((d) => Object.fromEntries(keys.map((k, i) => [k, d[i]]))).map((r) => {
    const b = bets.get(Number(r.matchSeq));
    const res = r.gameResult == null || r.gameResult === '' ? null : Number(r.gameResult);
    return {
      match_seq: Number(r.matchSeq),
      sport_code: r.itemCode,
      sport: r.itemName,
      league_code: r.leagueCode,
      league: r.leagueName,
      league_short: r.leagueShortName,
      home: r.homeName,
      away: r.awayName,
      game_ts: iso(r.gameDate),
      end_ts: iso(r.endDate),
      bet_type_id: String(r.betTypId),
      bet_type: r.betTypNm,
      handi: num(r.winHandi),
      txt_w: r.winTxt || null,
      txt_d: r.drawTxt && r.drawTxt !== '-' ? r.drawTxt : null,
      txt_l: r.loseTxt || null,
      odds_w: num(r.winAllot),
      odds_d: num(r.drawAllot),
      odds_l: num(r.loseAllot),
      bets_w: b ? num(b.W_BET_CNT) : null,
      bets_d: b ? num(b.D_BET_CNT) : null,
      bets_l: b ? num(b.L_BET_CNT) : null,
      proto_status: r.protoStatus == null ? null : String(r.protoStatus),
      result_idx: [0, 1, 2, 4].includes(res) ? res : null,
      result_score: r.mchScore || null,
    };
  });
}
