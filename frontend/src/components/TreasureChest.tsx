"use client";

/**
 * ログインボーナスの宝箱。金色の光は、周期の違う複数の層（ゆらめく光・回る光の筋・ふたの隙間から漏れる光・立ちのぼる金の粒）を
 * 重ねて、同じ動きの繰り返しに見えないようにしている。受け取ると、ふたが開いて金貨が飛び出す。
 */

import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo } from "react";
import { cx } from "./ui";

// 金の粒：位置・大きさ・速さ・横の揺れをばらばらにして、自然に立ちのぼるように見せる
const MOTES = [
  { x: 18, s: 4, d: 5.2, delay: 0, dx: -10 },
  { x: 30, s: 3, d: 6.8, delay: 1.6, dx: 8 },
  { x: 42, s: 5, d: 4.6, delay: 0.7, dx: -6 },
  { x: 50, s: 3, d: 7.4, delay: 2.9, dx: 12 },
  { x: 58, s: 4, d: 5.8, delay: 3.6, dx: -12 },
  { x: 66, s: 3, d: 6.2, delay: 1.1, dx: 6 },
  { x: 74, s: 5, d: 5.0, delay: 4.3, dx: -8 },
  { x: 84, s: 3, d: 7.0, delay: 2.2, dx: 10 },
  { x: 36, s: 2, d: 8.2, delay: 5.0, dx: 4 },
  { x: 62, s: 2, d: 7.8, delay: 0.3, dx: -4 },
];

export function TreasureChest({
  open = false,
  burstKey = 0,
  size = "lg",
  dim = false,
  className,
}: {
  open?: boolean;
  /** 値が変わるたびに金貨が飛び出す */
  burstKey?: number;
  size?: "sm" | "lg";
  /** 受け取り済みなど、光を控えめにする */
  dim?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const coins = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({ a: -90 + (i - 6.5) * 13 + (i % 3) * 4, r: 70 + (i % 4) * 18, rot: (i % 2 ? 1 : -1) * (180 + i * 20) })),
    [],
  );
  const lg = size === "lg";
  return (
    <div className={cx("chest relative isolate flex items-end justify-center", lg ? "h-44 w-56" : "h-12 w-12", dim && "chest-dim", className)} aria-hidden>
      {/* 光の層（奥から順に） */}
      <span className="chest-rays" />
      <span className="chest-aura chest-aura-a" />
      <span className="chest-aura chest-aura-b" />
      {lg && MOTES.map((m, i) => (
        <span
          key={i}
          className="chest-mote"
          style={{ left: `${m.x}%`, width: m.s, height: m.s, animationDuration: `${m.d}s`, animationDelay: `${m.delay}s`, ["--dx" as string]: `${m.dx}px` }}
        />
      ))}

      <svg viewBox="0 0 120 100" className={cx("relative z-[1] overflow-visible", lg ? "w-[10.5rem]" : "w-11")}>
        <defs>
          <linearGradient id={`body-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7b4fd8" />
            <stop offset="1" stopColor="#3b2382" />
          </linearGradient>
          <linearGradient id={`lid-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9a6cf0" />
            <stop offset="1" stopColor="#5a35b0" />
          </linearGradient>
          <linearGradient id={`gold-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff4c0" />
            <stop offset="0.45" stopColor="#f7c645" />
            <stop offset="1" stopColor="#c98a10" />
          </linearGradient>
          <radialGradient id={`inside-${id}`} cx="0.5" cy="0.2" r="0.8">
            <stop offset="0" stopColor="#fffbe0" />
            <stop offset="0.5" stopColor="#ffd75e" />
            <stop offset="1" stopColor="#e09a12" />
          </radialGradient>
          <filter id={`soft-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* 開いたときの中の光 */}
        <ellipse cx="60" cy="51" rx="46" ry="10" fill={`url(#inside-${id})`} opacity={open ? 1 : 0} style={{ transition: "opacity .5s" }} />
        {open && <ellipse cx="60" cy="46" rx="34" ry="14" fill="#fff3b0" opacity=".55" filter={`url(#soft-${id})`} className="chest-seam" />}
        {/* 本体 */}
        <rect x="14" y="50" width="92" height="44" fill={`url(#body-${id})`} />
        <rect x="14" y="50" width="92" height="7" fill={`url(#gold-${id})`} />
        <rect x="14" y="87" width="92" height="7" fill={`url(#gold-${id})`} />
        <rect x="24" y="50" width="7" height="44" fill={`url(#gold-${id})`} />
        <rect x="89" y="50" width="7" height="44" fill={`url(#gold-${id})`} />
        {/* 錠前（宝石） */}
        <path d="M52 56h16v16l-8 7-8-7z" fill={`url(#gold-${id})`} />
        <path d="M60 60l4 5-4 6-4-6z" fill="#ff4f97" />
        <path d="M60 60l2 3h-4z" fill="#ffd0e4" />

        {/* ふた（開くと奥へ倒れる） */}
        <g className="chest-lid" style={{ transform: open ? "translate(-4px, -16px) rotate(-24deg)" : "none" }}>
          <path d="M12 50V36c0-15 22-26 48-26s48 11 48 26v14z" fill={`url(#lid-${id})`} />
          <path d="M12 44h96v6H12z" fill={`url(#gold-${id})`} />
          <path d="M23 50V30c3-7 5-10 8-12v32zM97 50V30c-3-7-5-10-8-12v32z" fill={`url(#gold-${id})`} />
          <path d="M30 22c9-5 19-7 30-7" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* ふたの隙間から漏れる光（閉じているときだけ） */}
        {!open && (
          <g className="chest-seam">
            <rect x="16" y="48.5" width="88" height="3" fill="#fff2a8" filter={`url(#soft-${id})`} />
            <rect x="20" y="49.3" width="80" height="1.4" fill="#fffbe6" />
          </g>
        )}
      </svg>

      {/* 受け取ったときに飛び出す金貨 */}
      <AnimatePresence>
        {burstKey > 0 && lg && (
          <span key={burstKey} className="pointer-events-none absolute left-1/2 top-[45%] z-[2]">
            {coins.map((c, i) => {
              const rad = (c.a * Math.PI) / 180;
              return (
                <motion.span
                  key={i}
                  className="chest-coin absolute -ml-2.5 -mt-2.5 h-5 w-5"
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
                  animate={{ x: Math.cos(rad) * c.r, y: [0, Math.sin(rad) * c.r, Math.sin(rad) * c.r + 60], opacity: [0, 1, 0], scale: [0.4, 1, 0.8], rotate: c.rot }}
                  transition={{ duration: 1.3, delay: i * 0.025, ease: "easeOut" }}
                />
              );
            })}
          </span>
        )}
      </AnimatePresence>
    </div>
  );
}
