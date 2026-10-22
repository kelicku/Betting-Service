"use client";

/** Three.js 演出の共通部品：環境マップ・表示状態・ポインター位置・エラー時の代替表示・カード用ジオメトリ。 */

import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** 金属・ガラスの質感に使う環境マップ（外部画像なし）。 */
export function RoomEnv({ intensity = 0.04 }: { intensity?: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), intensity).texture;
    scene.environment = env;
    return () => {
      env.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene, intensity]);
  return null;
}

/** 要素が画面内にあり、タブが表示中のときだけ描画する（GPU と電池の節約）。 */
export function useActiveRender<T extends Element>(rootMargin = "100px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [rootMargin]);
  return { ref, active: inView && visible };
}

/** 画面全体で共有するポインター位置（-1〜1）。キャンバスが pointer-events: none でも追従できる。 */
export const pointer = { x: 0, y: 0 };
let pointerInstalled = false;
export function installPointer() {
  if (pointerInstalled || typeof window === "undefined") return;
  pointerInstalled = true;
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    },
    { passive: true },
  );
}

export { ThreeBoundary } from "./boundary";

/** 角丸の長方形（景品カード用）。UV は 0〜1 に正規化。 */
export function roundedRectGeometry(w: number, h: number, r: number, segments = 6) {
  const s = new THREE.Shape();
  const x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, segments);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - x) / w;
    uv[i * 2 + 1] = (pos.getY(i) - y) / h;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** 景品画像（SVG・WebP など）を高解像度でラスタライズしてテクスチャにする。 */
const textureCache = new Map<string, Promise<THREE.Texture>>();
export function loadCardTexture(url: string, w = 600, h = 800): Promise<THREE.Texture> {
  const key = `${url}|${w}x${h}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const p = new Promise<THREE.Texture>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      // cover で描画
      const s = Math.max(w / img.naturalWidth || w / 300, h / img.naturalHeight || h / 400);
      const dw = (img.naturalWidth || 300) * s,
        dh = (img.naturalHeight || 400) * s;
      g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      resolve(t);
    };
    img.onerror = reject;
    img.src = url;
  });
  textureCache.set(key, p);
  return p;
}

/** カード裏面（星の紋章）。 */
let backTex: THREE.CanvasTexture | null = null;
export function cardBackTexture() {
  if (backTex) return backTex;
  const c = document.createElement("canvas");
  c.width = 300;
  c.height = 400;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(150, 170, 10, 150, 200, 260);
  grd.addColorStop(0, "#2b2360");
  grd.addColorStop(1, "#0b1230");
  g.fillStyle = grd;
  g.fillRect(0, 0, 300, 400);
  g.strokeStyle = "rgba(216,185,118,0.55)";
  g.lineWidth = 2;
  g.strokeRect(14, 14, 272, 372);
  g.beginPath();
  g.arc(150, 200, 70, 0, Math.PI * 2);
  g.setLineDash([4, 7]);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = "#d8b976";
  g.beginPath();
  const star = (cx: number, cy: number, r: number) => {
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r * 0.25, cy - r * 0.25);
    g.lineTo(cx + r, cy);
    g.lineTo(cx + r * 0.25, cy + r * 0.25);
    g.lineTo(cx, cy + r);
    g.lineTo(cx - r * 0.25, cy + r * 0.25);
    g.lineTo(cx - r, cy);
    g.lineTo(cx - r * 0.25, cy - r * 0.25);
    g.closePath();
  };
  star(150, 200, 44);
  g.fill();
  backTex = new THREE.CanvasTexture(c);
  backTex.colorSpace = THREE.SRGBColorSpace;
  return backTex;
}

export const RARITY_FRAME: Record<string, string> = { SSR: "#e8c983", SR: "#a785f2", R: "#84d8f1", N: "#c9ced9" };
