"use client";

/**
 * ガチャ演出の 3D シーン（Three.js / React Three Fiber）。
 *
 * 第1段階 魔法陣の出現 → 第2段階 エネルギーの集中 → 第3段階 宝箱の出現 → 第4段階 開封と光の拡散
 * のタイムラインを GSAP で制御する。抽選結果はこのシーンが再生される前にサーバーで確定しており、
 * シーンは結果のレアリティ（光の色）を表現するだけで、結果そのものには関与しない。
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Rarity } from "@/lib/types";
import { makeGlowTexture, makeMagicCircleTexture, makeRaysTexture } from "./textures";

export type CeremonyVariant = "normal" | "multi" | "lastone";

export interface CeremonyHandle {
  skip: () => void;
}

interface Props {
  rarity: Rarity;
  variant: CeremonyVariant;
  quality: "high" | "low";
  onReveal: () => void;
  onDone: () => void;
  control?: React.MutableRefObject<CeremonyHandle | null>;
}

const RARITY_COLOR: Record<Rarity, string> = {
  N: "#dfe5f2",
  R: "#7fd6f5",
  SR: "#b48cff",
  SSR: "#ffd98a",
};

/** タイムラインが書き換え、毎フレーム読み取られる演出パラメータ。 */
type Anim = {
  circle: number; // 魔法陣の出現 0→1
  glow: number; // 魔法陣の輝き
  gather: number; // 粒子の集中 0→1
  chest: number; // 宝箱の出現 0→1
  spin: number; // 宝箱の回転量
  leak: number; // 隙間から漏れる光
  open: number; // 蓋の開き 0→1
  burst: number; // 粒子の拡散 0→1
  flash: number; // 閃光
  pillar: number; // 光の柱（ラストワン）
  shake: number; // カメラの揺れ
  tint: number; // 白金→レアリティ色への遷移
};

function useAnim(): React.MutableRefObject<Anim> {
  return useRef<Anim>({ circle: 0, glow: 0, gather: 0, chest: 0, spin: 0, leak: 0, open: 0, burst: 0, flash: 0, pillar: 0, shake: 0, tint: 0 });
}

// ── 魔法陣 ─────────────────────────────────────────────

function MagicCircles({ anim, color, grand }: { anim: React.MutableRefObject<Anim>; color: THREE.Color; grand: boolean }) {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const back = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => makeMagicCircleTexture(1024, grand ? "grand" : "main"), [grand]);
  const texInner = useMemo(() => makeMagicCircleTexture(512, "inner"), []);
  const base = useMemo(() => new THREE.Color(grand ? "#ffd98a" : "#e9d4a0"), [grand]);
  const purple = useMemo(() => new THREE.Color("#9d7bff"), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  useEffect(() => () => {
    tex.dispose();
    texInner.dispose();
  }, [tex, texInner]);

  useFrame((_, dt) => {
    const a = anim.current;
    const s = 0.2 + 0.8 * THREE.MathUtils.smoothstep(a.circle, 0, 1);
    const speed = 0.15 + a.gather * 1.4 + a.glow * 0.4;
    if (outer.current) {
      outer.current.rotation.z += dt * speed * 0.5;
      outer.current.scale.setScalar(s * (grand ? 1.25 : 1));
      const m = outer.current.material as THREE.MeshBasicMaterial;
      tmp.copy(base).lerp(color, a.tint);
      m.color.copy(tmp).multiplyScalar(0.6 + a.glow * 1.6);
      m.opacity = a.circle * (1 - a.burst * 0.6);
    }
    if (inner.current) {
      inner.current.rotation.z -= dt * speed * 0.9;
      inner.current.scale.setScalar(s * 0.55 * (grand ? 1.2 : 1));
      const m = inner.current.material as THREE.MeshBasicMaterial;
      tmp.copy(purple).lerp(color, a.tint);
      m.color.copy(tmp).multiplyScalar(0.5 + a.glow * 1.4);
      m.opacity = a.circle * (1 - a.burst * 0.7);
    }
    if (back.current) {
      back.current.rotation.z += dt * speed * 0.25;
      back.current.scale.setScalar(s * 1.6);
      const m = back.current.material as THREE.MeshBasicMaterial;
      m.opacity = a.circle * 0.35 * (1 - a.burst * 0.5);
      m.color.copy(base).lerp(color, a.tint).multiplyScalar(0.5 + a.glow);
    }
  });

  const mat = (t: THREE.Texture) => (
    <meshBasicMaterial map={t} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
  );
  return (
    <group position={[0, -1.15, 0]} rotation={[-Math.PI / 2.35, 0, 0]}>
      <mesh ref={outer}>
        <planeGeometry args={[5.2, 5.2]} />
        {mat(tex)}
      </mesh>
      <mesh ref={inner} position={[0, 0, 0.02]}>
        <planeGeometry args={[5.2, 5.2]} />
        {mat(texInner)}
      </mesh>
      {/* 背面に大きく薄い魔法陣を立てて奥行きを出す */}
      <mesh ref={back} position={[0, 4.5, -1.6]} rotation={[Math.PI / 2.35, 0, 0]}>
        <planeGeometry args={[5.2, 5.2]} />
        {mat(tex)}
      </mesh>
    </group>
  );
}

