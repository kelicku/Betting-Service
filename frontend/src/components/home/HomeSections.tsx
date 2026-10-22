"use client";

/**
 * トップページの下半分（参考画像「Colorful Fantasy Gacha Game Landing Page」の再現）。
 * 寸法は 1440px 幅で参考画像（1024px）× 1.406 になるように指定している。
 */

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { useRef } from "react";
import { OutlineText } from "@/components/SiteChrome";
import { TicketIcon, cx } from "@/components/ui";
import { useMe } from "@/lib/hooks";
import { AmazonLogo, AppleLogo, DigicoLogo, EshopLogo, GooglePlayLogo, PlayStationStoreLogo } from "./BrandLogos";
import type { GachaSummary, Rarity } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString("ja-JP");
const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-white/80 px-3 py-1.5 font-round text-xs font-bold sm:gap-1 sm:px-4 sm:text-sm text-[#1d3fa8] shadow-[0_2px_8px_-4px_rgba(30,60,160,0.4)] transition hover:bg-white hover:text-[#ff3b7f] lg:text-[1.05rem]">
      {children}
      <Chevron className="h-4 w-4" />
    </Link>
  );
}

/* ---------------- キャンペーン（3 枚のカード） ---------------- */

export function PromoCards({ signupTickets, signupPoints }: { signupTickets: number; signupPoints: number }) {
  const { me } = useMe();
  return (
    <section className="relative z-10 mx-auto max-w-[1316px] px-4 lg:px-0" aria-label="キャンペーン">
      <div className="grid gap-4 md:grid-cols-3 lg:gap-[22px]">
        <motion.div {...reveal}>
          <Link href={me ? "/earn" : "/register"} className="promo-card group flex h-[150px] items-center gap-3 bg-[linear-gradient(110deg,#ffe0ec,#fff0f5_55%,#ffe6f0)] px-4 lg:h-[165px] lg:gap-3 lg:pl-5 lg:pr-4">
            <Image src="/images/waku/promo-gift.webp" alt="" width={113} height={118} className="h-[100px] w-auto shrink-0 transition-transform group-hover:-rotate-6 group-hover:scale-105 lg:h-[118px]" />
            <div className="flex-1 font-round font-black leading-tight text-[#ff2f6e]">
              <p className="text-[1.05rem] lg:text-[1.45rem]">新規会員登録で</p>
              {/* ポイントの特典があればポイント（参考デザインの表示）、なければチケットを表示 */}
              <p className="text-[2rem] leading-[1.15] tracking-[-0.02em] lg:text-[2.7rem]">
                {signupPoints > 0 ? (
                  <>
                    {fmt(signupPoints)}
                    <span className="ml-0.5 text-[1.4rem] lg:text-[1.9rem]">pt</span>
                  </>
                ) : (
                  <>
                    <span className="text-[1.3rem] lg:text-[1.7rem]">チケット</span>
                    {signupTickets > 0 ? fmt(signupTickets) : "—"}
                    <span className="ml-0.5 text-[1.4rem] lg:text-[1.9rem]">枚</span>
                  </>
                )}
              </p>
              <p className="text-[1.05rem] lg:text-[1.45rem]">プレゼント！</p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#ff5d8f,#f0215e)] text-white shadow-[0_4px_10px_-3px_rgba(240,33,94,0.7)] transition-transform group-hover:translate-x-1 lg:h-[3.1rem] lg:w-[3.1rem]">
              <Chevron className="h-6 w-6" />
            </span>
          </Link>
        </motion.div>
        <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.08 }}>
          <Link href="/earn" className="promo-card group flex h-[150px] items-center gap-3 bg-[linear-gradient(110deg,#dcecff,#eef6ff_55%,#e1efff)] px-4 lg:h-[165px] lg:gap-3 lg:pl-5 lg:pr-4">
            <Image src="/images/waku/promo-mission.webp" alt="" width={119} height={116} className="h-[90px] w-auto shrink-0 transition-transform group-hover:-rotate-6 group-hover:scale-105 lg:h-[108px]" />
            <div className="flex-1 font-round font-black leading-snug text-[#1846b8]">
              <p className="whitespace-nowrap text-[1.05rem] lg:text-[1.38rem]">毎日できる！</p>
              <p className="whitespace-nowrap text-[1.05rem] lg:text-[1.38rem]">無料でポイントをGET</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="rounded-full bg-[linear-gradient(180deg,#3f8bff,#1d5be0)] whitespace-nowrap px-5 py-1 text-[0.8rem] font-bold text-white shadow-[0_3px_8px_-3px_rgba(29,91,224,0.8)] lg:px-8 lg:py-1.5 lg:text-[0.95rem]">ミッション一覧へ</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#cfe0ff] bg-white text-[#1d5be0] transition-transform group-hover:translate-x-1 lg:h-10 lg:w-10">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                    <path d="M5 11h9.2l-3.6-3.6L12 6l6 6-6 6-1.4-1.4 3.6-3.6H5z" />
                  </svg>
                </span>
              </div>
            </div>
          </Link>
        </motion.div>
        <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.16 }}>
          <Link href="/shop" className="promo-card group flex h-[150px] items-center gap-3 bg-[linear-gradient(110deg,#fff0d6,#fff8ea_55%,#ffefd8)] px-4 lg:h-[165px] lg:gap-3 lg:pl-5 lg:pr-4">
            <Image src="/images/waku/promo-exchange.webp" alt="" width={117} height={120} className="h-[100px] w-auto shrink-0 transition-transform group-hover:-rotate-6 group-hover:scale-105 lg:h-[120px]" />
            <div className="flex-1 font-round font-black leading-snug text-[#e8343a]">
              <p className="whitespace-nowrap text-[1.05rem] lg:text-[1.38rem]">貯めたポイントで</p>
              <p className="whitespace-nowrap text-[1.05rem] lg:text-[1.38rem]">デジタルギフトと交換！</p>
              <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#ffb23f,#f08a12)] px-6 py-1 text-[0.8rem] font-bold text-white shadow-[0_3px_8px_-3px_rgba(240,138,18,0.8)] lg:px-12 lg:py-1.5 lg:text-[1rem]">
                交換先をみる
                <Chevron className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------------- セクション見出し ---------------- */

