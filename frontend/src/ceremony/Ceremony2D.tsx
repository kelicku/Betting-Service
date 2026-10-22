"use client";

/**
 * 軽量版の演出（3D を使わない端末向け）。SVG と CSS 変形のみで、
 * 魔法陣 → 粒子の集中 → 宝箱 → 開封 の流れを短時間で表現する。
 */

import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Rarity } from "@/lib/types";
import type { CeremonyHandle, CeremonyVariant } from "./CeremonyScene";

const COLOR: Record<Rarity, string> = { N: "#e6ebf5", R: "#84d8f1", SR: "#b48cff", SSR: "#ffd98a" };

type Phase = 0 | 1 | 2 | 3 | 4; // 0:魔法陣 1:集中 2:宝箱 3:開封 4:終了

export function MagicCircleSVG({ color = "#e9d4a0", className, spin = 40 }: { color?: string; className?: string; spin?: number }) {
  const runes = useMemo(() => Array.from({ length: 36 }, (_, i) => i), []);
  return (
    <svg viewBox="-100 -100 200 200" className={className} aria-hidden>
      <g fill="none" stroke={color} strokeLinecap="round">
        <g style={{ animation: `spin-slow ${spin}s linear infinite`, transformOrigin: "center" }}>
          <circle r="97" strokeWidth="1.2" />
          <circle r="92" strokeWidth="0.4" />
          {runes.map((i) => {
            const a = (i / runes.length) * 360;
            return (
              <g key={i} transform={`rotate(${a}) translate(0 -86)`} strokeWidth="0.5">
                <path d={i % 3 === 0 ? "M-2-3L2 3M2-3L-2 3" : i % 3 === 1 ? "M0-3V3M-2 0H2" : "M-2-3Q0 0 2-3M-2 3H2"} />
              </g>
            );
          })}
          <circle r="80" strokeWidth="0.6" />
          <path d="M0-80L47 65L-76-25H76L-47 65Z" strokeWidth="0.7" />
        </g>
        <g style={{ animation: `spin-slow ${spin * 0.6}s linear infinite reverse`, transformOrigin: "center" }}>
          <circle r="56" strokeWidth="0.8" strokeDasharray="3 4" />
          <path d="M0-56L48.5 28H-48.5Z M0 56L48.5-28H-48.5Z" strokeWidth="0.6" />
          <circle r="28" strokeWidth="0.8" />
          <circle r="10" strokeWidth="0.6" />
        </g>
      </g>
    </svg>
  );
}

function Chest2D({ open, color, special }: { open: boolean; color: string; special: boolean }) {
  return (
    <svg viewBox="-80 -90 160 140" className="h-full w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="c2-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6df" />
          <stop offset=".5" stopColor="#e3c37f" />
          <stop offset="1" stopColor="#8f6d2e" />
        </linearGradient>
        <linearGradient id="c2-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".45" />
          <stop offset=".5" stopColor={special ? "#e8c983" : "#9d7bff"} stopOpacity=".35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity=".1" />
        </linearGradient>
        <radialGradient id="c2-light">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".4" stopColor={color} stopOpacity=".8" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="0" cy="-6" r={open ? 90 : 30} fill="url(#c2-light)" style={{ transition: "r .5s ease-out" }} />
      <rect x="-60" y="-10" width="120" height="58" rx="4" fill="url(#c2-glass)" stroke="url(#c2-gold)" strokeWidth="3" />
      <rect x="-8" y="-10" width="16" height="58" fill="url(#c2-gold)" />
      <circle cx="0" cy="8" r="6" fill="#201A47" stroke="url(#c2-gold)" strokeWidth="2" />
      <motion.g style={{ originX: "50%", originY: "100%" }} animate={{ rotate: open ? -38 : 0, y: open ? -18 : 0, x: open ? -14 : 0 }} transition={{ type: "spring", stiffness: 180, damping: 12 }}>
        <path d="M-62-10V-26Q0-64 62-26V-10Z" fill="url(#c2-glass)" stroke="url(#c2-gold)" strokeWidth="3" />
        <path d="M-8-10V-45Q0-46 8-45V-10Z" fill="url(#c2-gold)" />
        <path d="M0-58l4 6-4 6-4-6z" fill="url(#c2-gold)" />
      </motion.g>
    </svg>
  );
}

