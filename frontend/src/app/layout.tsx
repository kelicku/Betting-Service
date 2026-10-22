import type { Metadata, Viewport } from "next";
import { Footer, Header, MobileNav } from "@/components/SiteChrome";
import PawCursor from "@/components/PawCursor";
import { BonusReminder, ScrollMoon } from "@/components/Engage";
import { ToastProvider } from "@/components/Toast";
import { MotionPrefProvider } from "@/lib/motion-pref";
import "./globals.css";

// 文字はすべて丸ゴシック（M PLUS Rounded 1c）の 1 書体にそろえ、読み込むフォントを減らす。
// 日本語の分割ファイルが多くビルド時の一括取得が失敗するため、ブラウザで Google Fonts から読み込む（使う文字の分だけ取得される）
const ROUND_FONT_CSS = "https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;900&display=swap";

export const metadata: Metadata = {
  title: { default: "わくわくガチャ — 遊んで貯めて、好きなギフトに交換！", template: "%s｜わくわくガチャ" },
  description: "チケットでガチャを引いてポイントを貯め、人気のデジタルギフトと交換しよう。わくわくガチャ。",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={ROUND_FONT_CSS} />
      </head>
      <body>
        <MotionPrefProvider>
          <ToastProvider>
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-night">
              本文へスキップ
            </a>
            <Header />
            <main id="main" className="pb-safe">
              {children}
            </main>
            <Footer />
            <BonusReminder />
            <ScrollMoon />
            <PawCursor />
            <MobileNav />
          </ToastProvider>
        </MotionPrefProvider>
      </body>
    </html>
  );
}