function SectionHead({ icon, children, more, className }: { icon: React.ReactNode; children: React.ReactNode; more?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-end justify-between gap-3", className)}>
      <h2 className="flex min-w-0 items-end gap-1.5 whitespace-nowrap font-round font-black tracking-[-0.02em] sm:gap-2">
        {icon}
        {children}
      </h2>
      {more}
    </div>
  );
}

/* ---------------- ピックアップガチャ ---------------- */

const GOLD_BADGE = /人気|ラスト/;

export function PickupGachas({ gachas }: { gachas: GachaSummary[] }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 300) + 22), behavior: "smooth" });
  };
  return (
    <section className="relative mx-auto mt-7 max-w-[1316px] px-4 lg:mt-[16px] lg:px-0" aria-labelledby="pickup-title">
      <SectionHead
        icon={<Image width={84} height={56} src="/images/waku/crown.webp" alt="" className="h-auto mb-1 w-10 sm:w-14 lg:w-[84px]" />}
        more={<MoreLink href="/gacha"><span className="sm:hidden">すべて見る</span><span className="hidden sm:inline">すべてのガチャを見る</span></MoreLink>}
      >
        <span id="pickup-title" className="grad-text grad-navy text-[1.3rem] leading-none sm:text-[1.7rem] lg:text-[2.75rem]">
          ピックアップガチャ
        </span>
      </SectionHead>
      {gachas.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white/80 p-8 text-center text-[#5a5f88]">現在公開中のガチャはありません。</p>
      ) : (
        <div className="relative mt-2 lg:mt-[10px]">
          <div ref={track} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pt-1 [scrollbar-width:none] lg:gap-[22px] [&::-webkit-scrollbar]:hidden">
            {gachas.map((g, i) => (
              <motion.div key={g.id} data-card {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className="w-[82%] shrink-0 snap-start sm:w-[46%] lg:w-[calc((100%-44px)/3)]">
                <GachaCard g={g} index={i} />
              </motion.div>
            ))}
          </div>
          {gachas.length > 1 && (
            <>
              <button onClick={() => scroll(-1)} aria-label="前のガチャ" className="carousel-arrow absolute left-[-6px] top-[42%] z-10 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full sm:flex lg:left-[-12px] min-[1400px]:left-[-35px]">
                <Chevron className="h-7 w-7 rotate-180" />
              </button>
              <button onClick={() => scroll(1)} aria-label="次のガチャ" className="carousel-arrow absolute right-[-6px] top-[42%] z-10 hidden h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full sm:flex lg:right-[-12px] min-[1400px]:right-[-35px]">
                <Chevron className="h-7 w-7" />
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function GachaCard({ g, index }: { g: GachaSummary; index: number }) {
  const sold = g.remaining === 0;
  return (
    <Link href={`/gacha/${g.slug}`} className="gacha-frame group block h-[296px]" aria-label={`${g.title}（1回 チケット${g.ticket_cost}枚）`}>
      <div className="relative h-[216px] overflow-hidden">
        {g.banner_image_url ? (
          <Image src={g.banner_image_url} alt="" fill sizes="(min-width:1024px) 430px, 82vw" className="gacha-art object-cover" />
        ) : (
          <div className="gacha-art h-full w-full bg-[linear-gradient(135deg,#ffd6e8,#d9e8ff)]" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-b from-transparent to-white/95" />
        {g.badge && (
          <span className={cx("ribbon-badge left-[7%] top-[13px] font-round text-[0.95rem] lg:text-[1.2rem]", GOLD_BADGE.test(g.badge) ? "ribbon-gold" : "ribbon-red")}>{g.badge}</span>
        )}
        {sold && <span className="absolute right-3 top-3 rounded-full bg-[#1d2350]/80 px-3 py-1 text-xs font-bold text-white">完売</span>}
        <div className="absolute inset-x-0 bottom-1 text-center">
          {g.subtitle && g.subtitle.length <= 8 && (
            <OutlineText stroke={6} className="font-round text-[1rem] font-black text-[#ff2f5e] lg:text-[1.2rem]">
              {g.subtitle}
            </OutlineText>
          )}
          <OutlineText stroke={10} className="block font-round text-[1.9rem] font-black leading-[1.15] tracking-[-0.03em] lg:text-[2.5rem]">
            <span className={cx("grad-text", index % 3 === 2 ? "grad-magenta" : "grad-red")}>{g.title}</span>
          </OutlineText>
        </div>
      </div>
      <div className="flex h-[80px] items-center justify-center gap-2 font-round text-[#1d2350]">
        <TicketIcon className="waku-coin-spin h-8 w-8" />
        <span className="text-lg font-bold">1回</span>
        <span className="text-[2rem] font-black tabular-nums tracking-[-0.02em]">{fmt(g.ticket_cost)}</span>
        <span className="text-lg font-black">枚</span>
      </div>
    </Link>
  );
}

/* ---------------- 豪華な景品ラインナップ ---------------- */

export type FeaturedPrize = { id: number; name: string; subtitle: string; rarity: Rarity; image_url: string | null; gacha_slug: string | null };

export function PrizeLineup({ prizes }: { prizes: FeaturedPrize[] }) {
  if (prizes.length === 0) return null;
  return (
    <section className="relative mx-auto mt-6 max-w-[1316px] px-4 lg:mt-[22px] lg:px-0" aria-labelledby="lineup-title">
      <SectionHead
        icon={<Image width={66} height={44} src="/images/waku/crown.webp" alt="" className="h-auto mb-0.5 w-9 sm:w-11 lg:w-[66px]" />}
        more={<MoreLink href="/gacha">もっと見る</MoreLink>}
      >
        <span id="lineup-title" className="text-[1.12rem] leading-none text-[#1d2350] sm:text-[1.4rem] lg:text-[2.15rem]">
          豪華な景品ラインナップ
        </span>
      </SectionHead>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-[14px] lg:grid-cols-6 lg:gap-[18px] lg:px-[14px]">
        {prizes.slice(0, 6).map((p, i) => {
          const body = (
            <>
              <div className="relative mx-auto mt-3 h-[96px] w-[86%] lg:mt-[18px] lg:h-[106px]">
                {p.image_url && <Image src={p.image_url} alt="" fill sizes="200px" className="object-contain transition-transform duration-500 group-hover:scale-110" />}
              </div>
              <p className="mt-2 px-1 text-center font-round text-[0.85rem] font-bold leading-snug text-[#1d2350] lg:mt-[12px] lg:text-[1.02rem]">
                {p.name}
                {p.subtitle && <span className="block">{p.subtitle}</span>}
              </p>
            </>
          );
          return (
            <motion.div key={p.id} {...reveal} transition={{ ...reveal.transition, delay: i * 0.05 }}>
              {p.gacha_slug ? (
                <Link href={`/gacha/${p.gacha_slug}`} className="lineup-tile group block h-[180px] lg:h-[196px]">
                  {body}
                </Link>
              ) : (
                <div className="lineup-tile group h-[180px] lg:h-[196px]">{body}</div>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- 遊び方 ---------------- */

const STEPS = [
  { n: 1, title: "チケットを獲得", text: ["広告視聴やミッションで", "ガチャチケットをゲット！"], icon: "/images/waku/howto-ticket.webp", bg: "bg-[linear-gradient(135deg,#ffe3f0,#fff0f7)]", num: "bg-[linear-gradient(180deg,#ff6f9f,#f0215e)]", color: "text-[#f0215e]" },
  { n: 2, title: "ガチャを引く", text: ["チケットを使って", "ガチャを引こう！"], icon: "/images/waku/howto-gacha.webp", bg: "bg-[linear-gradient(135deg,#ddefff,#eef7ff)]", num: "bg-[linear-gradient(180deg,#4fb2ff,#1d6fe0)]", color: "text-[#1d6fe0]" },
  { n: 3, title: "ポイントを獲得", text: ["ガチャからポイントが", "出るよ！"], icon: "/images/waku/howto-coins.webp", bg: "bg-[linear-gradient(135deg,#e2f6df,#f0fbee)]", num: "bg-[linear-gradient(180deg,#5fd06a,#22a23a)]", color: "text-[#1f9a36]" },
  { n: 4, title: "ギフトと交換", text: ["貯めたポイントで", "好きなギフトと交換！"], icon: "/images/waku/howto-gift.webp", bg: "bg-[linear-gradient(135deg,#ffeedd,#fff6ec)]", num: "bg-[linear-gradient(180deg,#ff9c4a,#f0641a)]", color: "text-[#f0541a]" },
];

function Flourish() {
  return (
    <svg viewBox="0 0 360 40" className="hidden h-8 w-[300px] text-[#e8bf62] md:block lg:h-10 lg:w-[380px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M180 6l9 12-9 12-9-12z" fill="currentColor" fillOpacity=".25" />
      <path d="M170 18c-20 0-30-12-50-12s-26 14-44 14S50 8 30 12 8 22 2 20M190 18c20 0 30-12 50-12s26 14 44 14 26-12 46-8 22 10 28 8" />
      <path d="M120 6c-8 6-8 14 2 16M240 6c8 6 8 14-2 16" />
      <circle cx="76" cy="20" r="2" fill="currentColor" />
      <circle cx="284" cy="20" r="2" fill="currentColor" />
    </svg>
  );
}

export function HowToPlay() {
  return (
    <section className="relative mx-auto mt-7 max-w-[1316px] px-4 lg:mt-[32px] lg:px-0" aria-labelledby="howto-title">
      <div className="flex items-end gap-6 lg:pl-[10px]">
        <h2 id="howto-title" className="flex items-end gap-1.5 font-round font-black tracking-[-0.02em]">
          <Image width={98} height={74} src="/images/waku/cat-face.webp" alt="" className="h-auto w-16 lg:w-[98px]" />
          <span className="mb-1 whitespace-nowrap text-[1.25rem] leading-none sm:text-[1.45rem] lg:mb-2 lg:text-[2.1rem]">
            <span className="grad-text grad-magenta">わくわくガチャ</span>
            <span className="text-[#1d2350]">の遊び方</span>
          </span>
        </h2>
        <Flourish />
      </div>
      <ol className="mt-2 grid gap-3 sm:grid-cols-2 lg:mt-[10px] lg:grid-cols-[235fr_203fr_217fr_222fr] lg:gap-[17px] lg:px-[14px]">
        {STEPS.map((s, i) => (
          <motion.li key={s.n} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className={cx("howto-card relative h-[150px] overflow-hidden px-4 pt-4 lg:h-[163px] lg:px-5 lg:pt-[18px]", s.bg)}>
            <p className="flex items-center gap-3">
              <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-round text-xl font-black text-white shadow-[0_3px_6px_-2px_rgba(0,0,0,0.3)] lg:h-[2.85rem] lg:w-[2.85rem] lg:text-[1.55rem]", s.num)}>{s.n}</span>
              <span className={cx("font-round text-[1.25rem] font-black lg:text-[1.6rem]", s.color)}>{s.title}</span>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Image src={s.icon} alt="" width={86} height={80} className="h-[72px] w-[80px] shrink-0 object-contain lg:h-[80px] lg:w-[86px]" />
              <p className="whitespace-nowrap font-round text-[0.85rem] font-bold leading-[1.85] tracking-[-0.02em] text-[#2a2f5c] lg:text-[0.98rem]">
                {s.text[0]}
                <br />
                {s.text[1]}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------- 人気の交換先 ---------------- */

// 表示用の交換先（参考画像のロゴを SVG で再現。各社のロゴは商標のため、公開前に許諾を得ること）。実際に用意する景品に合わせて変更する
const BRANDS: { name: string; logo: React.ReactNode; cls: string; grow: number }[] = [
  { name: "Amazonギフトカード", logo: <AmazonLogo />, cls: "bg-[#131a22]", grow: 147 },
  { name: "Apple Gift Card", logo: <AppleLogo />, cls: "bg-[linear-gradient(135deg,#2b7cf7,#4f8dff_60%,#6a8cff)]", grow: 108 },
  { name: "Google Play ギフトコード", logo: <GooglePlayLogo />, cls: "bg-white ring-1 ring-[#e6dcf5]", grow: 116 },
  { name: "デジコ", logo: <DigicoLogo />, cls: "bg-white ring-1 ring-[#e6dcf5]", grow: 168 },
  { name: "Nintendo eShop", logo: <EshopLogo />, cls: "bg-[#e60012]", grow: 160 },
  { name: "PlayStation Store", logo: <PlayStationStoreLogo />, cls: "bg-[linear-gradient(180deg,#1166e0,#0a4fc4)]", grow: 160 },
];

export function PopularExchange() {
  return (
    <section className="relative mx-auto mt-8 max-w-[1316px] px-4 pb-10 lg:mt-[12px] lg:px-0 lg:pb-[22px]" aria-labelledby="exchange-title">
      <motion.div {...reveal} className="exchange-panel relative px-4 pb-5 pt-4 lg:h-[241px] lg:pb-0 lg:pl-[243px] lg:pr-[20px] lg:pt-[20px]">
        <Image width={246} height={274} src="/images/waku/footer-cat.webp" alt="" className="h-auto waku-float pointer-events-none absolute -bottom-6 -left-3 hidden w-[246px] lg:block" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 id="exchange-title" className="flex items-center gap-1 font-round text-[1.6rem] font-black text-[#ff2f6e] lg:text-[2.35rem]">
            <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 lg:h-9 lg:w-9" aria-hidden>
              <path d="M12 1.5c.8 5.6 3.4 8.6 10 10.5-6.6 1.9-9.2 4.9-10 10.5-.8-5.6-3.4-8.6-10-10.5 6.6-1.9 9.2-4.9 10-10.5z" fill="#ffd34a" stroke="#f3a712" strokeWidth=".8" />
            </svg>
            人気の交換先
          </h2>
          <p className="font-round text-sm font-bold text-[#2a2f5c] lg:text-[1.05rem]">貯めたポイントを、好きなデジタルギフトに交換できます！</p>
          <Link href="/shop" className="cta-pink ml-auto flex h-11 items-center gap-1 rounded-full px-6 font-round text-sm font-bold text-white transition hover:brightness-110 lg:h-[48px] lg:w-[260px] lg:justify-center lg:text-[1.2rem]">
            交換先一覧を見る
            <Chevron className="h-5 w-5" />
          </Link>
        </div>
        <ul className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:mt-[18px] lg:flex lg:gap-[15px]">
          {BRANDS.map((b) => (
            <li key={b.name} style={{ flexGrow: b.grow, flexBasis: 0 }}>
              <Link href="/shop" className={cx("brand-tile flex h-[72px] items-center justify-center px-2 lg:h-[112px]", b.cls)} aria-label={`${b.name}と交換する`}>
                {b.logo}
              </Link>
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
