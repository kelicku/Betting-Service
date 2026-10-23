/**
 * サイト名・キャラクターなど、サイト全体で使う表示の設定（ここを変えると全画面に反映される）。
 * サイト名は環境変数 NEXT_PUBLIC_SITE_NAME でも変更できる（ビルド時に反映。メールの差出人名などはバックエンドの APP_NAME）。
 */

export const SITE = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "わくわくガチャ",
  nameEn: process.env.NEXT_PUBLIC_SITE_NAME_EN || "WAKUWAKU GACHA",
  tagline: "遊んで貯めて、好きなギフトに交換！",
  /** サイトの顔となるオリジナルキャラクター（宝箱に入った猫）。名前が決まったら name に入れる */
  mascot: {
    name: "",
    greeting: "いっしょにお宝をさがそう！",
    face: "/images/waku/cat-face.webp",
    full: "/images/waku/hero-cat.webp",
  },
} as const;
