"use client";

import { motion } from "motion/react";
import { useRef } from "react";
import { RARITY } from "@/lib/format";
import type { Prize, Rarity } from "@/lib/types";
import { RarityBadge, cx } from "./ui";

/**
 * 景品カード。レアリティに応じて縁取り・光の色・輝きの強さが変わる。
 * N: 控えめな銀 / R: 青い光 / SR: 紫のオーラ / SSR: 金色の光と粒子
 */
export function PrizeArt({ prize, className }: { prize: Prize; className?: string }) {
  return prize.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={prize.image_url} alt="" loading="lazy" decoding="async" className={cx("h-full w-full object-cover", className)} />
  ) : (
    <div className={cx("flex h-full w-full items-center justify-center bg-gradient-to-br from-royal to-night text-4xl text-gold/60", className)}>✦</div>
  );
}

export function PrizeCard({
  prize,
  rarity = prize.rarity,
  size = "md",
  lastOne,
  highlight = true,
  className,
  footer,
  tilt = size !== "xs",
}: {
  prize: Prize;
  rarity?: Rarity;
  size?: "xs" | "sm" | "md" | "lg";
  lastOne?: boolean;
  highlight?: boolean;
  className?: string;
  footer?: React.ReactNode;
  tilt?: boolean;
}) {
  const meta = RARITY[rarity];
  const big = size === "lg" || size === "md";
  const ref = useRef<HTMLDivElement>(null);
  // トレーディングカードのように、ポインターに合わせて傾き、ホログラムの光が流れる
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !tilt || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 16}deg`);
    el.style.setProperty("--px", `${x * 100}%`);
    el.style.setProperty("--py", `${y * 100}%`);
    el.dataset.tilt = "1";
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.dataset.tilt = "0";
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      data-rarity={rarity}
      className={cx(
        "prize-card group relative isolate rounded-2xl p-[1.5px]",
        size === "xs" && "rounded-xl p-px",
        className,
      )}
      style={{
        background:
          rarity === "SSR"
            ? "linear-gradient(140deg,#fff6df,#d8b976 30%,#7a5c25 50%,#f3dfb3 70%,#fff6df)"
            : rarity === "SR"
              ? "linear-gradient(140deg,#efe6ff,#a785f2 35%,#4b2e9a 55%,#c9b8f5)"
              : rarity === "R"
                ? "linear-gradient(140deg,#e9fbff,#84d8f1 40%,#2f6f8f 60%,#b5e8f7)"
                : "linear-gradient(140deg,#f5f7fb,#aeb5c6 40%,#5d6578 60%,#dfe3ec)",
        boxShadow: highlight ? `0 0 ${rarity === "SSR" ? 36 : rarity === "SR" ? 26 : rarity === "R" ? 18 : 8}px ${meta.glow}` : undefined,
      }}
    >
      <div className={cx("relative h-full overflow-hidden bg-night-800", size === "xs" ? "rounded-[11px]" : "rounded-[15px]")}>
        <div className="relative aspect-[3/4] overflow-hidden">
          <PrizeArt prize={prize} className="transition-transform duration-700 group-hover:scale-[1.04]" />
          {/* 宝石の反射 */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.18)_0%,transparent_35%,transparent_65%,rgba(255,255,255,0.08)_100%)]" />
          {highlight && rarity !== "N" && (
            <div className="shimmer-gold pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay" aria-hidden />
          )}
          {tilt && <div className="prize-holo pointer-events-none absolute inset-0" aria-hidden />}
          <div className={cx("absolute left-2 top-2", size === "xs" && "left-1 top-1 scale-90")}>
            <RarityBadge rarity={rarity} />
          </div>
          {lastOne && (
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-gold/90 to-gold/0 pb-6 pt-1.5 text-center font-serif text-[11px] font-bold tracking-[0.2em] text-night">
              ラストワン賞
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-night-900/95 via-night-900/40 to-transparent" />
          {size !== "xs" && (
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className={cx("font-serif font-bold leading-snug drop-shadow", big ? "text-base" : "text-sm")}>{prize.name}</p>
              {size === "lg" && prize.description && <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-moon/70">{prize.description}</p>}
            </div>
          )}
        </div>
        {footer && <div className="border-t border-veil/5 px-3 py-2 text-xs text-moon/60">{footer}</div>}
      </div>
    </div>
  );
}

/** カード周りに舞う光の粒（SR 以上）。 */
export function Sparkles({ rarity, count = 14 }: { rarity: Rarity; count?: number }) {
  if (rarity === "N" || rarity === "R") return null;
  const color = rarity === "SSR" ? "#fff1c9" : "#d9c8ff";
  return (
    <div className="pointer-events-none absolute -inset-8" aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const r = 45 + (i % 3) * 8;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
            style={{ background: color, boxShadow: `0 0 10px ${color}` }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{
              x: `${Math.cos(angle) * r}%`,
              y: `${Math.sin(angle) * r}%`,
              opacity: [0, 1, 0],
              scale: [0, 1.2, 0],
            }}
            transition={{ duration: 2.4, delay: (i % 7) * 0.25, repeat: Infinity, repeatDelay: 0.4, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
