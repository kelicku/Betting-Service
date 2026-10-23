"use client";

/**
 * 当選ランクの演出動画（管理画面でアップロードした MP4・縦長）を全画面で再生する。
 * スマートフォンは音付きの自動再生ができないため、「タップして演出を見る」を押してから音付きで再生する。
 * 再生が終わる・スキップ・読み込みに失敗したら onDone（結果の表示へ）。
 */

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export default function RankVideo({ url, logo, label, onDone }: { url: string; logo: string | null; label: string; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const start = async () => {
    const v = video.current;
    if (!v) return finish();
    try {
      v.muted = false;
      await v.play();
      setPlaying(true);
    } catch {
      // 音付きで再生できない環境では、音を消して再生する
      try {
        v.muted = true;
        await v.play();
        setPlaying(true);
      } catch {
        finish();
      }
    }
  };

  return (
    <div className="theme-night fixed inset-0 z-[75] flex items-center justify-center bg-black" role="dialog" aria-label={`${label}の演出`}>
      <video
        ref={video}
        src={url}
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
        className="h-full max-h-[100dvh] w-full max-w-[calc(100dvh*9/16)] object-contain"
      />
      {!playing && (
        <motion.button
          type="button"
          onClick={start}
          className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[radial-gradient(circle_at_50%_40%,rgba(255,92,147,0.35),rgba(0,0,0,0.9)_65%)] text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt={label} className="max-h-40 max-w-[80%] object-contain drop-shadow-[0_0_24px_rgba(255,255,255,0.6)]" /> : <span className="font-round text-5xl font-black drop-shadow-[0_0_20px_rgba(255,92,147,0.9)]">{label}</span>}
          <motion.span
            className="sh-ribbon bg-white/95 px-12 py-3.5 font-round text-lg font-bold text-[#e81e64]"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.4 }}
          >
            タップして演出を見る
          </motion.span>
        </motion.button>
      )}
      <button
        type="button"
        onClick={finish}
        className="sh-arrow absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 bg-white/20 py-2 pl-4 text-sm font-bold text-white backdrop-blur hover:bg-white/30"
      >
        スキップ ≫
      </button>
    </div>
  );
}
