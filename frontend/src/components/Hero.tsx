"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { useMe } from "@/lib/hooks";
import { HeroVisual } from "./ThreeParts";
import { Button, Tickets } from "./ui";

/** 宮殿の窓を思わせるアーチ型の額縁。 */
function ArchFrame() {
  return (
    <svg viewBox="0 0 400 520" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="arch-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3dfb3" stopOpacity=".85" />
          <stop offset=".6" stopColor="#d8b976" stopOpacity=".35" />
          <stop offset="1" stopColor="#d8b976" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M8 520V200C8 94 94 8 200 8S392 94 392 200V520" fill="none" stroke="url(#arch-g)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <path d="M24 520V204C24 107 103 26 200 26S376 107 376 204V520" fill="none" stroke="url(#arch-g)" strokeWidth=".6" strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />
      <path d="M200 0l5 10-5 10-5-10z" fill="#f3dfb3" />
    </svg>
  );
}

export default function Hero({ openCount }: { openCount: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { me } = useMe();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const yVisual = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const yText = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const fade = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  const facts = [
    { k: "開催中のガチャ", v: `${openCount}` },
    { k: "新規登録特典", v: "10枚" },
    { k: "提供割合", v: "すべて公開" },
  ];

  return (
    <section ref={ref} className="relative isolate overflow-hidden">
      {/* 額縁の装飾線 */}
      <div className="pointer-events-none absolute inset-x-3 inset-y-3 rounded-[2rem] border border-gold/10 sm:inset-x-6" aria-hidden />

      <div className="mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-6xl items-center gap-4 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-10 lg:py-10">
        <motion.div style={{ y: yVisual, opacity: fade }} className="relative order-1 mx-auto aspect-[4/5] w-full max-w-[300px] sm:max-w-[380px] lg:order-2 lg:max-w-[480px]">
          <div className="absolute inset-0 overflow-hidden rounded-t-full bg-[radial-gradient(ellipse_at_50%_45%,rgba(118,84,200,0.32),rgba(8,13,32,0)_70%)]" />
          <motion.div className="absolute inset-0" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}>
            <HeroVisual />
          </motion.div>
          <ArchFrame />
        </motion.div>

        <motion.div style={{ y: yText, opacity: fade }} className="order-2 text-center lg:order-1 lg:text-left">
          <motion.div
            className="flex items-center justify-center gap-3 lg:justify-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
          >
            <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold/70" />
            <span className="font-display text-[10px] tracking-[0.5em] text-gold/80 sm:text-xs">HOSHIFURU TREASURY</span>
            <span className="h-px w-10 bg-gradient-to-l from-transparent to-gold/70 lg:hidden" />
          </motion.div>
          <h1 className="mt-6 font-serif text-[3rem] font-extrabold leading-[1.12] tracking-[0.1em] sm:text-7xl lg:text-[5.4rem]">
            {["星降る", "宝物殿"].map((line, i) => (
              <motion.span
                key={line}
                className="gold-shimmer block drop-shadow-[0_0_36px_rgba(216,185,118,0.25)]"
                initial={{ opacity: 0, y: 34, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 1.3, delay: 0.3 + i * 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {line}
              </motion.span>
            ))}
          </h1>
          <motion.p
            className="mx-auto mt-7 max-w-md font-serif text-[15px] leading-[2.2] text-moon/75 sm:text-lg lg:mx-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0, duration: 1.2 }}
          >
            夜空の果て、星々が眠る宝物殿。
            <br />
            ひとつの願いが、まだ見ぬ宝物への扉をひらく。
          </motion.p>
          <motion.div
            className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.25, duration: 0.8 }}
          >
            <Button size="xl" href="/gacha">
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" fill="currentColor" />
              </svg>
              ガチャを引く
            </Button>
            {me ? (
              <Button size="xl" variant="ghost" href="/earn">チケットを獲得する</Button>
            ) : (
              <Button size="xl" variant="ghost" href="/login">はじめる</Button>
            )}
          </motion.div>
          <motion.div className="mt-6 text-sm text-moon/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
            {me ? (
              <>所持チケット <Tickets n={me.balance} className="text-gold-light" /></>
            ) : (
              <>新規登録とメール確認で、チケット10枚をお贈りします</>
            )}
          </motion.div>
          <motion.dl
            className="mx-auto mt-10 grid max-w-md grid-cols-3 divide-x divide-gold/15 border-y border-gold/15 py-4 lg:mx-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 1 }}
          >
            {facts.map((f) => (
              <div key={f.k} className="px-2 text-center">
                <dt className="text-[10px] tracking-wider text-moon/45 sm:text-[11px]">{f.k}</dt>
                <dd className="mt-1 font-serif text-base font-bold text-gold-light sm:text-lg">{f.v}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </div>

      <motion.div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] tracking-[0.4em] text-gold/60 md:flex" style={{ opacity: fade }} aria-hidden>
        SCROLL
        <span className="h-10 w-px animate-pulse bg-gradient-to-b from-gold/70 to-transparent" />
      </motion.div>
    </section>
  );
}
