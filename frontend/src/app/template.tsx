"use client";

import { motion } from "motion/react";

/**
 * ページ遷移：柔らかなフェードと、上から流れる光の帯。
 * transform / filter を使うと子孫の position: fixed（演出オーバーレイ・下部ボタン）の基準が
 * ずれるため、ページ本体は opacity のみでフェードさせる。
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-transparent via-gold-light to-transparent"
        initial={{ scaleX: 0, opacity: 1 }}
        animate={{ scaleX: 1, opacity: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        {children}
      </motion.div>
    </>
  );
}