export default function Ceremony2D({
  rarity,
  variant,
  onReveal,
  onDone,
  control,
}: {
  rarity: Rarity;
  variant: CeremonyVariant;
  onReveal: () => void;
  onDone: () => void;
  control?: React.MutableRefObject<CeremonyHandle | null>;
}) {
  const [phase, setPhase] = useState<Phase>(0);
  const color = variant === "lastone" ? COLOR.SSR : COLOR[rarity];
  const cb = useRef({ onReveal, onDone });
  cb.current = { onReveal, onDone };
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const k = variant === "lastone" ? 1.3 : variant === "multi" ? 0.7 : 1;

  useEffect(() => {
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms * k));
    at(700, () => setPhase(1));
    at(1700, () => setPhase(2));
    at(2600, () => {
      setPhase(3);
      cb.current.onReveal();
    });
    at(3600, () => {
      setPhase(4);
      cb.current.onDone();
    });
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, [k]);

  useEffect(() => {
    if (!control) return;
    control.current = {
      skip: () => {
        timers.current.forEach(clearTimeout);
        setPhase(4);
        cb.current.onReveal();
        cb.current.onDone();
      },
    };
    return () => {
      control.current = null;
    };
  }, [control]);

  const dots = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({ a: (i / 28) * Math.PI * 2, r: 140 + (i % 4) * 30, d: (i % 7) * 0.05 })),
    [],
  );

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {variant === "lastone" && (
        <motion.div
          className="absolute inset-y-0 left-1/2 w-48 -translate-x-1/2"
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,226,160,.45),transparent)" }}
          initial={{ opacity: 0, scaleX: 0.2 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, scaleX: phase >= 1 ? 1 : 0.2 }}
          transition={{ duration: 1 }}
        />
      )}
      <motion.div
        className="absolute"
        style={{ width: "min(88vw, 520px)", height: "min(88vw, 520px)", filter: `drop-shadow(0 0 12px ${color})` }}
        initial={{ scale: 0.3, opacity: 0, rotateX: 60 }}
        animate={{ scale: phase >= 3 ? 1.25 : 1, opacity: phase >= 3 ? 0.35 : 1, rotateX: 60 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <MagicCircleSVG color={phase >= 1 ? color : "#e9d4a0"} className="h-full w-full" spin={phase >= 1 ? 8 : 30} />
      </motion.div>
      {dots.map((d, i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{ background: i % 3 ? "#ffe6a8" : "#b9a2ff", boxShadow: `0 0 8px ${i % 3 ? "#ffe6a8" : "#b9a2ff"}` }}
          initial={{ x: Math.cos(d.a) * d.r, y: Math.sin(d.a) * d.r, opacity: 0 }}
          animate={
            phase === 0
              ? { opacity: 0.6 }
              : phase <= 2
                ? { x: 0, y: 0, opacity: 1 }
                : { x: Math.cos(d.a) * d.r * 2.2, y: Math.sin(d.a) * d.r * 2.2, opacity: 0 }
          }
          transition={{ duration: phase <= 2 ? 0.9 : 0.9, delay: d.d, ease: phase <= 2 ? "easeIn" : "easeOut" }}
        />
      ))}
      <motion.div
        className="relative h-40 w-48"
        initial={{ y: 60, scale: 0.3, opacity: 0 }}
        animate={phase >= 2 ? { y: 0, scale: 1, opacity: phase >= 4 ? 0 : 1 } : {}}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
      >
        <Chest2D open={phase >= 3} color={color} special={variant === "lastone"} />
      </motion.div>
      {phase >= 3 && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 50%, ${color}cc, transparent 55%)` }}
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.1 }}
        />
      )}
    </div>
  );
}
