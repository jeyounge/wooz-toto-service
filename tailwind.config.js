/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // CLAUDE.md 디자인 토큰 (기존 대시보드 계승)
      colors: {
        paper: '#F5F4EF',
        card: '#FCFBF8',
        ink: '#16130F',
        sub: '#6B665C',
        line: '#E2DFD6',
        pine: '#0F5C4A',   // accent
        // 결과색
        home: '#2A78D6',   // 승
        draw: '#C98500',   // 무
        away: '#D85A30',   // 패
      },
      fontFamily: {
        // next/font 변수 (src/app/layout.jsx에서 주입)
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'], // 제목
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],            // 본문
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'], // 숫자/라벨
      },
    },
  },
  plugins: [],
}
