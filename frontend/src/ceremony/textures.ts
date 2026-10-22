import * as THREE from "three";

/** 魔法陣のテクスチャを Canvas に描画する（外部画像に依存しない）。 */
export function makeMagicCircleTexture(size = 1024, variant: "main" | "inner" | "grand" = "main"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const R = size / 2;
  g.translate(R, R);
  g.strokeStyle = "#fff";
  g.fillStyle = "#fff";
  g.lineCap = "round";

  const ring = (r: number, w: number, dash?: number[]) => {
    g.lineWidth = w;
    g.setLineDash(dash ?? []);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  };
  const polygon = (n: number, r: number, step: number, w: number, rot = -Math.PI / 2) => {
    g.lineWidth = w;
    g.setLineDash([]);
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = rot + ((i * step) % n) * ((Math.PI * 2) / n);
      const x = Math.cos(a) * r,
        y = Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
  // 疑似ルーン文字：決定的な乱数で短いストロークを組み合わせる
  let seed = variant === "grand" ? 7 : variant === "inner" ? 3 : 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const runeBand = (r: number, count: number, h: number) => {
    g.setLineDash([]);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      g.save();
      g.rotate(a);
      g.translate(0, -r);
      g.lineWidth = size / 700;
      g.beginPath();
      const strokes = 2 + Math.floor(rand() * 3);
      for (let s = 0; s < strokes; s++) {
        const x1 = (rand() - 0.5) * h * 0.7,
          y1 = (rand() - 0.5) * h,
          x2 = (rand() - 0.5) * h * 0.7,
          y2 = (rand() - 0.5) * h;
        g.moveTo(x1, y1);
        if (rand() < 0.4) g.quadraticCurveTo(0, 0, x2, y2);
        else g.lineTo(x2, y2);
      }
      if (rand() < 0.3) {
        g.moveTo(h * 0.15, 0);
        g.arc(0, 0, h * 0.15, 0, Math.PI * 2);
      }
      g.stroke();
      g.restore();
    }
  };

  if (variant === "inner") {
    ring(R * 0.96, size / 220);
    ring(R * 0.86, size / 500, [size / 90, size / 60]);
    polygon(6, R * 0.86, 2, size / 300);
    polygon(6, R * 0.86, 2, size / 300, Math.PI / 2);
    ring(R * 0.42, size / 300);
    runeBand(R * 0.64, 18, R * 0.12);
  } else {
    ring(R * 0.985, size / 160);
    ring(R * 0.94, size / 500);
    runeBand(R * 0.875, variant === "grand" ? 64 : 48, R * 0.07);
    ring(R * 0.81, size / 400);
    ring(R * 0.79, size / 700, [size / 200, size / 120]);
    polygon(8, R * 0.79, 3, size / 350);
    polygon(4, R * 0.79, 1, size / 500);
    polygon(4, R * 0.79, 1, size / 500, -Math.PI / 4);
    ring(R * 0.56, size / 300);
    runeBand(R * 0.5, 24, R * 0.06);
    ring(R * 0.44, size / 600);
    polygon(5, R * 0.44, 2, size / 400);
    ring(R * 0.16, size / 300);
    // 小さな星
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * R * 0.79,
        y = Math.sin(a) * R * 0.79;
      g.beginPath();
      g.arc(x, y, size / 90, 0, Math.PI * 2);
      g.fill();
    }
    if (variant === "grand") {
      ring(R * 0.68, size / 600, [size / 300, size / 300]);
      polygon(12, R * 0.68, 5, size / 600);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 柔らかい光の円（フレア・発光用）。 */
export function makeGlowTexture(size = 256): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.2, "rgba(255,255,255,0.65)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.15)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 光芒（放射状の光の筋）。 */
export function makeRaysTexture(size = 512, rays = 18): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.translate(size / 2, size / 2);
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const w = 0.03 + (i % 3) * 0.02;
    const grd = g.createLinearGradient(0, 0, Math.cos(a) * size * 0.5, Math.sin(a) * size * 0.5);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, size * 0.5, a - w, a + w);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
