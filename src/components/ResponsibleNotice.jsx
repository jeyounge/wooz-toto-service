/**
 * ResponsibleNotice — 사행성 오해 방지 고지 (필수).
 * CLAUDE.md 가드레일 / PRD §7: 전 화면 카피에 "개인 분석·기록·교육용, 베팅 권유 아님" 명시.
 * 공통 레이아웃(푸터 위)에 항상 노출한다. 직접 베팅 링크·미성년 유도 금지.
 *
 * @param {'banner'|'inline'} variant
 */
export default function ResponsibleNotice({ variant = 'banner' }) {
  if (variant === 'inline') {
    return (
      <p className="text-xs text-sub leading-relaxed">
        본 서비스는 <strong>개인 분석·기록·교육 목적</strong>의 데이터 도구이며, 베팅을 권유하지
        않습니다. 어떠한 당첨·수익도 보장하지 않습니다.
      </p>
    );
  }

  return (
    <aside
      role="note"
      className="border-t border-line bg-paper px-4 py-4 text-center"
    >
      <p className="mx-auto max-w-3xl text-xs leading-relaxed text-sub">
        ⚠️ <strong className="text-ink">토토 Z는 개인 분석·기록·교육용 데이터 서비스입니다.</strong>{' '}
        스포츠토토 등 사행 행위를 권유하거나 대행하지 않으며, 직접 베팅 링크를 제공하지 않습니다.
        모든 확률·조합 정보는 통계적 참고 자료일 뿐 당첨이나 수익을 보장하지 않습니다.
        만 19세 미만의 이용을 권장하지 않습니다.
      </p>
    </aside>
  );
}
