"use client";

/**
 * トップページのメインビジュアル（参考画像「Colorful Fantasy Gacha Game Landing Page」の再現）。
 * 背景：桜・富士山・お城・五重塔・鳥居の和の春景色／右：宝箱に乗った猫とコイン／左：キャッチコピー・説明・CTA。
 * 演出：花びらが舞う、きらめき、宝箱がふわふわ浮かぶ、CTA の光の帯（演出オフ・動きを減らす設定では止まる）。
 */

import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useMemo, useRef } from "react";
import { OutlineText } from "@/components/SiteChrome";
import { SITE } from "@/lib/site";

export type PublicStats = { members: number; tickets_earned: number; items: number; signup_bonus?: number; signup_bonus_points?: number };

function rand(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** 舞い落ちる花びら（位置は決定的に生成し、描画の揺れを防ぐ）。 */
function Petals({ count = 16 }: { count?: number }) {
  const petals = useMemo(() => {
    const r = rand(11);
    return Array.from({ length: count }, () => ({ x: r() * 100, s: 8 + r() * 10, delay: r() * 14, dur: 9 + r() * 8, drift: 40 + r() * 120 }));
  }, [count]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {petals.map((p, i) => (
        <span
          key={i}
          className="waku-petal"
          style={{ left: `${p.x}%`, width: p.s, height: p.s * 0.7, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, ["--drift" as string]: `${p.drift}px` }}
        />
      ))}
    </div>
  );
}

/** きらめき。 */
function Sparkles({ count = 18 }: { count?: number }) {
  const items = useMemo(() => {
    const r = rand(5);
    return Array.from({ length: count }, () => ({ x: 30 + r() * 70, y: 5 + r() * 80, s: 14 + r() * 22, d: r() * 3, t: 2 + r() * 2.5 }));
  }, [count]);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {items.map((st, i) => (
        <span key={i} className="waku-sparkle" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s`, animationDuration: `${st.t}s` }} />
      ))}
    </div>
  );
}

function Paw() {
  return (
    <svg viewBox="0 0 32 32" className="h-9 w-9 lg:h-[3.05rem] lg:w-[3.05rem]" aria-hidden>
      <g fill="#fff" stroke="#fff" strokeWidth="1.2">
        <ellipse cx="16" cy="21" rx="7.5" ry="6.5" />
        <ellipse cx="7.5" cy="13.5" rx="3.2" ry="4" />
        <ellipse cx="13" cy="8.5" rx="3.2" ry="4.2" />
        <ellipse cx="19" cy="8.5" rx="3.2" ry="4.2" />
        <ellipse cx="24.5" cy="13.5" rx="3.2" ry="4" />
      </g>
      <g fill="#ff8ab8">
        <ellipse cx="16" cy="21.6" rx="4.2" ry="3.6" />
        <ellipse cx="7.7" cy="13.8" rx="1.5" ry="2" />
        <ellipse cx="13.1" cy="8.9" rx="1.5" ry="2.1" />
        <ellipse cx="18.9" cy="8.9" rx="1.5" ry="2.1" />
        <ellipse cx="24.3" cy="13.8" rx="1.5" ry="2" />
      </g>
    </svg>
  );
}

export default function HomeHero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yBg = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const yCat = useTransform(scrollYProgress, [0, 1], ["0%", "-8%"]);

  return (
    <section ref={ref} className="relative -mt-16 h-[760px] overflow-hidden sm:h-[720px] lg:-mt-[5.25rem] lg:h-[770px]" aria-label="メインビジュアル">
      {/* 背景：桜と富士山、お城・五重塔・鳥居（日本の利用者向けの和の風景） */}
      <motion.div className="absolute inset-0" style={{ y: yBg }}>
        <Image src="/images/waku/hero-bg-jp.webp" alt="" fill priority sizes="100vw" className="object-cover object-[60%_top] sm:object-[50%_top] lg:object-top" />
      </motion.div>
      {/* スマートフォン：文字の背後を少し明るくする */}
      <div className="absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b from-white/50 via-white/25 to-transparent sm:hidden" />
      <Petals />
      <Sparkles />

      {/* 宝箱に乗った猫 */}
      <motion.div
        className="absolute bottom-[-2%] right-[-8%] w-[96%] sm:right-[-4%] sm:w-[60%] lg:bottom-auto lg:right-[1%] lg:top-[330px] lg:w-[44%]"
        style={{ y: yCat }}
        initial={{ opacity: 0, y: 40, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* キャラクターの吹き出し：きらめく雲（文字がひとつずつ弾む） */}
        <motion.div
          className="absolute left-[12%] top-[-7%] z-10 sm:left-auto sm:right-[12%] sm:top-[-15%] lg:left-[12%] lg:right-auto lg:top-[-5%]"
          initial={{ opacity: 0, scale: 0.4, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 1.1, type: "spring", stiffness: 220, damping: 13 }}
        >
          <DreamBubble text={SITE.mascot.name ? `${SITE.mascot.name}「${SITE.mascot.greeting}」` : SITE.mascot.greeting} />
        </motion.div>
        <div className="waku-float">
          <Image
            src={SITE.mascot.full}
            alt={`${SITE.name}のキャラクター：宝箱の上でバンザイする三毛猫`}
            width={1200}
            height={933}
            priority
            sizes="(min-width:1024px) 44vw, 96vw"
            className="h-auto w-full drop-shadow-[0_18px_30px_rgba(120,60,140,0.35)]"
          />
        </div>
      </motion.div>

      {/* 文字の背後の白い霞（参考画像の明るい雲の部分） */}
      <div className="hero-haze pointer-events-none absolute left-[-6%] top-[60px] h-[560px] w-[78%] sm:w-[62%] lg:left-[2%] lg:top-[110px] lg:h-[560px] lg:w-[58%]" aria-hidden />

      {/* 文字ブロック（1440px 幅のときに参考画像と同じ位置になるよう配置） */}
      <div className="relative mx-auto h-full max-w-[1440px] px-5 pt-[92px] sm:px-10 lg:pl-[105px] lg:pt-[178px]">
        <h1 className="hero-title-waku relative font-round font-black leading-[1.1] tracking-[-0.04em]">
          <motion.span
            className="relative block pl-[0.5em] text-[2.7rem] sm:text-[4.5rem] lg:pl-[46px] lg:text-[5.75rem]"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* 「貯めて」の上の王冠 */}
            <Image width={110} height={74} src="/images/waku/crown.webp" alt="" className="absolute left-[calc(0.5em+2.42em)] top-[-0.62em] h-auto w-[1.08em] lg:left-[calc(46px+2.42em)]" />
            <OutlineText stroke={9} className="hero-outline">
              <span className="grad-text grad-sky">遊</span>
              <span className="kana grad-text grad-sky">ん</span>
              <span className="kana grad-text grad-sky-violet">で</span>
              <span className="grad-text grad-sun">貯</span>
              <span className="kana grad-text grad-sun">めて</span>
            </OutlineText>
          </motion.span>
          <motion.span
            className="relative mt-[0.02em] block whitespace-nowrap text-[2.3rem] min-[400px]:text-[2.45rem] sm:text-[4rem] lg:text-[5.05rem]"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <OutlineText stroke={9} className="hero-outline">
              <span className="grad-text grad-sky">好</span>
              <span className="kana grad-text grad-sky">きな</span>
              <span className="kata grad-text grad-rose">ギフト</span>
              <span className="kana grad-text grad-rose">に</span>
              <span className="grad-text grad-rose">交換</span>
              <span className="grad-text grad-rose">！</span>
            </OutlineText>
          </motion.span>
        </h1>
        <motion.p
          className="hero-sub mt-4 font-round text-[1.2rem] font-bold leading-[1.62] tracking-[0.04em] text-[#1b2252] sm:text-[1.7rem] lg:mt-[22px] lg:pl-[44px] lg:text-[2.12rem]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.8 }}
        >
          <span className="lg:pl-[14px]">ガチャでポイントを集めて</span>
          <br />
          デジタルギフトと交換しよう！
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.6 }} className="mt-7 lg:mt-[40px] lg:pl-[8px]">
          <Link href="/gacha" className="waku-cta-frame group relative inline-block">
            {/* 金の縁の飾り（上下中央・左右の端） */}
            <svg viewBox="0 0 60 16" className="cta-orn absolute left-1/2 top-[-11px] w-[60px] -translate-x-1/2 lg:top-[-14px] lg:w-[84px]" aria-hidden>
              <path d="M30 1l4 6-4 6-4-6z" />
              <path d="M24 9c-6 0-9-5-15-5S2 7 1 9M36 9c6 0 9-5 15-5s7 3 8 5" fill="none" strokeWidth="2.2" />
            </svg>
            <svg viewBox="0 0 60 16" className="cta-orn absolute bottom-[-11px] left-1/2 w-[60px] -translate-x-1/2 rotate-180 lg:bottom-[-14px] lg:w-[84px]" aria-hidden>
              <path d="M30 1l4 6-4 6-4-6z" />
              <path d="M24 9c-6 0-9-5-15-5S2 7 1 9M36 9c6 0 9-5 15-5s7 3 8 5" fill="none" strokeWidth="2.2" />
            </svg>
            <span className="waku-cta sh-ribbon flex h-[4.4rem] w-[21.5rem] items-center pl-[32px] pr-[34px] font-round text-[1.3rem] font-bold tracking-[0.06em] text-white sm:w-[26rem] lg:h-[100px] lg:w-[540px] lg:pl-[46px] lg:pr-[50px] lg:text-[1.85rem] lg:[--c:30px]">
              <span className="cta-sheen-clip" aria-hidden />
              <span className="paw-badge sh-diamond flex h-12 w-12 shrink-0 items-center justify-center lg:h-[4.4rem] lg:w-[4.4rem]">
                <Paw />
              </span>
              <span className="flex-1 whitespace-nowrap text-center [text-shadow:0_2px_3px_rgba(170,0,70,0.35)]">今すぐガチャを引く</span>
              <svg viewBox="0 0 24 24" className="h-6 w-6 transition-transform group-hover:translate-x-1 lg:h-8 lg:w-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/** きらめく雲の吹き出し：虹色の光の輪、まわりで瞬く星、ひとつずつ弾む文字、猫へ続く小さな雲 */
function DreamBubble({ text }: { text: string }) {
  const chars = Array.from(text);
  const n = Math.max(chars.length - 1, 1);
  return (
    <div className="dream-bubble relative">
      <span className="dream-halo" aria-hidden />
      <div className="dream-cloud relative whitespace-nowrap px-5 py-2.5 lg:px-8 lg:py-3.5">
        <span className="dream-star -left-5 -top-4 h-6 w-6 bg-[linear-gradient(135deg,#ffe27a,#ff9ed2)] lg:h-8 lg:w-8" aria-hidden />
        <span className="dream-star -right-3 -top-6 h-4 w-4 bg-[linear-gradient(135deg,#c9a2ff,#8fd3ff)] [animation-delay:0.7s] lg:h-5 lg:w-5" aria-hidden />
        <span className="dream-star -bottom-4 left-[30%] h-3.5 w-3.5 bg-[linear-gradient(135deg,#ff9ed2,#ffb36b)] [animation-delay:1.4s]" aria-hidden />
        <span className="dream-star -right-6 bottom-0 h-5 w-5 bg-[linear-gradient(135deg,#ffe27a,#a8f0d4)] [animation-delay:2s] lg:h-7 lg:w-7" aria-hidden />
        <span className="dream-star left-[62%] -top-7 h-3 w-3 bg-[linear-gradient(135deg,#ff9ed2,#c9a2ff)] [animation-delay:1s]" aria-hidden />
        <p className="dream-text relative font-round text-[1rem] font-black tracking-[0.04em] sm:text-[1.1rem] lg:text-[1.5rem]" aria-label={text}>
          {chars.map((ch, i) => (
            <span
              key={i}
              aria-hidden
              className="dream-char"
              style={{ animationDelay: `${i * 0.09}s`, backgroundSize: `${chars.length * 100}% 100%`, backgroundPosition: `${(i / n) * 100}% 0` }}
            >
              {ch}
            </span>
          ))}
        </p>
      </div>
      {/* 猫へ続く、ふわふわの小さな雲 */}
      <span className="dream-puff absolute right-[30%] top-[calc(100%+4px)] h-3.5 w-5 lg:h-4 lg:w-6" aria-hidden />
      <span className="dream-puff absolute right-[25%] top-[calc(100%+20px)] h-2 w-3 [animation-delay:0.4s] lg:top-[calc(100%+24px)]" aria-hidden />
    </div>
  );
}
