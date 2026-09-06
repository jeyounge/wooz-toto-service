"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

/**
 * Header — z-labs 헤더 컨벤션 계승(고정 상단바 + 모바일 햄버거).
 * 토토 Z 디자인 토큰(paper/ink/pine) 적용. 링크는 뼈대 단계 기본 구성.
 */
export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const links = [
    { to: '/', label: '홈' },
    { to: '/methodology', label: '방법론' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-paper/90 backdrop-blur-md shadow-sm border-b border-line' : 'bg-paper/70 backdrop-blur-sm'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2 font-display font-extrabold text-xl text-ink tracking-tight">
            토토 Z <span className="text-pine">.</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.to}
                href={link.to}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                  pathname === link.to
                    ? 'bg-pine/10 text-pine'
                    : 'text-sub hover:text-pine hover:bg-card'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg text-sub hover:bg-card"
            aria-label="메뉴 열기"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden pb-4 border-t border-line mt-1">
            <div className="flex flex-col gap-1 pt-3">
              {links.map((link) => (
                <Link
                  key={link.to}
                  href={link.to}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${
                    pathname === link.to ? 'bg-pine/10 text-pine' : 'text-ink hover:bg-card'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
