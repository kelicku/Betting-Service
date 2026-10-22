"use client";

import { MotionConfig } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * 演出レベル
 *  full : 3D 演出（Three.js）を含むすべての演出
 *  lite : 3D を使わない軽量な 2D 演出（低性能端末の既定）
 *  off  : アニメーションを最小限にする（OS の「視差効果を減らす」設定の既定）
 */
export type MotionLevel = "full" | "lite" | "off";

const KEY = "hf_motion_level";
const Ctx = createContext<{ level: MotionLevel; auto: boolean; setLevel: (l: MotionLevel | "auto") => void }>({
  level: "lite",
  auto: true,
  setLevel: () => {},
});

function detect(): MotionLevel {
  if (typeof window === "undefined") return "lite";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "off";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  if (!webgl || cores <= 2 || mem <= 2) return "lite";
  return "full";
}

export function MotionPrefProvider({ children }: { children: React.ReactNode }) {
  const [stored, setStored] = useState<MotionLevel | "auto">("auto");
  const [detected, setDetected] = useState<MotionLevel>("lite");

  useEffect(() => {
    setDetected(detect());
    try {
      const v = localStorage.getItem(KEY) as MotionLevel | null;
      if (v === "full" || v === "lite" || v === "off") setStored(v);
    } catch {
      /* private mode */
    }
  }, []);

  const level = stored === "auto" ? detected : stored;
  useEffect(() => {
    document.documentElement.dataset.motion = level;
  }, [level]);

  const value = useMemo(
    () => ({
      level,
      auto: stored === "auto",
      setLevel: (l: MotionLevel | "auto") => {
        setStored(l);
        try {
          if (l === "auto") localStorage.removeItem(KEY);
          else localStorage.setItem(KEY, l);
        } catch {
          /* ignore */
        }
      },
    }),
    [level, stored],
  );

  return (
    <Ctx.Provider value={value}>
      <MotionConfig reducedMotion={level === "off" ? "always" : "never"}>{children}</MotionConfig>
    </Ctx.Provider>
  );
}

export const useMotionPref = () => useContext(Ctx);
