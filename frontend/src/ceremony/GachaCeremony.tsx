"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MascotSays } from "@/components/Mascot";
import { PrizeCard } from "@/components/PrizeCard";
import { Button, Modal, Points, RarityBadge, Tickets } from "@/components/ui";
import { RARITY } from "@/lib/format";
import { useMotionPref } from "@/lib/motion-pref";
import { playCharge, playLastOne, playReveal, useSound } from "@/lib/sound";
import type { Draw, DrawResult } from "@/lib/types";
import Ceremony2D from "./Ceremony2D";
import type { CeremonyHandle, CeremonyVariant } from "./CeremonyScene";
import { LastOneReveal, MultiReveal, RarityCounts, ResultGrid, SingleReveal } from "./Reveal";

// 3D 演出は必要な場面でのみ読み込む（初期表示の JS を軽く保つ）
const CeremonyScene = dynamic(() => import("./CeremonyScene"), { ssr: false, loading: () => null });

type Stage = "summon" | "reveal" | "lastone-summon" | "lastone-reveal" | "final";

export default function GachaCeremony({
  draw,
  onAgain,
  onResults,
  onExit,
  canAgain,
  instant = false,
}: {
  draw: Draw;
  onAgain: () => void;
  onResults: () => void;
  onExit: () => void;
  canAgain: boolean;
  /** 演出動画を流したあとなど、標準の演出を省いてすぐ結果を表示する */
  instant?: boolean;
}) {
  const { level: prefLevel } = useMotionPref();
  const level = instant ? "off" : prefLevel;
  const lastOne = useMemo(() => draw.results.find((r) => r.is_last_one) ?? null, [draw]);
  const normal = useMemo(() => draw.results.filter((r) => !r.is_last_one), [draw]);
  const [stage, setStage] = useState<Stage>(level === "off" ? (lastOne ? "lastone-reveal" : "final") : "summon");
  const [sceneOn, setSceneOn] = useState(level !== "off");
  const [skipAll, setSkipAll] = useState(level === "off");
  const [revealDone, setRevealDone] = useState(level === "off");
  const [selected, setSelected] = useState<DrawResult | null>(null);
  const control = useRef<CeremonyHandle | null>(null);

  const variant: CeremonyVariant = stage.startsWith("lastone") ? "lastone" : draw.count === 1 ? "normal" : "multi";
  const bestNormal = useMemo(
    () => normal.reduce((b, r) => (RARITY[r.rarity].order > RARITY[b.rarity].order ? r : b), normal[0]).rarity,
    [normal],
  );

  // 効果音：ため → 公開（ランクごと）。演出動画のあと（instant）は動画の音を使うので鳴らさない
  const stopCharge = useRef<() => void>(() => {});
  useEffect(() => {
    if (instant) return;
    if (stage === "summon" || stage === "lastone-summon") {
      // 公開までの秒数（3D：CeremonyScene のタイムライン、2D：Ceremony2D のタイマー）
      const v = stage === "lastone-summon" ? "lastone" : variant;
      const k = level === "full" ? { lastone: 1.35, multi: 0.75, normal: 1 }[v] * 3.8 : { lastone: 1.3, multi: 0.7, normal: 1 }[v] * 2.6;
      stopCharge.current = playCharge(Math.max(0.8, k - 0.15));
    }
    return () => stopCharge.current();
  }, [stage, instant, level, variant]);
  useEffect(() => {
    // 演出を最小限にしている場合は、結果の表示と同時に 1 回だけ鳴らす
    if (instant || level !== "off") return;
    if (lastOne) playLastOne();
    else playReveal(bestNormal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onReveal = useCallback(() => {
    setStage((s) => {
      if (s === "summon") playReveal(bestNormal);
      if (s === "lastone-summon") playLastOne();
      return s === "summon" ? "reveal" : s === "lastone-summon" ? "lastone-reveal" : s;
    });
  }, [bestNormal]);
  const onSceneDone = useCallback(() => setSceneOn(false), []);

  const finishReveal = useCallback(() => setRevealDone(true), []);

  const goLastOne = () => {
    setRevealDone(false);
    setSceneOn(true);
    setStage("lastone-summon");
  };

  const skip = () => {
    if (stage === "summon" || stage === "lastone-summon") {
      control.current?.skip();
      setSceneOn(false);
      setStage(stage === "summon" ? "reveal" : "lastone-reveal");
      setSkipAll(true);
    } else if (stage === "reveal") {
      setSkipAll(true);
    }
  };

  const showActions = stage === "final" || (stage === "reveal" && revealDone && !lastOne) || stage === "lastone-reveal";
  const showSkip = !showActions && !(stage === "reveal" && revealDone);

  return (
    <div className="theme-night fixed inset-0 z-[70] overflow-hidden bg-night-900">
      {/* 背景：暗転と周辺減光 */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: stage.startsWith("lastone")
            ? "radial-gradient(ellipse at 50% 55%, #2a1f0c 0%, #070512 60%, #020108 100%)"
            : "radial-gradient(ellipse at 50% 55%, #1f1848 0%, #080d20 55%, #03050f 100%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      {/* 魔法陣と宝箱 */}
      <AnimatePresence>
        {sceneOn && (
          <motion.div key={variant} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: stage === "reveal" || stage === "lastone-reveal" ? 0.45 : 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            {level === "full" ? (
              <CeremonyScene
                rarity={variant === "lastone" ? "SSR" : bestNormal}
                variant={variant}
                quality={typeof window !== "undefined" && window.innerWidth < 640 ? "low" : "high"}
                onReveal={onReveal}
                onDone={onSceneDone}
                control={control}
              />
            ) : (
              <Ceremony2D rarity={variant === "lastone" ? "SSR" : bestNormal} variant={variant} onReveal={onReveal} onDone={onSceneDone} control={control} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 結果の公開 */}
      <div className="relative z-10 flex h-full flex-col overflow-y-auto">
        <div className="flex min-h-full flex-col items-center justify-center px-4 pb-36 pt-20">
          {stage === "reveal" && draw.count === 1 && <SingleReveal result={normal[0]} onDone={finishReveal} />}
          {stage === "reveal" && draw.count === 10 && (
            <div className="w-full">
              <p className="mb-5 text-center font-serif text-lg text-gold-light/90">10回分の宝物</p>
              <MultiReveal results={normal} skipAll={skipAll} onDone={finishReveal} onSelect={setSelected} />
            </div>
          )}
          {stage === "reveal" && draw.count === 100 && (
            <motion.div className="w-full max-w-5xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onAnimationComplete={finishReveal}>
              <p className="mb-4 text-center font-serif text-lg text-gold-light/90">100回分の結果</p>
              <RarityCounts counts={draw.rarity_counts} animate={!skipAll} />
              <div className="mt-5">
                <ResultGrid results={normal} onSelect={setSelected} dense />
              </div>
            </motion.div>
          )}
          {stage === "lastone-reveal" && lastOne && <LastOneReveal result={lastOne} />}
          {stage === "final" && (
            <div className="w-full max-w-5xl">
              <MascotSays className="mb-3">{RARITY[bestNormal].order >= RARITY.SR.order || lastOne ? "やったね！おめでとう！" : "おめでとう！また遊んでね"}</MascotSays>
              <p className="mb-4 text-center font-serif text-lg text-gold-light/90">獲得した景品</p>
              {draw.count === 100 && <RarityCounts counts={draw.rarity_counts} animate={false} />}
              <div className="mt-5">
                <ResultGrid results={draw.results} onSelect={setSelected} dense={draw.count === 100} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 操作 */}
      {!instant && <SoundToggle />}
      {showSkip && (
        <button
          onClick={skip}
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 rounded-full border border-white/15 bg-night/60 px-4 py-2 text-sm text-moon/80 backdrop-blur transition hover:border-gold/50 hover:text-gold-light"
        >
          スキップ ≫
        </button>
      )}
      <AnimatePresence>
        {stage === "reveal" && revealDone && lastOne && (
          <motion.div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Button size="xl" onClick={goLastOne} className="animate-pulse">
              ✦ 最後の1口を引き当てました…！
            </Button>
          </motion.div>
        )}
        {showActions && (
          <motion.div
            className="absolute inset-x-0 bottom-0 z-20 border-t border-gold/15 bg-night/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: stage === "lastone-reveal" ? 2.2 : 0.3 }}
          >
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 sm:gap-3">
              {(draw.points_won ?? 0) > 0 && (
                <span className="w-full text-center font-round text-base font-bold text-gold-light sm:order-first sm:w-auto">
                  ポイント <Points n={draw.points_won ?? 0} className="text-lg" /> 獲得！
                </span>
              )}
              {draw.balance_after != null && (
                <span className="mr-auto hidden text-sm text-moon/60 sm:inline">
                  所持チケット <Tickets n={draw.balance_after} className="text-gold-light" />
                  {draw.point_balance_after != null && (
                    <>
                      <span className="mx-2 text-moon/30">|</span>
                      ポイント <Points n={draw.point_balance_after} className="text-gold-light" />
                    </>
                  )}
                </span>
              )}
              {stage === "lastone-reveal" && (
                <Button variant="ghost" onClick={() => setStage("final")}>
                  すべての結果を見る
                </Button>
              )}
              <Button variant="ghost" onClick={onResults}>
                抽選結果の詳細
              </Button>
              {canAgain && (
                <Button onClick={onAgain}>
                  もう一度引く
                </Button>
              )}
              <Button variant="subtle" onClick={onExit}>
                閉じる
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-56">
              <PrizeCard prize={selected.prize} rarity={selected.rarity} size="lg" lastOne={selected.is_last_one} />
            </div>
            <div className="text-center">
              <RarityBadge rarity={selected.rarity} size="md" />
              <p className="mt-2 font-serif text-xl font-bold">{selected.prize.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-moon/65">{selected.prize.description}</p>
            </div>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              閉じる
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** 効果音のオン・オフ（ブラウザに保存） */
function SoundToggle() {
  const [on, setOn] = useSound();
  return (
    <button
      onClick={() => setOn(!on)}
      aria-pressed={on}
      aria-label={on ? "効果音をオフにする" : "効果音をオンにする"}
      className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-night/60 text-moon/80 backdrop-blur transition hover:border-gold/50 hover:text-gold-light"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
        {on ? <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
      </svg>
    </button>
  );
}
