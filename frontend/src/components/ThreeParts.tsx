"use client";

/**
 * 3D 演出の呼び出し口。演出レベル「すべて」のときだけ Three.js を読み込み、
 * それ以外（軽量・最小限・WebGL 非対応・初期化失敗）は同じ情報を持つ 2D 表示に切り替える。
 */

import dynamic from "next/dynamic";
import { useMotionPref } from "@/lib/motion-pref";
import type { Prize } from "@/lib/types";
import { ThreeBoundary } from "@/three/boundary";
import { PrizeCard } from "./PrizeCard";

const PrizePedestal3D = dynamic(() => import("@/three/PrizePedestal3D"), { ssr: false, loading: () => null });

/** ラストワン賞などの景品を、ゆっくり回る台座の上に飾る。軽量版は景品カード。 */
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
