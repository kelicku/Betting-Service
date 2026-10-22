"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRef } from "react";
import { fmtNum, timeLeft } from "@/lib/format";
import type { GachaSummary } from "@/lib/types";
import { MiniCountdown } from "./Engage";
import { RarityBadge, TicketIcon } from "./ui";

export function RemainingBar({ remaining, total }: { remaining: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-moon/60">残り口数</span>
        <span className="tabular-nums">
          <span className="font-display text-base font-bold text-gold-light">{fmtNum(remaining)}</span>
          <span className="text-moon/50"> / {fmtNum(total)}口</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-veil/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amethyst via-gold to-gold-light shadow-[0_0_10px_rgba(243,223,179,0.6)] transition-[width] duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function GachaCard({ g, index = 0 }: { g: GachaSummary; index?: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  // 傾き（ホバー時にカードがわずかに立体的に傾く）
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || window.matchMedia("(hover: none)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${-y * 5}deg) rotateY(${x * 6}deg) translateY(-4px)`;
    el.style.setProperty("--mx", `${(x + 0.5) * 100}%`);
    el.style.setProperty("--my", `${(y + 0.5) * 100}%`);
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  const left = timeLeft(g.ends_at);
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6, delay: index * 0.08 }}>
      <Link
        ref={ref}
        href={`/gacha/${g.slug}`}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="group relative block overflow-hidden rounded-2xl border border-gold/25 bg-night-800/60 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] transition-[transform,box-shadow,border-color] duration-300 hover:border-gold/60 hover:shadow-glow-lg"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="relative aspect-[2/1] overflow-hidden">
          {g.banner_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.banner_image_url} alt="" className="h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-105" loading={index < 2 ? "eager" : "lazy"} />
          ) : (
            <div className="h-full w-full" style={{ background: `radial-gradient(circle at 70% 30%, ${g.theme_color}, #080d20)` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-night-800 via-night-800/30 to-transparent" />
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: "radial-gradient(400px circle at var(--mx,50%) var(--my,50%), rgba(243,223,179,0.18), transparent 40%)" }}
          />
          {g.featured_prize?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={g.featured_prize.image_url}
              alt=""
              loading="lazy"
              className="absolute bottom-3 right-4 w-[22%] rounded-lg border border-gold/50 shadow-glow transition-transform duration-700 group-hover:-translate-y-1 group-hover:rotate-2"
            />
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {!g.is_open && <span className="rounded-full bg-night/80 px-2.5 py-1 text-[11px] text-moon/70">開催期間外</span>}
            {g.mode === "box" && <span className="rounded-full border border-gold/40 bg-night/70 px-2.5 py-1 text-[11px] text-gold-light backdrop-blur">ボックス</span>}
            {g.has_last_one && (
              <span className="rounded-full bg-gradient-to-r from-gold-light to-gold px-2.5 py-1 text-[11px] font-bold text-night">
                {g.last_one_awarded ? "ラストワン賞 獲得済" : "ラストワン賞あり"}
              </span>
            )}
            {left && left !== "終了" && g.ends_at && (
              <span className="rounded-full bg-night/70 px-2.5 py-1 text-[11px] text-aurora backdrop-blur">
                <MiniCountdown endsAt={g.ends_at} />
              </span>
            )}
          </div>
        </div>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-serif text-lg font-bold text-moon transition-colors group-hover:text-gold-light">{g.title}</h3>
              <p className="mt-0.5 truncate text-xs text-moon/55">{g.subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-sm font-bold text-gold-light">
              <TicketIcon className="h-4 w-4" />
              {g.ticket_cost}
              <span className="text-[10px] font-normal opacity-70">枚/回</span>
            </div>
          </div>
          {g.remaining != null && g.total_pulls != null ? (
            <RemainingBar remaining={g.remaining} total={g.total_pulls} />
          ) : (
            <div className="flex items-center gap-2 text-xs text-moon/55">
              {g.top_rarity && <RarityBadge rarity={g.top_rarity} />}
              <span>何度でも引ける常設ガチャ</span>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
