import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Footer, Header, MobileNav } from "@/components/SiteChrome";
import PawCursor from "@/components/PawCursor";
import { BonusReminder, ScrollMoon } from "@/components/Engage";
import { ToastProvider } from "@/components/Toast";
import { MotionPrefProvider } from "@/lib/motion-pref";
import "./globals.css";
import { SITE } from "@/lib/site";

// 文字はすべて丸ゴシック（M PLUS Rounded 1c）の 1 書体にそろえ、読み込むフォントを減らす。
// 日本語の分割ファイルが多くビルド時の一括取得が失敗するため、ブラウザで Google Fonts から読み込む（使う文字の分だけ取得される）
const ROUND_FONT_CSS = "https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;900&display=swap";

const DESCRIPTION = `チケットでガチャを引いてポイントを貯め、人気のデジタルギフトと交換しよう。${SITE.name}。`;

// SNS で共有したときのカード（画像・タイトル）。画像の URL はアクセスされたドメインから作る（本番・デモのどちらでも正しく表示）
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return {
    metadataBase: new URL(`${proto}://${host}`),
    title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s｜${SITE.name}` },
    description: DESCRIPTION,
    icons: { icon: "/favicon.svg" },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      siteName: SITE.name,
      title: `${SITE.name} — ${SITE.tagline}`,
      description: DESCRIPTION,
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: `${SITE.name}：${SITE.tagline}` }],
    },
    twitter: { card: "summary_large_image", title: `${SITE.name} — ${SITE.tagline}`, description: DESCRIPTION, images: ["/og.jpg"] },
  };
}

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
