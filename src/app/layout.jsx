import './globals.css';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ResponsibleNotice from '@/components/ResponsibleNotice';

// 디자인 토큰 폰트 (CLAUDE.md): 제목=Space Grotesk, 본문=Inter, 숫자/라벨=JetBrains Mono
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-3270769447461406';

export const metadata = {
  title: '토토 Z | 축구 승무패 시장편향 계량 · 조합 인사이트',
  description:
    '토토 Z는 17년치 축구 승무패 데이터로 시장 편향(favorite-longshot)을 계량하고 회차별 확률·조합 인사이트를 제공하는 Z-Labs의 데이터 분석 서비스입니다. 개인 분석·기록·교육용.',
  keywords: '토토 Z, 축구 승무패, 캘리브레이션, favorite-longshot, 조합수학, Z-Labs',
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '토토 Z',
  url: 'https://toto.z-labs.kr',
  description: '축구 승무패 시장편향 계량 + 조합 인사이트 (개인 분석·기록·교육용).',
  publisher: { '@type': 'Organization', name: 'Z-Labs', url: 'https://z-labs.kr' },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="ko"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <meta name="google-adsense-account" content={ADSENSE_CLIENT} />
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          crossOrigin="anonymous"
        ></script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 pt-16">{children}</main>
        {/* 사행성 오해 방지 고지 — 전 화면 공통(필수) */}
        <ResponsibleNotice />
        <Footer />
      </body>
    </html>
  );
}
