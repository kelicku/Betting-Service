"use client";

/**
 * サイト全体の背景（Three.js）。
 * - 奥行きのある星空（シェーダーで瞬き、スクロールで層ごとに異なる速さで流れる）
 * - ゆっくり揺らめく星雲（fBm ノイズ）
 * - 漂う金と紫の光の粒、ときどき流れる流れ星
 * - マウスに合わせてわずかに視点が傾く
 * - ページを移動すると、星々がこちらへ流れ込む「ワープ」演出
 * タブ非表示時は描画を止め、描画解像度は控えめに抑える。
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { installPointer, pointer } from "./shared";

const state = { scroll: 0, warpStart: -10 };

// ── 星 ────────────────────────────────────────────────

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uScroll;
  uniform float uTravel;
  uniform float uWarp;
  uniform float uPR;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    // 奥行き方向にゆっくり前進し、通り過ぎた星は奥へ戻る（無限に続く星空）
    float depth = 4.0 + mod(-p.z - 4.0 - uTravel, 76.0);
    p.z = -depth;
    // スクロールで縦に流れる（手前ほど速い）。見える範囲で上下をつなぐ
    float span = depth * 1.5;
    p.y = mod(p.y * span + uScroll * (6.0 / depth) + span * 0.5, span) - span * 0.5;
    p.x *= depth * 2.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 1.8) + aPhase * 40.0);
    gl_PointSize = min(aSize * uPR * (52.0 / depth) * (0.65 + tw * 0.6) * (1.0 + uWarp * 2.0), 28.0 * uPR);
    // 近すぎる星・遠すぎる星はなめらかに消す
    vAlpha = tw * smoothstep(4.0, 9.0, depth) * (1.0 - smoothstep(60.0, 80.0, depth)) * (1.0 + uWarp);
    vColor = aColor;
  }
`;
const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    float glow = pow(core, 3.0);
    // 十字の光芒（明るい星ほど目立つ）
    float cross = max(0.0, 1.0 - abs(c.x) * 18.0) * max(0.0, 1.0 - abs(c.y) * 2.2)
                + max(0.0, 1.0 - abs(c.y) * 18.0) * max(0.0, 1.0 - abs(c.x) * 2.2);
    float a = (glow + cross * 0.18) * vAlpha * 0.8;
    gl_FragColor = vec4(vColor * (0.8 + glow), a);
  }
`;

function Stars({ count }: { count: number }) {
  const { gl } = useThree();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const palette = [new THREE.Color("#f7f4ff"), new THREE.Color("#f3dfb3"), new THREE.Color("#b5e8f7"), new THREE.Color("#c9b8f5")];
    for (let i = 0; i < count; i++) {
      // x, y は「視野に対する割合」、z は奥行き
      pos.set([(Math.random() - 0.5) * 1.2, Math.random() - 0.5, -(4 + Math.random() * 76)], i * 3);
      size[i] = Math.random() ** 4 * 5 + 1.0;
      phase[i] = Math.random();
      const c = palette[Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 3)];
      color.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    return g;
  }, [count]);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uScroll: { value: 0 }, uTravel: { value: 0 }, uWarp: { value: 0 }, uPR: { value: Math.min(gl.getPixelRatio(), 1.5) } }),
    [gl],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const w = warpAmount(t);
    uniforms.uTime.value = t;
    uniforms.uScroll.value += (state.scroll * 0.01 - uniforms.uScroll.value) * Math.min(1, dt * 6);
    uniforms.uTravel.value += dt * (0.25 + w * 60);
    uniforms.uWarp.value = w;
  });
  return (
    <points geometry={geo}>
      <shaderMaterial vertexShader={STAR_VERT} fragmentShader={STAR_FRAG} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function warpAmount(t: number) {
  const k = t - state.warpStart;
  if (k < 0 || k > 1.4) return 0;
  // 0.25 秒で立ち上がり、なめらかに減衰
  return k < 0.25 ? k / 0.25 : Math.pow(1 - (k - 0.25) / 1.15, 2);
}

// ── 星雲 ─────────────────────────────────────────────

const NEBULA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 uv = vUv * vec2(2.2, 1.4) + vec2(0.0, uScroll * 0.015);
    float t = uTime * 0.012;
    vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2, 1.3) - t));
    float n = fbm(uv + 2.2 * q + vec2(t * 0.7, -t));
    vec3 purple = vec3(0.30, 0.18, 0.62);
    vec3 blue = vec3(0.10, 0.30, 0.52);
    vec3 gold = vec3(0.62, 0.48, 0.24);
    vec3 col = mix(purple, blue, smoothstep(0.2, 0.8, q.x));
    col = mix(col, gold, smoothstep(0.62, 0.95, n) * 0.55);
    float a = smoothstep(0.38, 0.95, n) * 0.22;
    // 画面の縁ほど薄く
    float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
    gl_FragColor = vec4(col, a * (0.55 + 0.45 * edge));
  }
`;

function Nebula() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uScroll: { value: 0 } }), []);
  useFrame((s) => {
    uniforms.uTime.value = s.clock.elapsedTime;
    uniforms.uScroll.value = state.scroll * 0.01;
  });
  return (
    <mesh position={[0, 0, -90]}>
      <planeGeometry args={[260, 150]} />
      <shaderMaterial
        vertexShader="varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
        fragmentShader={NEBULA_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ── 漂う光の粒 ─────────────────────────────────────────

const DUST_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPR;
  varying float vAlpha;
  varying float vGold;
  void main() {
    vec3 p = position;
    float life = fract(uTime * (0.012 + aSeed * 0.02) + aSeed * 7.0);
    p.y += (life - 0.5) * 14.0;
    p.x += sin(uTime * 0.3 + aSeed * 20.0) * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (14.0 + aSeed * 26.0) * uPR / -mv.z;
    vAlpha = sin(life * 3.14159) * 0.55;
    vGold = step(0.35, aSeed);
  }
`;
const DUST_FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vGold;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 2.0) * vAlpha;
    vec3 col = mix(vec3(0.65, 0.55, 0.92), vec3(0.95, 0.87, 0.70), vGold);
    gl_FragColor = vec4(col, a);
  }
`;

function Dust({ count }: { count: number }) {
  const { gl } = useThree();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([(Math.random() - 0.5) * 16, (Math.random() - 0.5) * 8, -(3 + Math.random() * 8)], i * 3);
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e3);
    return g;
  }, [count]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPR: { value: Math.min(gl.getPixelRatio(), 1.5) } }), [gl]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((s) => {
    uniforms.uTime.value = s.clock.elapsedTime;
  });
  return (
    <points geometry={geo}>
      <shaderMaterial vertexShader={DUST_VERT} fragmentShader={DUST_FRAG} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

// ── 流れ星 ────────────────────────────────────────────

const METEOR_FRAG = /* glsl */ `
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float head = smoothstep(0.0, 1.0, vUv.x);
    float thin = 1.0 - abs(vUv.y - 0.5) * 2.0;
    float a = pow(head, 2.5) * pow(thin, 2.0) * uAlpha;
    gl_FragColor = vec4(vec3(1.0, 0.95, 0.85), a);
  }
`;