// ── 光の粒子：周囲から集まり、開封時に広がる ────────────────

const PARTICLE_VERT = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aBurst;
  attribute float aSeed;
  uniform float uGather;
  uniform float uBurst;
  uniform float uTime;
  uniform float uSize;
  varying float vAlpha;
  varying float vMix;
  void main() {
    float g = smoothstep(0.0, 1.0, clamp(uGather * 1.25 - aSeed * 0.25, 0.0, 1.0));
    // 渦を巻きながら中心へ
    float ang = g * 4.0 * (aSeed - 0.5) + uTime * 0.2 * (1.0 - g);
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec3 start = aStart;
    start.xz = rot * start.xz;
    vec3 core = vec3(0.0, 0.0, 0.0) + aBurst * 0.05;
    vec3 p = mix(start, core, g);
    // 開封で外側へ広がる
    float b = clamp(uBurst * 1.1 - aSeed * 0.1, 0.0, 1.0);
    p = mix(p, aBurst * (2.5 + aSeed * 4.0), 1.0 - pow(1.0 - b, 3.0));
    p.y += sin(uTime * 1.5 + aSeed * 30.0) * 0.06 * (1.0 - g);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.6 + 0.4 * sin(uTime * 6.0 + aSeed * 50.0);
    gl_PointSize = uSize * (0.5 + aSeed) * twinkle * (1.0 + g * 0.6) / -mv.z;
    vAlpha = (0.25 + 0.75 * max(g, b)) * (1.0 - smoothstep(0.75, 1.0, b));
    vMix = aSeed;
  }
`;
const PARTICLE_FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vAlpha;
  varying float vMix;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 1.6);
    vec3 col = mix(uColorA, uColorB, step(0.62, vMix));
    gl_FragColor = vec4(col * (1.0 + a), a * vAlpha);
  }
`;

