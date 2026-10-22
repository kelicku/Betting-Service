"use client";

/**
 * 「星の杖」カーソル。
 * - 中心：ゆっくり回る金の四芒星（ポインターの位置に遅れなく表示）
 * - 外周：魔法陣のような輪が少し遅れてついてくる。押せる要素の上では輪が広がり、淡く光る
 * - 動かすと星屑が舞い、クリックすると小さな星がはじける
 * マウス・ペンなど細かく指せる端末のみ。演出レベル「最小限」では通常のカーソル、
 * 「軽量」では軽い画像カーソル（globals.css）に切り替える。文字入力欄では通常の I ビームを表示する。
 */

import { useEffect, useRef } from "react";
import { useMotionPref } from "@/lib/motion-pref";

const HOVER_SEL = 'a, button, [role="button"], [role="tab"], label, select, summary, [data-cursor="hover"]';
const TEXT_SEL = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]), textarea, [contenteditable="true"]';

type Mote = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; hue: 0 | 1; star: boolean };

export default function CursorLayer() {
  const { level } = useMotionPref();
  const star = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const fine = window.matchMedia("(pointer: fine)").matches;
    root.classList.remove("cursor-wand", "cursor-lite");
    if (!fine || level === "off") return;
    if (level === "lite") {
      root.classList.add("cursor-lite");
      return () => root.classList.remove("cursor-lite");
    }
    root.classList.add("cursor-wand");

    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      cv.style.width = window.innerWidth + "px";
      cv.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const pos = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100 };
    let hover = false;
    let pressed = false;
    let hidden = true;
    let overText = false;
    let lastX = -100,
      lastY = -100;
    let angle = 0;
    let scale = 1;
    const motes: Mote[] = [];

    const spawn = (x: number, y: number, n: number, burst: boolean) => {
      for (let i = 0; i < n; i++) {
        const a = burst ? (i / n) * Math.PI * 2 + Math.random() * 0.4 : Math.random() * Math.PI * 2;
        const sp = burst ? 1.6 + Math.random() * 2.4 : 0.2 + Math.random() * 0.6;
        motes.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp + (burst ? 0 : 0.35),
          life: 0,
          max: burst ? 38 + Math.random() * 18 : 30 + Math.random() * 30,
          size: burst ? 3 + Math.random() * 3 : 1 + Math.random() * 2.2,
          hue: Math.random() < 0.7 ? 0 : 1,
          star: burst || Math.random() < 0.25,
        });
      }
      if (motes.length > 260) motes.splice(0, motes.length - 260);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (hidden) {
        ringPos.x = pos.x;
        ringPos.y = pos.y;
        hidden = false;
      }
      const t = e.target as Element | null;
      overText = !!t?.closest?.(TEXT_SEL);
      hover = !overText && !!t?.closest?.(HOVER_SEL);
      const dist = Math.hypot(pos.x - lastX, pos.y - lastY);
      if (dist > 6 && !overText) {
        spawn(pos.x, pos.y, Math.min(3, Math.ceil(dist / 14)), false);
        lastX = pos.x;
        lastY = pos.y;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      pressed = true;
      if (!overText) spawn(e.clientX, e.clientY, 12, true);
    };
    const onUp = () => (pressed = false);
    const onLeave = () => (hidden = true);
    // 3D キャンバス内のカードなど、DOM で判定できない要素からの通知
    const onCustom = (e: Event) => (hover = !!(e as CustomEvent<{ hover: boolean }>).detail?.hover);

    const drawStar = (x: number, y: number, r: number, rot: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.28, Math.sin(a + Math.PI / 4) * r * 0.28);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    let raf = 0;
    const loop = () => {
      // 輪はなめらかに追従
      ringPos.x += (pos.x - ringPos.x) * 0.2;
      ringPos.y += (pos.y - ringPos.y) * 0.2;
      angle += hover ? 0.05 : 0.018;
      scale += ((pressed ? 0.75 : hover ? 1.7 : 1) - scale) * 0.2;
      const s = star.current,
        r = ring.current;
      const show = !hidden && !overText;
      if (s) {
        s.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${angle * 2}rad) scale(${hover ? 1.25 : 1})`;
        s.style.opacity = show ? "1" : "0";
      }
      if (r) {
        r.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) rotate(${-angle}rad) scale(${scale})`;
        r.style.opacity = show ? "1" : "0";
        r.dataset.hover = hover ? "1" : "0";
      }
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = "lighter";
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.life++;
        m.x += m.vx;
        m.y += m.vy;
        m.vx *= 0.96;
        m.vy = m.vy * 0.96 + 0.025;
        const p = m.life / m.max;
        if (p >= 1) {
          motes.splice(i, 1);
          continue;
        }
        const a = (1 - p) * 0.9;
        ctx.fillStyle = m.hue === 0 ? `rgba(243,223,179,${a})` : `rgba(190,165,255,${a})`;
        ctx.shadowColor = m.hue === 0 ? "rgba(243,223,179,0.9)" : "rgba(165,139,234,0.9)";
        ctx.shadowBlur = 8;
        if (m.star) drawStar(m.x, m.y, m.size * (1 - p * 0.5), m.life * 0.08);
        else {
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.size * (1 - p), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("hf-cursor", onCustom);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove("cursor-wand");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", resize);
      window.removeEventListener("hf-cursor", onCustom);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [level]);

  if (level !== "full") return null;
  return (
    <div aria-hidden className="cursor-layer pointer-events-none fixed inset-0 z-[9999] hidden [@media(pointer:fine)]:block">
      <canvas ref={canvas} className="absolute inset-0" />
      <div ref={ring} className="cursor-ring absolute left-0 top-0 opacity-0">
        <svg viewBox="-20 -20 40 40" width="40" height="40" style={{ marginLeft: -20, marginTop: -20 }}>
          <circle r="16" fill="none" stroke="rgba(243,223,179,0.75)" strokeWidth="0.8" />
          <circle r="12.5" fill="none" stroke="rgba(216,185,118,0.55)" strokeWidth="0.6" strokeDasharray="1.2 2.6" />
          {[0, 90, 180, 270].map((a) => (
            <path key={a} transform={`rotate(${a})`} d="M0 -19 L1.2 -16 L0 -14.6 L-1.2 -16 Z" fill="rgba(243,223,179,0.9)" />
          ))}
        </svg>
      </div>
      <div ref={star} className="absolute left-0 top-0 opacity-0">
        <svg viewBox="-12 -12 24 24" width="22" height="22" style={{ marginLeft: -11, marginTop: -11, filter: "drop-shadow(0 0 4px rgba(243,223,179,0.95))" }}>
          <defs>
            <linearGradient id="cur-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fffaf0" />
              <stop offset=".55" stopColor="#f3dfb3" />
              <stop offset="1" stopColor="#c9a65c" />
            </linearGradient>
          </defs>
          <path d="M0 -10 L2.2 -2.2 L10 0 L2.2 2.2 L0 10 L-2.2 2.2 L-10 0 L-2.2 -2.2 Z" fill="url(#cur-g)" />
          <circle r="1.6" fill="#fff" />
        </svg>
      </div>
    </div>
  );
}
