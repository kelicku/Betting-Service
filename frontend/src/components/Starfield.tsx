"use client";

import { useEffect, useRef } from "react";
import { useMotionPref } from "@/lib/motion-pref";

/**
 * サイト全体の背景：静かに瞬く星と、ゆっくり漂う魔法の粒子。
 * 2D Canvas で描画し、スクロールに応じて層ごとに異なる速度で動かして奥行きを出す。
 * タブ非表示時は停止し、演出レベル off では静止画として 1 回だけ描画する。
 */
export default function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { level } = useMotionPref();

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0,
      h = 0,
      dpr = 1,
      raf = 0,
      running = true;

    type Star = { x: number; y: number; r: number; layer: number; phase: number; speed: number; hue: number };
    type Mote = { x: number; y: number; r: number; vx: number; vy: number; life: number; max: number; gold: boolean };
    let stars: Star[] = [];
    const motes: Mote[] = [];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(260, (w * h) / 6500) * (level === "full" ? 1 : 0.6));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 1.6,
        r: Math.random() ** 2.2 * 1.6 + 0.25,
        layer: Math.random() < 0.6 ? 0 : Math.random() < 0.7 ? 1 : 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.4,
        hue: Math.random(),
      }));
    };

    const spawnMote = (): Mote => ({
      x: Math.random() * w,
      y: h + 10 - Math.random() * h * 0.2,
      r: 0.8 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(0.12 + Math.random() * 0.35),
      life: 0,
      max: 600 + Math.random() * 900,
      gold: Math.random() < 0.65,
    });

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const scroll = window.scrollY;
      const parallax = [0.04, 0.09, 0.16];
      for (const s of stars) {
        const y = (((s.y - scroll * parallax[s.layer]) % (h * 1.6)) + h * 1.6) % (h * 1.6);
        if (y > h + 4) continue;
        const tw = level === "off" ? 0.8 : 0.55 + 0.45 * Math.sin(t * 0.001 * s.speed + s.phase);
        const a = tw * (0.35 + s.layer * 0.25);
        const color = s.hue < 0.15 ? `rgba(243,223,179,${a})` : s.hue < 0.3 ? `rgba(181,232,247,${a})` : `rgba(247,244,255,${a})`;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
        if (s.r > 1.35 && tw > 0.85) {
          // 明るい星には十字の光芒
          ctx.strokeStyle = `rgba(255,248,230,${(tw - 0.85) * 2.2})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(s.x - s.r * 4, y);
          ctx.lineTo(s.x + s.r * 4, y);
          ctx.moveTo(s.x, y - s.r * 4);
          ctx.lineTo(s.x, y + s.r * 4);
          ctx.stroke();
        }
      }
      if (level !== "off") {
        const target = level === "full" ? 34 : 14;
        while (motes.length < target) {
          const m = spawnMote();
          m.y = Math.random() * h;
          m.life = Math.random() * m.max;
          motes.push(m);
        }
        ctx.globalCompositeOperation = "lighter";
        for (let i = motes.length - 1; i >= 0; i--) {
          const m = motes[i];
          m.life++;
          m.x += m.vx + Math.sin((t * 0.0004 + i) * 1.3) * 0.12;
          m.y += m.vy;
          const p = m.life / m.max;
          const a = Math.sin(Math.PI * Math.min(p, 1)) * 0.55;
          if (p >= 1 || m.y < -20) {
            motes[i] = spawnMote();
            continue;
          }
          const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 5);
          g.addColorStop(0, m.gold ? `rgba(243,223,179,${a})` : `rgba(165,139,234,${a})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r * 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }
    };

    const loop = (t: number) => {
      if (!running) return;
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      running = !document.hidden && level !== "off";
      if (running) raf = requestAnimationFrame(loop);
      else cancelAnimationFrame(raf);
    };

    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    const onScroll = () => {
      if (level === "off") draw(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (level === "off") {
      running = false;
      draw(0);
    } else raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [level]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />;
}
