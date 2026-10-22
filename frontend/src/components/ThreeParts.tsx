"use client";

/**
 * 3D 演出の呼び出し口。演出レベル「すべて」のときだけ Three.js を読み込み、
 * それ以外（軽量・最小限・WebGL 非対応・初期化失敗）は同じ情報を持つ 2D 表示に切り替える。
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { MagicCircleSVG } from "@/ceremony/Ceremony2D";
import { useMotionPref } from "@/lib/motion-pref";
import type { Prize } from "@/lib/types";
import type { CarouselItem } from "@/three/PrizeCarousel3D";
import { ThreeBoundary } from "@/three/boundary";
import { PrizeCard } from "./PrizeCard";
import { RarityBadge } from "./ui";

const HeroCenterpiece = dynamic(() => import("@/three/HeroCenterpiece"), { ssr: false, loading: () => null });
const PrizeCarousel3D = dynamic(() => import("@/three/PrizeCarousel3D"), { ssr: false, loading: () => null });
const PrizePedestal3D = dynamic(() => import("@/three/PrizePedestal3D"), { ssr: false, loading: () => null });

/** トップページの主役（星の水晶と天球儀）。軽量版は回転する魔法陣と光の水晶（SVG）。 */
export function HeroVisual() {
  const { level } = useMotionPref();
  const fallback = (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute h-[78%] w-[78%] opacity-60">
        <MagicCircleSVG color="#d8b976" className="h-full w-full" spin={80} />
      </div>
      <svg viewBox="-50 -80 100 160" className="relative h-[46%] animate-float drop-shadow-[0_0_30px_rgba(180,140,255,0.6)]" aria-hidden>
        <defs>
          <linearGradient id="hv-c" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7f4ff" />
            <stop offset=".45" stopColor="#b5e8f7" />
            <stop offset=".8" stopColor="#7654c8" />
            <stop offset="1" stopColor="#2a1f62" />
          </linearGradient>
        </defs>
        <path d="M0-76L42 0L0 76L-42 0Z" fill="url(#hv-c)" opacity=".9" />
        <path d="M0-76L42 0L0 8Z" fill="#fff" opacity=".35" />
        <path d="M-42 0L0 8L0 76Z" fill="#000" opacity=".15" />
      </svg>
    </div>
  );
  if (level !== "full") return fallback;
  return (
    <ThreeBoundary fallback={fallback}>
      <div className="relative h-full w-full">
        <HeroCenterpiece className="h-full w-full" />
        <motion.p
          className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-serif text-[11px] tracking-[0.25em] text-gold-light/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.9, 0.5, 0.9] }}
          transition={{ delay: 3, duration: 4, repeat: Infinity, repeatType: "reverse" }}
        >
          ✦ 水晶に触れて、願いを込める ✦
        </motion.p>
      </div>
    </ThreeBoundary>
  );
}

export type ShowcaseItem = { prize: Prize; slug: string; gachaTitle: string };

/** 宝物の回廊。正面のカードの情報を下に文字で表示する。軽量版は横スクロールのカード列。 */
export function PrizeShowcase({ items }: { items: ShowcaseItem[] }) {
  const { level } = useMotionPref();
  const router = useRouter();
  const [front, setFront] = useState(0);
  const flat = (
    <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4">
      {items.map((it) => (
        <Link key={`${it.slug}-${it.prize.id}`} href={`/gacha/${it.slug}`} className="w-40 shrink-0 snap-center sm:w-48">
          <PrizeCard prize={it.prize} size="md" />
          <p className="mt-2 truncate text-center text-xs text-moon/55">{it.gachaTitle}</p>
        </Link>
      ))}
    </div>
  );
  if (level !== "full" || items.length < 3) return flat;
  const cur = items[front % items.length];
  const carouselItems: CarouselItem[] = items.map((it) => ({
    key: `${it.slug}-${it.prize.id}`,
    image: it.prize.image_url,
    rarity: it.prize.rarity,
    name: it.prize.name,
    href: `/gacha/${it.slug}`,
  }));
  return (
    <ThreeBoundary fallback={flat}>
      <div className="relative h-[380px] sm:h-[460px]">
        <PrizeCarousel3D items={carouselItems} onFront={setFront} onPick={(i) => router.push(carouselItems[i].href)} />
      </div>
      <div className="mt-2 flex min-h-[5.5rem] flex-col items-center text-center" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div key={cur.prize.id + cur.slug} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
            <div className="flex items-center justify-center gap-2">
              <RarityBadge rarity={cur.prize.rarity} />
              <span className="font-serif text-xl font-bold text-moon">{cur.prize.name}</span>
            </div>
            <p className="mt-1 text-xs text-moon/55">{cur.gachaTitle}</p>
            <Link href={`/gacha/${cur.slug}`} className="mt-2 inline-block text-sm text-gold-light underline-offset-4 hover:underline">
              このガチャを見る →
            </Link>
          </motion.div>
        </AnimatePresence>
        <p className="mt-2 text-[11px] text-moon/40">ドラッグ（スワイプ）で回転・カードを押すとガチャのページへ</p>
      </div>
      <ul className="sr-only">
        {items.map((it) => (
          <li key={`${it.slug}-${it.prize.id}`}>
            <Link href={`/gacha/${it.slug}`}>
              {it.prize.rarity} {it.prize.name}（{it.gachaTitle}）
            </Link>
          </li>
        ))}
      </ul>
    </ThreeBoundary>
  );
}

/** 特別な景品の台座。軽量版は通常の景品カード。 */
export function PrizePedestal({ prize, lastOne, className }: { prize: Prize; lastOne?: boolean; className?: string }) {
  const { level } = useMotionPref();
  const fallback = (
    <div className={className}>
      <div className="mx-auto w-28 sm:w-32">
        <PrizeCard prize={prize} rarity={prize.rarity} size="sm" lastOne={lastOne} />
      </div>
    </div>
  );
  if (level !== "full") return fallback;
  return (
    <ThreeBoundary fallback={fallback}>
      <div className={className}>
        <PrizePedestal3D image={prize.image_url} rarity={prize.rarity} />
      </div>
    </ThreeBoundary>
  );
}
