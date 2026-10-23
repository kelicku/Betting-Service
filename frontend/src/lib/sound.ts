"use client";

/**
 * ガチャ演出の効果音（音声ファイルを使わず、ブラウザの Web Audio で合成する）。
 * - 当選ランクの演出動画（MP4）がある場合は動画の音を使うため、ここでは鳴らさない
 * - スマートフォンは画面に触れた操作の中でないと音を出せないため、「引く」ボタンを押したときに unlock() を呼ぶ
 * - 音のオン・オフは会員ごとにブラウザへ保存する（既定はオン）。iPhone のマナーモード中は鳴らない
 */

import { useEffect, useState } from "react";
import type { Rarity } from "./types";

const KEY = "wk_sound";
let ctx: AudioContext | null = null;
let enabled = true;
const listeners = new Set<(on: boolean) => void>();

try {
  if (typeof window !== "undefined") enabled = localStorage.getItem(KEY) !== "off";
} catch {
  /* private mode */
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/** 画面に触れた操作の中で呼ぶ（スマートフォンで音を出せるようにする） */
export function unlock() {
  const c = audio();
  if (!c) return;
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  if (!on && ctx) void ctx.suspend().catch(() => {});
  listeners.forEach((f) => f(on));
}

export function useSound(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(enabled);
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return [on, setSoundEnabled];
}

/* ---------------- 音の部品 ---------------- */

function master(c: AudioContext, gain = 0.5) {
  const g = c.createGain();
  g.gain.value = gain;
  g.connect(c.destination);
  return g;
}

/** ベル（澄んだ「チーン」）。倍音を重ねて減衰させる */
function bell(c: AudioContext, out: AudioNode, freq: number, at: number, dur = 1.2, vol = 0.35) {
  for (const [mul, v] of [[1, 1], [2, 0.35], [3.01, 0.18], [4.2, 0.08]] as const) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = freq * mul;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol * v, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur / mul ** 0.3);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}

/** キラキラ（高い音の粒） */
function sparkle(c: AudioContext, out: AudioNode, at: number, count: number, spread: number, vol = 0.12) {
  for (let i = 0; i < count; i++) {
    const f = 1800 + Math.random() * 2600;
    bell(c, out, f, at + Math.random() * spread, 0.35, vol);
  }
}

/** ため（ノイズが高くなっていく「シュワー」） */
function riser(c: AudioContext, out: AudioNode, at: number, dur: number, vol = 0.18) {
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 6;
  f.frequency.setValueAtTime(300, at);
  f.frequency.exponentialRampToValueAtTime(5000, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.08);
  src.connect(f).connect(g).connect(out);
  src.start(at);
  src.stop(at + dur + 0.1);
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

/* ---------------- 演出で使う音 ---------------- */

/** 魔法陣が現れてから開封までの「ため」（秒） */
export function playCharge(seconds = 2.2): () => void {
  const c = audio();
  if (!c) return () => {};
  const out = master(c, 0.5);
  const t = c.currentTime + 0.02;
  riser(c, out, t, seconds);
  // 上がっていく分散和音
  [60, 64, 67, 72, 76, 79].forEach((n, i) => bell(c, out, NOTE(n), t + (seconds * 0.8 * i) / 6, 0.6, 0.12));
  // スキップしたときは止める
  return () => {
    out.gain.cancelScheduledValues(c.currentTime);
    out.gain.setTargetAtTime(0, c.currentTime, 0.05);
  };
}

/** 景品の公開（ランクごとに豪華さを変える） */
export function playReveal(rarity: Rarity) {
  const c = audio();
  if (!c) return;
  const out = master(c, 0.55);
  const t = c.currentTime + 0.02;
  if (rarity === "N") {
    bell(c, out, NOTE(79), t, 0.9, 0.3);
  } else if (rarity === "R") {
    bell(c, out, NOTE(76), t, 0.9, 0.3);
    bell(c, out, NOTE(81), t + 0.12, 1.1, 0.3);
    sparkle(c, out, t, 4, 0.5);
  } else if (rarity === "SR") {
    [72, 76, 79, 84].forEach((n, i) => bell(c, out, NOTE(n), t + i * 0.09, 1.3, 0.28));
    sparkle(c, out, t + 0.2, 10, 0.9);
  } else {
    playFanfare(c, out, t);
  }
}

function playFanfare(c: AudioContext, out: AudioNode, t: number) {
  // 「パッパッパー」と上がって、和音で伸ばす
  [[72, 0], [72, 0.14], [72, 0.28], [79, 0.42]].forEach(([n, d]) => bell(c, out, NOTE(n), t + d, 0.5, 0.3));
  [72, 76, 79, 84, 88].forEach((n) => bell(c, out, NOTE(n), t + 0.62, 2.2, 0.22));
  sparkle(c, out, t + 0.6, 22, 1.6, 0.1);
}

/** ラストワン賞 */
export function playLastOne() {
  const c = audio();
  if (!c) return;
  const out = master(c, 0.6);
  const t = c.currentTime + 0.02;
  riser(c, out, t, 0.8, 0.2);
  playFanfare(c, out, t + 0.8);
  [60, 67, 72].forEach((n) => bell(c, out, NOTE(n), t + 1.42, 3, 0.18));
}

/** カードがめくれる小さな音（10 回引きで 1 枚ずつ） */
export function playTick(rarity: Rarity = "N") {
  const c = audio();
  if (!c) return;
  const out = master(c, 0.35);
  const n = { N: 84, R: 88, SR: 91, SSR: 96 }[rarity];
  bell(c, out, NOTE(n), c.currentTime + 0.01, 0.25, 0.2);
}
