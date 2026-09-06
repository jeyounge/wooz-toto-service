import Link from 'next/link';

/**
 * Footer — z-labs 푸터 컨벤션 계승. 저작권 + 정책 링크(뼈대).
 * 사행성 방지 고지는 ResponsibleNotice가 담당(레이아웃에서 이 위에 배치).
 */
export default function Footer() {
  return (
    <footer className="border-t border-line bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-display font-bold text-ink">
            토토 Z <span className="text-pine">.</span>
            <span className="ml-2 font-sans text-xs font-normal text-sub">by Z-Labs</span>
          </div>
          <nav className="flex items-center gap-4 text-xs text-sub">
            <Link href="/methodology" className="hover:text-pine">방법론</Link>
            <a href="https://z-labs.kr/services/toto" className="hover:text-pine">소개</a>
            <a href="https://z-labs.kr/blog" className="hover:text-pine">블로그</a>
            <a href="https://z-labs.kr/terms" className="hover:text-pine">이용약관</a>
            <a href="https://z-labs.kr/privacy" className="hover:text-pine">개인정보</a>
          </nav>
        </div>
        <p className="mt-6 text-center text-xs text-sub">
          © {new Date().getFullYear()} Z-Labs. 토토 Z — 개인 분석·기록·교육용 데이터 서비스.
        </p>
      </div>
    </footer>
  );
}
