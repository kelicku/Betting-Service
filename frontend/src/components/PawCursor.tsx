"use client";

/**
 * 猫の手のカーソル。
 * - カーソル自体は画像カーソル（globals.css の html.cursor-paw）。JavaScript で追いかけないので遅れがなく軽い
 * - 押せる要素の上ではピンクの手に変わる。文字入力欄は通常の I ビーム
 * - クリックした場所に肉球のスタンプが一瞬残る（演出レベル「最小限」・動きを減らす設定では出さない）
 * マウス・ペンなど細かく指せる端末のみ。タッチ端末では通常どおり。
 */

import { useEffect } from "react";
import { useMotionPref } from "@/lib/motion-pref";

export default function PawCursor() {
  const { level } = useMotionPref();

  useEffect(() => {
    const root = document.documentElement;
    const fine = window.matchMedia("(pointer: fine)");
    const apply = () => root.classList.toggle("cursor-paw", fine.matches);
    apply();
    fine.addEventListener("change", apply);
    return () => {
      fine.removeEventListener("change", apply);
      root.classList.remove("cursor-paw");
    };
  }, []);

  useEffect(() => {
    if (level === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const el = document.createElement("span");
      el.className = "paw-stamp";
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
      el.style.setProperty("--r", `${Math.round(Math.random() * 50 - 40)}deg`);
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
      el.addEventListener("animationend", () => el.remove(), { once: true });
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [level]);

  return null;
}