function Particles({ anim, color, count }: { anim: React.MutableRefObject<Anim>; color: THREE.Color; count: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const start = new Float32Array(count * 3);
    const burst = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 3.2 + Math.random() * 3.5;
      const th = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.4) * 3.5;
      start.set([Math.cos(th) * r, y, Math.sin(th) * r - 1], i * 3);
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.8 + 0.1;
      burst.set([v.x, v.y, v.z], i * 3);
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
    g.setAttribute("aBurst", new THREE.BufferAttribute(burst, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
    return g;
  }, [count]);
  const uniforms = useMemo(
    () => ({
      uGather: { value: 0 },
      uBurst: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 70 },
      uColorA: { value: new THREE.Color("#ffe6a8") },
      uColorB: { value: new THREE.Color("#a58bea") },
    }),
    [],
  );
  const gold = useMemo(() => new THREE.Color("#ffe6a8"), []);
  const purple = useMemo(() => new THREE.Color("#a58bea"), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((state) => {
    const a = anim.current;
    uniforms.uGather.value = a.gather;
    uniforms.uBurst.value = a.burst;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uColorA.value.copy(gold).lerp(color, a.tint * 0.8);
    uniforms.uColorB.value.copy(purple).lerp(color, a.tint);
  });
  return (
    <points geometry={geo} position={[0, 0.2, 0]}>
      <shaderMaterial
        ref={mat}
        vertexShader={PARTICLE_VERT}
        fragmentShader={PARTICLE_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── 宝箱 ─────────────────────────────────────────────

function TreasureChest({ anim, color, special, quality }: { anim: React.MutableRefObject<Anim>; color: THREE.Color; special: boolean; quality: "high" | "low" }) {
  const group = useRef<THREE.Group>(null);
  const lid = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const core = useRef<THREE.Mesh>(null);
  const leaks = useRef<THREE.Group>(null);
  const glowTex = useMemo(() => makeGlowTexture(), []);
  const W = 1.5,
    H = 0.82,
    D = 1.0;

  const glass = useMemo(() => {
    if (quality === "low") {
      return new THREE.MeshStandardMaterial({ color: special ? "#6b4a9c" : "#3b4d9a", transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.1 });
    }
    return new THREE.MeshPhysicalMaterial({
      color: special ? "#ffe9c4" : "#cfd8ff",
      transmission: 0.92,
      thickness: 0.6,
      roughness: 0.06,
      ior: 1.5,
      iridescence: 0.6,
      iridescenceIOR: 1.3,
      clearcoat: 1,
      attenuationColor: new THREE.Color(special ? "#d8a24a" : "#7654c8"),
      attenuationDistance: 1.6,
      envMapIntensity: 1.4,
    });
  }, [quality, special]);
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e2bf72", metalness: 1, roughness: 0.22, envMapIntensity: 1.6 }), []);
  useEffect(
    () => () => {
      glass.dispose();
      gold.dispose();
      glowTex.dispose();
    },
    [glass, gold, glowTex],
  );

  // 金の縁取り（各辺）
  const trims = useMemo(() => {
    const t = 0.06;
    const out: { p: [number, number, number]; s: [number, number, number] }[] = [];
    for (const y of [-H / 2, H / 2]) {
      for (const z of [-D / 2, D / 2]) out.push({ p: [0, y, z], s: [W + t, t, t] });
      for (const x of [-W / 2, W / 2]) out.push({ p: [x, y, 0], s: [t, t, D + t] });
    }
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) out.push({ p: [x, 0, z], s: [t, H, t] });
    out.push({ p: [0, 0, D / 2 + 0.01], s: [0.22, H * 0.9, 0.04] }); // 正面の帯
    return out;
  }, []);

  useFrame((state, dt) => {
    const a = anim.current;
    if (!group.current) return;
    const e = THREE.MathUtils.smoothstep(a.chest, 0, 1);
    group.current.visible = a.chest > 0.001;
    group.current.position.y = -1.6 + e * 1.45 + Math.sin(state.clock.elapsedTime * 1.4) * 0.04 * e;
    group.current.scale.setScalar(0.35 + e * 0.65);
    group.current.rotation.y = a.spin + Math.sin(state.clock.elapsedTime * 0.7) * 0.08;
    group.current.rotation.x = 0.18 - a.open * 0.12;
    if (lid.current) lid.current.rotation.x = -a.open * 1.9;
    const lit = a.leak * 0.7 + a.open * 1.6;
    if (light.current) {
      light.current.intensity = 2 + lit * 30;
      light.current.color.copy(color);
    }
    if (core.current) {
      core.current.scale.setScalar(0.6 + lit * 1.8 + a.flash * 4);
      (core.current.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.15 + lit * 0.7);
      (core.current.material as THREE.SpriteMaterial).color.copy(color);
    }
    if (leaks.current) {
      leaks.current.rotation.y += dt * 0.6;
      leaks.current.children.forEach((c, i) => {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = a.leak * (0.35 + 0.25 * Math.sin(state.clock.elapsedTime * 3 + i)) * (1 - a.open * 0.6);
        m.color.copy(color);
        c.scale.y = 0.6 + a.leak * 1.2 + a.open * 2;
      });
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh material={glass} castShadow={false}>
        <boxGeometry args={[W, H, D]} />
      </mesh>
      {trims.map((t, i) => (
        <mesh key={i} position={t.p} material={gold}>
          <boxGeometry args={t.s} />
        </mesh>
      ))}
      {/* 鍵穴の飾り */}
      <mesh position={[0, 0.12, D / 2 + 0.045]} material={gold}>
        <cylinderGeometry args={[0.09, 0.09, 0.03, 24]} />
      </mesh>
      {/* 蓋：背面の辺を軸に開く */}
      <group ref={lid} position={[0, H / 2, -D / 2]}>
        <group position={[0, 0, D / 2]}>
          <mesh material={glass} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[D / 2, D / 2, W, 32, 1, false, 0, Math.PI]} />
          </mesh>
          {[-W / 2, 0, W / 2].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={gold}>
              <torusGeometry args={[D / 2, 0.035, 8, 32, Math.PI]} />
            </mesh>
          ))}
          <mesh position={[0, D / 2, 0]} material={gold}>
            <octahedronGeometry args={[0.13]} />
          </mesh>
        </group>
      </group>
      {/* 内部の光 */}
      <pointLight ref={light} position={[0, 0.1, 0]} distance={6} decay={2} intensity={2} />
      <sprite ref={core} position={[0, 0.15, 0]}>
        <spriteMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      {/* 隙間から漏れる光の筋 */}
      <group ref={leaks} position={[0, H / 2, 0]}>
        {Array.from({ length: 7 }).map((_, i) => (
          <mesh key={i} rotation={[0, (i / 7) * Math.PI, (i % 2 ? 1 : -1) * 0.12]} position={[0, 0.9, 0]}>
            <planeGeometry args={[0.07 + (i % 3) * 0.04, 1.8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ── 閃光・光芒・光の柱 ───────────────────────────────────

function Flash({ anim, color }: { anim: React.MutableRefObject<Anim>; color: THREE.Color }) {
  const rays = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const raysTex = useMemo(() => makeRaysTexture(), []);
  const glowTex = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => {
    raysTex.dispose();
    glowTex.dispose();
  }, [raysTex, glowTex]);
  useFrame((_, dt) => {
    const a = anim.current;
    if (rays.current) {
      rays.current.rotation.z += dt * 0.25;
      rays.current.scale.setScalar(1 + a.burst * 5);
      const m = rays.current.material as THREE.MeshBasicMaterial;
      m.opacity = a.burst > 0 ? Math.max(0, 0.9 - a.burst * 0.5) * Math.min(1, a.burst * 6) : 0;
      m.color.copy(color);
    }
    if (glow.current) {
      glow.current.scale.setScalar(0.1 + a.flash * 14);
      const m = glow.current.material as THREE.SpriteMaterial;
      m.opacity = a.flash;
      m.color.copy(color).lerp(new THREE.Color("#ffffff"), 0.5);
    }
  });
  return (
    <group position={[0, 0.1, 0.4]}>
      <mesh ref={rays}>
        <planeGeometry args={[3, 3]} />
        <meshBasicMaterial map={raysTex} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <sprite ref={glow}>
        <spriteMaterial map={glowTex} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </group>
  );
}

const PILLAR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const PILLAR_FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float edge = pow(sin(vUv.x * 3.14159), 2.0);
    float fadeY = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float stripes = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 6.0 + vUv.x * 10.0);
    float a = edge * fadeY * stripes * uOpacity;
    gl_FragColor = vec4(uColor * (1.2 + a), a);
  }
`;

function LightPillar({ anim }: { anim: React.MutableRefObject<Anim> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(() => ({ uOpacity: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color("#ffe2a0") } }), []);
  useFrame((s) => {
    const a = anim.current;
    uniforms.uOpacity.value = a.pillar;
    uniforms.uTime.value = s.clock.elapsedTime;
    if (mesh.current) mesh.current.scale.set(0.4 + a.pillar * 0.8, 1, 0.4 + a.pillar * 0.8);
  });
  return (
    <mesh ref={mesh} position={[0, 3, -0.2]}>
      <cylinderGeometry args={[1.1, 1.4, 9, 48, 1, true]} />
      <shaderMaterial vertexShader={PILLAR_VERT} fragmentShader={PILLAR_FRAG} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── カメラと環境 ───────────────────────────────────────

function Rig({ anim }: { anim: React.MutableRefObject<Anim> }) {
  const { camera, gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      env.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  useFrame((state) => {
    const a = anim.current;
    const t = state.clock.elapsedTime;
    const k = a.shake * 0.05;
    camera.position.set(Math.sin(t * 37) * k, 0.55 + Math.cos(t * 41) * k, 6.2 - a.chest * 0.8 - a.open * 0.4);
    camera.lookAt(0, -0.05, 0);
  });
  return null;
}

// ── タイムライン ─────────────────────────────────────────

function Timeline({
  anim,
  variant,
  rarity,
  onReveal,
  onDone,
  handleRef,
}: {
  anim: React.MutableRefObject<Anim>;
  variant: CeremonyVariant;
  rarity: Rarity;
  onReveal: () => void;
  onDone: () => void;
  handleRef: React.MutableRefObject<gsap.core.Timeline | null>;
}) {
  const cb = useRef({ onReveal, onDone });
  cb.current = { onReveal, onDone };
  useEffect(() => {
    const a = anim.current;
    const rare = rarity === "SSR" || rarity === "SR";
    const tl = gsap.timeline({ onComplete: () => cb.current.onDone() });
    const slow = variant === "lastone" ? 1.35 : variant === "multi" ? 0.75 : 1;
    // 第1段階：魔法陣の出現
    tl.to(a, { circle: 1, duration: 1.0 * slow, ease: "power2.out" });
    tl.to(a, { glow: 0.4, duration: 0.8 * slow, ease: "sine.inOut" }, "<0.3");
    // 第2段階：エネルギーの集中
    tl.to(a, { gather: 1, duration: 1.5 * slow, ease: "power2.inOut" }, ">-0.2");
    tl.to(a, { glow: 1, shake: rare ? 1 : 0.5, duration: 1.5 * slow, ease: "power1.in" }, "<");
    // 期待感：レアリティの色が少しずつ滲む
    tl.to(a, { tint: rare ? 0.6 : 0.3, duration: 0.9 * slow }, "<0.7");
    if (variant === "lastone") tl.to(a, { pillar: 1, duration: 1.4, ease: "power2.out" }, "<");
    // 第3段階：宝箱の出現
    tl.to(a, { chest: 1, duration: 1.2 * slow, ease: "back.out(1.4)" }, ">-0.3");
    tl.to(a, { spin: Math.PI * 2 + 0.35, duration: 1.8 * slow, ease: "power3.out" }, "<");
    tl.to(a, { leak: 1, shake: 0.2, duration: 1.0 * slow, ease: "power2.in" }, "<0.5");
    // 第4段階：開封・光の拡散
    tl.to(a, { open: 1, duration: 0.55, ease: "back.out(2)" }, ">");
    tl.to(a, { tint: 1, duration: 0.3 }, "<");
    tl.to(a, { flash: 1, duration: 0.18, ease: "power4.out" }, "<0.15");
    tl.call(() => cb.current.onReveal(), [], "<0.05");
    tl.to(a, { burst: 1, duration: 1.8, ease: "power2.out" }, "<");
    tl.to(a, { flash: 0, shake: 0, duration: 0.9, ease: "power2.out" }, "<0.25");
    tl.to(a, { circle: 0.35, glow: 0.4, duration: 1.0 }, "<0.3");
    handleRef.current = tl;
    return () => {
      tl.kill();
    };
  }, [anim, variant, rarity, handleRef]);
  return null;
}

export default function CeremonyScene({ rarity, variant, quality, onReveal, onDone, control }: Props) {
  const anim = useAnim();
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const color = useMemo(() => new THREE.Color(variant === "lastone" ? RARITY_COLOR.SSR : RARITY_COLOR[rarity]), [rarity, variant]);
  useEffect(() => {
    if (!control) return;
    control.current = {
      skip: () => {
        const tl = tlRef.current;
        if (tl && tl.progress() < 1) tl.progress(1);
      },
    };
    return () => {
      control.current = null;
    };
  }, [control]);
  return (
    <Canvas
      dpr={quality === "high" ? [1, 1.75] : [1, 1.25]}
      gl={{ antialias: quality === "high", alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.55, 6.2], fov: 45 }}
      style={{ position: "absolute", inset: 0 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
      }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} color="#fff1d6" />
      <directionalLight position={[-4, 2, -3]} intensity={0.6} color="#9d7bff" />
      <Rig anim={anim} />
      <MagicCircles anim={anim} color={color} grand={variant === "lastone"} />
      <Particles anim={anim} color={color} count={quality === "high" ? (variant === "lastone" ? 2400 : 1600) : 600} />
      <TreasureChest anim={anim} color={color} special={variant === "lastone"} quality={quality} />
      <Flash anim={anim} color={color} />
      {variant === "lastone" && <LightPillar anim={anim} />}
      <Timeline anim={anim} variant={variant} rarity={rarity} onReveal={onReveal} onDone={onDone} handleRef={tlRef} />
    </Canvas>
  );
}
