"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PrizeCard, Sparkles } from "@/components/PrizeCard";
import { RarityBadge, Tabs, cx } from "@/components/ui";
import { RARITY, RARITIES } from "@/lib/format";
import { playTick } from "@/lib/sound";
import type { DrawResult, Rarity } from "@/lib/types";

/** レアリティに応じた背景の光（N: 銀 / R: 青 / SR: 紫 / SSR: 金と粒子） */
export function RarityAura({ rarity, intensity = 1 }: { rarity: Rarity; intensity?: number }) {
  const c = RARITY[rarity];
  const strength = { N: 0.35, R: 0.55, SR: 0.8, SSR: 1 }[rarity] * intensity;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      <motion.div
        className="absolute h-[140vmax] w-[140vmax] rounded-full"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${c.glow} 0deg 3deg, transparent 3deg 15deg)`,
          maskImage: "radial-gradient(circle, black 0%, transparent 45%)",
          WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 45%)",
          opacity: rarity === "N" ? 0.15 : 0.45 * strength,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute h-[80vmin] w-[80vmin] rounded-full"
        style={{ background: `radial-gradient(circle, ${c.glow} 0%, transparent 62%)` }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.15, 1], opacity: [0, strength, strength * 0.75] }}
        transition={{ duration: 1.4, ease: "easeOut" }}
      />
    </div>
  );
}

export function CardBack({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "relative aspect-[3/4] overflow-hidden rounded-xl border border-gold/40 bg-[radial-gradient(circle_at_50%_40%,#2b2360,#0b1230_70%)]",
        className,
      )}
    >
      <svg viewBox="-50 -66 100 132" className="absolute inset-0 h-full w-full" aria-hidden>
        <rect x="-45" y="-61" width="90" height="122" rx="6" fill="none" stroke="#d8b976" strokeOpacity=".5" />
        <circle r="26" fill="none" stroke="#d8b976" strokeOpacity=".6" strokeDasharray="2 3" />
        <circle r="18" fill="none" stroke="#d8b976" strokeOpacity=".4" />
        <path d="M0-16l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill="#d8b976" />
      </svg>
    </div>
  );
}

// ── 単発 ────────────────────────────────────────────────

export function SingleReveal({ result, onDone }: { result: DrawResult; onDone?: () => void }) {
  const r = result.rarity;
  const cb = useRef(onDone);
  cb.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => cb.current?.(), 1600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="relative flex flex-col items-center">
      <RarityAura rarity={r} />
      <motion.div
        className="relative w-[min(68vw,300px)] [perspective:1200px]"
        initial={{ scale: 0.25, rotateY: 540, rotateZ: -8, opacity: 0, y: 30 }}
        animate={{ scale: 1, rotateY: 0, rotateZ: 0, opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <Sparkles rarity={r} count={r === "SSR" ? 22 : 12} />
        <PrizeCard prize={result.prize} rarity={r} size="lg" lastOne={result.is_last_one} />
      </motion.div>
      <motion.div className="relative mt-6 text-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.6 }}>
        <div className="flex items-center justify-center gap-2">
          <RarityBadge rarity={r} size="md" />
          <span className={cx("font-display text-sm tracking-[0.3em]", RARITY[r].text)}>{RARITY[r].label}</span>
        </div>
        <p className="mt-2 font-serif text-2xl font-bold text-moon drop-shadow-[0_0_14px_rgba(243,223,179,0.35)]">{result.prize.name}</p>
      </motion.div>
    </div>
  );
}

// ── 10 回：順番にカードが現れる ───────────────────────────────

export function MultiReveal({ results, skipAll, onDone, onSelect }: { results: DrawResult[]; skipAll: boolean; onDone: () => void; onSelect: (r: DrawResult) => void }) {
  const [shown, setShown] = useState(0);
  const normal = useMemo(() => results.filter((r) => !r.is_last_one), [results]);
  const done = shown >= normal.length;
  const doneCb = useRef(onDone);
  doneCb.current = onDone;
  const fired = useRef(false);

  useEffect(() => {
    if (skipAll) setShown(normal.length);
  }, [skipAll, normal.length]);

  useEffect(() => {
    if (done) {
      if (!fired.current) {
        fired.current = true;
        doneCb.current();
      }
      return;
    }
    const next = normal[shown];
    // レア景品は少し間を置いて特別な光を見せる
    const wait = shown === 0 ? 300 : next && (next.rarity === "SSR" || next.rarity === "SR") ? 900 : 320;
    const t = setTimeout(() => {
      if (next) playTick(next.rarity);
      setShown((s) => s + 1);
    }, wait);
    return () => clearTimeout(t);
  }, [shown, done, normal]);

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-5 gap-2 px-2 sm:gap-4">
      {normal.map((r, i) => {
        const open = i < shown;
        const rare = r.rarity === "SSR" || r.rarity === "SR";
        return (
          <button key={r.position} className="relative [perspective:800px]" onClick={() => open && onSelect(r)} aria-label={open ? r.prize.name : "未公開"}>
            <motion.div
              className="relative"
              style={{ transformStyle: "preserve-3d" }}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1, rotateY: open ? 0 : 180, scale: open && rare ? [1, 1.12, 1] : 1 }}
              transition={{ duration: 0.6, delay: skipAll ? 0 : open ? 0 : i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            >
              <div style={{ backfaceVisibility: "hidden" }}>
                <PrizeCard prize={r.prize} rarity={r.rarity} size="xs" highlight={open} />
              </div>
              <div className="absolute inset-0" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                <CardBack />
              </div>
            </motion.div>
            {open && rare && (
              <motion.div
                className="pointer-events-none absolute -inset-3 rounded-2xl"
                style={{ background: `radial-gradient(circle, ${RARITY[r.rarity].glow}, transparent 65%)` }}
                initial={{ opacity: 1, scale: 0.6 }}
                animate={{ opacity: 0.35, scale: 1.15 }}
                transition={{ duration: 1.2 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── 100 回：一覧で確認 ──────────────────────────────────

function CountUp({ to, delay = 0 }: { to: number; delay?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / 900));
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return <>{n}</>;
}

export function RarityCounts({ counts, animate = true }: { counts: Record<Rarity, number>; animate?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3">
      {RARITIES.map((r, i) => (
        <div
          key={r}
          className="glass flex flex-col items-center gap-1 px-2 py-3"
          style={{ boxShadow: counts[r] > 0 && (r === "SSR" || r === "SR") ? `0 0 24px ${RARITY[r].glow}` : undefined }}
        >
          <RarityBadge rarity={r} />
          <span className={cx("font-display text-2xl font-bold tabular-nums sm:text-3xl", RARITY[r].text)}>
            {animate ? <CountUp to={counts[r]} delay={0.15 * i} /> : counts[r]}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ResultGrid({
  results,
  onSelect,
  dense,
  initialFilter = "all",
}: {
  results: DrawResult[];
  onSelect: (r: DrawResult) => void;
  dense?: boolean;
  initialFilter?: "all" | Rarity;
}) {
  const [filter, setFilter] = useState<"all" | Rarity>(initialFilter);
  const sorted = useMemo(
    () => [...results].sort((a, b) => Number(b.is_last_one) - Number(a.is_last_one) || RARITY[b.rarity].order - RARITY[a.rarity].order || a.position - b.position),
    [results],
  );
  const list = filter === "all" ? sorted : sorted.filter((r) => r.rarity === filter);
  const count = (r: Rarity) => results.filter((x) => x.rarity === r).length;
  return (
    <div>
      {dense && (
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: "すべて", count: results.length },
            ...RARITIES.map((r) => ({ value: r, label: r, count: count(r) })),
          ]}
        />
      )}
      <div className={cx("grid gap-2", dense ? "grid-cols-5 sm:grid-cols-8 lg:grid-cols-10" : "grid-cols-3 sm:grid-cols-5")}>
        <AnimatePresence initial>
          {list.map((r, i) => (
            <motion.button
              key={r.position}
              layout
              onClick={() => onSelect(r)}
              className="relative text-left"
              initial={{ opacity: 0, scale: 0.85, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: Math.min(i * (dense ? 0.012 : 0.05), 1.2), duration: 0.35 }}
              aria-label={`${r.rarity} ${r.prize.name}`}
            >
              <PrizeCard prize={r.prize} rarity={r.rarity} size={dense ? "xs" : "sm"} lastOne={r.is_last_one} highlight={r.rarity !== "N"} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── ラストワン賞 ─────────────────────────────────────────

export function LastOneReveal({ result }: { result: DrawResult }) {
  const text = "ラストワン賞獲得！";
  return (
    <div className="relative flex flex-col items-center">
      <RarityAura rarity="SSR" intensity={1.3} />
      <div className="relative mb-6 flex" aria-label={text}>
        {text.split("").map((ch, i) => (
          <motion.span
            key={i}
            className="gold-text font-serif text-3xl font-extrabold tracking-wider drop-shadow-[0_0_18px_rgba(255,217,138,0.7)] sm:text-5xl"
            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.9 + i * 0.09, duration: 0.6, ease: "easeOut" }}
            aria-hidden
          >
            {ch}
          </motion.span>
        ))}
      </div>
      <motion.div
        className="relative w-[min(66vw,300px)]"
        initial={{ scale: 0.3, opacity: 0, rotateY: 360 }}
        animate={{ scale: 1, opacity: 1, rotateY: 0 }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <Sparkles rarity="SSR" count={28} />
        <PrizeCard prize={result.prize} rarity="SSR" size="lg" lastOne />
      </motion.div>
      <motion.p className="relative mt-5 font-serif text-xl font-bold text-gold-light" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}>
        {result.prize.name}
      </motion.p>
    </div>
  );
}
