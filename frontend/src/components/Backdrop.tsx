"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useMotionPref } from "@/lib/motion-pref";
import { ThreeBoundary } from "@/three/boundary";
import Starfield from "./Starfield";

const CelestialBackground = dynamic(() => import("@/three/CelestialBackground"), { ssr: false, loading: () => <Starfield /> });

/**
 * サイト全体の背景。演出レベル「すべて」では Three.js の星空、それ以外は軽量な 2D の星空。
 * 3D はページの表示が落ち着いてから読み込み（最初の描画を遅らせない）、それまでは 2D を表示する。
 */
export default function Backdrop() {
  const { level } = useMotionPref();
  const path = usePathname();
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (level !== "full") return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => setIdle(true), { timeout: 1500 });
    else setTimeout(() => setIdle(true), 600);
  }, [level]);
  // ガチャ実行画面は演出が全面を覆うため、背景の描画を止めて GPU を演出に回す
  if (/^\/gacha\/[^/]+\/play/.test(path)) return null;
  if (level !== "full" || !idle) return <Starfield />;
  return (
    <ThreeBoundary fallback={<Starfield />}>
      <CelestialBackground />
    </ThreeBoundary>
  );
}