function ShootingStars() {
  const mesh = useRef<THREE.Mesh>(null);
  const m = useRef({ active: false, next: 4 + Math.random() * 6, t: 0, x: 0, y: 0, vx: 0, vy: 0, life: 1.2 });
  const uniforms = useMemo(() => ({ uAlpha: { value: 0 } }), []);
  useFrame((s, dt) => {
    const st = m.current;
    const el = mesh.current;
    if (!el) return;
    const t = s.clock.elapsedTime;
    if (!st.active && t > st.next) {
      st.active = true;
      st.t = 0;
      st.life = 0.9 + Math.random() * 0.6;
      st.x = (Math.random() - 0.2) * 40;
      st.y = 8 + Math.random() * 10;
      const ang = -Math.PI * (0.78 + Math.random() * 0.1);
      const sp = 38 + Math.random() * 18;
      st.vx = Math.cos(ang) * sp;
      st.vy = Math.sin(ang) * sp;
      el.rotation.z = Math.atan2(st.vy, st.vx);
    }
    if (st.active) {
      st.t += dt;
      st.x += st.vx * dt;
      st.y += st.vy * dt;
      el.position.set(st.x, st.y, -40);
      const p = st.t / st.life;
      uniforms.uAlpha.value = Math.sin(Math.min(p, 1) * Math.PI) * 0.9;
      if (p >= 1) {
        st.active = false;
        st.next = t + 7 + Math.random() * 10;
        uniforms.uAlpha.value = 0;
      }
    }
  });
  return (
    <mesh ref={mesh} position={[0, 100, -40]}>
      <planeGeometry args={[9, 0.12]} />
      <shaderMaterial
        vertexShader="varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
        fragmentShader={METEOR_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function CameraRig() {
  const { camera } = useThree();
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 2);
    camera.rotation.y += (-pointer.x * 0.035 - camera.rotation.y) * k;
    camera.rotation.x += (pointer.y * 0.025 - camera.rotation.x) * k;
  });
  return null;
}

function WarpOnNavigate() {
  const path = usePathname();
  const first = useRef(true);
  const { clock } = useThree();
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    state.warpStart = clock.elapsedTime;
  }, [path, clock]);
  return null;
}

export default function CelestialBackground() {
  const [visible, setVisible] = useState(true);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    installPointer();
    setSmall(window.innerWidth < 768);
    const onScroll = () => {
      state.scroll = window.scrollY;
    };
    const onVis = () => setVisible(!document.hidden);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 1.25]}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        camera={{ position: [0, 0, 0], fov: 60, near: 0.1, far: 200 }}
      >
        <Nebula />
        <Stars count={small ? 600 : 1100} />
        <Dust count={small ? 24 : 48} />
        <ShootingStars />
        <CameraRig />
        <WarpOnNavigate />
      </Canvas>
    </div>
  );
}
