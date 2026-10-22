"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { MagicCircleSVG } from "@/ceremony/Ceremony2D";
import type { GachaSummary } from "@/lib/types";
import { PrizePedestal } from "./ThreeParts";
import { Button } from "./ui";

export function SectionHeading({ en, title, sub }: { en: string; title: string; sub?: string }) {
  return (
    <motion.div className="mb-12 text-center" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.9 }}>
      <p className="font-display text-[11px] tracking-[0.5em] text-gold/70">{en}</p>
      <h2 className="mt-3 font-serif text-3xl font-bold tracking-[0.12em] sm:text-4xl" aria-label={title}>
        {/* 一文字ずつ、光の中から現れる */}
        {Array.from(title).map((ch, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="gold-text inline-block"
            initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: 0.15 + i * 0.07, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {ch}
          </motion.span>
        ))}
      </h2>
      <div className="mx-auto mt-5 flex max-w-[14rem] items-center gap-3" aria-hidden>
        <motion.span className="h-px flex-1 origin-right bg-gradient-to-r from-transparent to-gold/60" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ delay: 0.5, duration: 1.2 }} />
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gold">
          <path d="M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z" fill="currentColor" />
        </svg>
        <motion.span className="h-px flex-1 origin-left bg-gradient-to-l from-transparent to-gold/60" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ delay: 0.5, duration: 1.2 }} />
      </div>
      {sub && <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-moon/60">{sub}</p>}
    </motion.div>
  );
}

/** ラストワン賞の特集（台座の上で景品が浮かぶ）。 */
export function LastOneFeature({ g }: { g: GachaSummary }) {
  if (!g.featured_prize) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 1 }}>
      <Link href={`/gacha/${g.slug}`} className="glass-strong group relative grid items-center gap-6 overflow-hidden p-6 sm:p-10 md:grid-cols-[1fr_1.2fr]">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-gold/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-amethyst/20 blur-3xl" />
        <PrizePedestal prize={g.featured_prize} lastOne className="relative mx-auto aspect-square w-full max-w-[340px]" />
        <div className="relative text-center md:text-left">
          <p className="font-display text-[11px] tracking-[0.45em] text-gold/70">LAST ONE PRIZE</p>
          <h2 className="mt-3 font-serif text-2xl font-bold leading-snug sm:text-[2rem]">
            最後の1口に、
            <br className="hidden sm:block" />
            <span className="gold-text">特別な宝物</span>を。
          </h2>
          <p className="mt-4 leading-loose text-moon/70">
            「{g.title}」の最後の1口を引き当てた方には、ラストワン賞「{g.featured_prize.name}」を贈呈します。
          </p>
          {g.remaining != null && (
            <p className="mt-5 flex items-baseline justify-center gap-2 md:justify-start">
              <span className="text-sm text-moon/55">残り</span>
              <span className="font-display text-4xl font-bold text-gold-light">{g.remaining.toLocaleString("ja-JP")}</span>
              <span className="text-sm text-moon/55">口</span>
            </p>
          )}
          <span className="mt-6 inline-flex items-center gap-2 text-sm text-gold-light transition group-hover:gap-3">
            このガチャを見る <span aria-hidden>→</span>
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

const STEPS = [
  { t: "会員登録", d: "メールアドレスで登録し、確認メールのリンクを開くとチケット10枚をお贈りします。" },
  { t: "チケットを集める", d: "ログインボーナス、広告視聴、アンケート回答、ミッション達成でチケットを獲得。" },
  { t: "ガチャを引く", d: "1回・10回・100回から選んで、魔法陣に願いを。結果はサーバーで公正に抽選します。" },
  { t: "宝物を受け取る", d: "獲得した景品は交換申請でお届け。申請状況はマイページでいつでも確認できます。" },
];

/** 楽しみ方：4 つの星を光の線でつなぐ星座。スクロールに合わせて線が描かれる。 */
export function Constellation() {
  const pts = [
    [110, 150],
    [330, 60],
    [550, 170],
    [770, 70],
  ];
  return (
    <div className="relative">
      <svg viewBox="0 0 880 230" className="absolute inset-x-0 top-0 hidden h-[230px] w-full lg:block" aria-hidden>
        <motion.path
          d={`M${pts.map((p) => p.join(" ")).join(" L")}`}
          fill="none"
          stroke="url(#cst)"
          strokeWidth="1.2"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 2.4, ease: "easeInOut" }}
        />
        <defs>
          <linearGradient id="cst" x1="0" x2="1">
            <stop offset="0" stopColor="#a58bea" />
            <stop offset="1" stopColor="#f3dfb3" />
          </linearGradient>
        </defs>
        {pts.map(([x, y], i) => (
          <motion.g key={i} initial={{ opacity: 0, scale: 0 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.4 + i * 0.5, type: "spring" }} style={{ transformOrigin: `${x}px ${y}px` }}>
            <circle cx={x} cy={y} r="18" fill="rgba(243,223,179,0.12)" />
            <path transform={`translate(${x} ${y})`} d="M0-11L2.6-2.6L11 0L2.6 2.6L0 11L-2.6 2.6L-11 0L-2.6-2.6Z" fill="#f3dfb3" />
          </motion.g>
        ))}
      </svg>
      <ol className="relative grid gap-8 lg:grid-cols-4 lg:gap-6 lg:pt-[230px]">
        {STEPS.map((s, i) => (
          <motion.li
            key={s.t}
            className="relative pl-14 lg:pl-0 lg:text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ delay: 0.2 + i * 0.15, duration: 0.8 }}
          >
            <span className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-display text-sm text-gold-light lg:hidden">
              {i + 1}
            </span>
            {i < STEPS.length - 1 && <span className="absolute left-5 top-11 h-[calc(100%-0.5rem)] w-px bg-gradient-to-b from-gold/40 to-transparent lg:hidden" aria-hidden />}
            <p className="hidden font-display text-xs tracking-[0.4em] text-gold/60 lg:block">STEP {i + 1}</p>
            <h3 className="font-serif text-lg font-bold text-gold-light lg:mt-2">{s.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-moon/65">{s.d}</p>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** 締めくくり：魔法陣の扉。 */
export function ClosingPortal({ loggedOutHref = "/login" }: { loggedOutHref?: string }) {
  return (
    <section className="relative mx-auto max-w-4xl overflow-hidden px-4 py-24 text-center sm:px-6">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 opacity-25 [mask-image:radial-gradient(circle,black_30%,transparent_70%)]" aria-hidden>
        <MagicCircleSVG color="#d8b976" className="h-full w-full" spin={90} />
      </div>
      <motion.div className="relative" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 1.1 }}>
        <p className="font-display text-[11px] tracking-[0.5em] text-gold/70">TONIGHT, THE STARS AWAIT</p>
        <h2 className="mt-4 font-serif text-3xl font-bold leading-relaxed tracking-[0.1em] sm:text-4xl">
          今宵、星々が
          <br />
          <span className="gold-shimmer">あなたを待っています。</span>
        </h2>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button size="xl" href="/gacha">宝物殿へ入る</Button>
          <Button size="xl" variant="ghost" href={loggedOutHref}>はじめる</Button>
        </div>
      </motion.div>
    </section>
  );
}
