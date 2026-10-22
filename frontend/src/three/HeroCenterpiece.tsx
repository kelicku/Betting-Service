"use client";

/**
 * トップページの主役：宙に浮かぶ星の水晶と、それを囲む金の天球儀（アーミラリー）。
 * 水晶はガラスの物理ベース素材（透過・虹彩）、周囲を宝石が巡り、足元で魔法陣がゆっくり回る。
 * マウスに合わせて傾き、スクロールに合わせて回転する。
 */

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { makeGlowTexture, makeMagicCircleTexture } from "@/ceremony/textures";
import { RoomEnv, installPointer, pointer, useActiveRender } from "./shared";

const scroll = { y: 0 };
// 水晶に触れたときの「願い」の波動（時刻）と、ホバー状態
const wish = { t: -10, hover: false, pending: false };
const wishBoost = (now: number) => Math.exp(-Math.max(0, now - wish.t) * 1.6) * (now >= wish.t ? 1 : 0);

function Crystal() {
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Sprite>(null);
  const glowTex = useMemo(() => makeGlowTexture(), []);
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        transmission: 1,
        thickness: 1.4,
        roughness: 0.04,
        ior: 1.65,
        iridescence: 1,
        iridescenceIOR: 1.35,
        iridescenceThicknessRange: [120, 700],
        attenuationColor: new THREE.Color("#9a7cff"),
        attenuationDistance: 2.2,
        clearcoat: 1,
        envMapIntensity: 1.6,
        flatShading: true,
      }),
    [],
  );
  useEffect(
    () => () => {
      mat.dispose();
      glowTex.dispose();
    },
    [mat, glowTex],
  );
  const spin = useRef(0);
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    const b = wishBoost(t);
    spin.current += dt * (0.25 + b * 4);
    if (group.current) group.current.rotation.y = spin.current + scroll.y * 0.0015;
    if (inner.current) {
      inner.current.rotation.y = -t * 0.6;
      inner.current.scale.set(0.32 * (1 + b * 0.8), 0.55 * (1 + b * 0.8), 0.32 * (1 + b * 0.8));
    }
    if (glow.current) {
      const k = 1 + Math.sin(t * 1.6) * 0.08 + (wish.hover ? 0.18 : 0) + b * 1.4;
      glow.current.scale.setScalar(2.6 * k);
      (glow.current.material as THREE.SpriteMaterial).opacity = 0.55 + b * 0.4;
    }
  });
  return (
    <group ref={group}>
      <mesh
        material={mat}
        scale={[0.85, 1.45, 0.85]}
        onPointerOver={(e) => {
          e.stopPropagation();
          wish.hover = true;
          window.dispatchEvent(new CustomEvent("hf-cursor", { detail: { hover: true } }));
        }}
        onPointerOut={() => {
          wish.hover = false;
          window.dispatchEvent(new CustomEvent("hf-cursor", { detail: { hover: false } }));
        }}
        onClick={(e) => {
          e.stopPropagation();
          wish.pending = true; // 次のフレームで時刻を記録
        }}
      >
        <octahedronGeometry args={[1, 0]} />
      </mesh>
      {/* 水晶の芯で灯る光 */}
      <mesh ref={inner} scale={[0.32, 0.55, 0.32]}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#ffe9b8" transparent opacity={0.9} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <sprite ref={glow}>
        <spriteMaterial map={glowTex} color="#b89cff" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <pointLight color="#ffe2a8" intensity={12} distance={6} decay={2} />
    </group>
  );
}

function Armillary() {
  const rings = useRef<(THREE.Group | null)[]>([]);
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e2bf72", metalness: 1, roughness: 0.22, envMapIntensity: 1.5 }), []);
  useEffect(() => () => gold.dispose(), [gold]);
  const defs = useMemo(
    () => [
      { r: 1.95, tilt: [1.2, 0.2, 0], speed: 0.35, beads: 3 },
      { r: 2.2, tilt: [0.3, 0, 0.9], speed: -0.25, beads: 2 },
      { r: 2.45, tilt: [-0.6, 0.7, 0.2], speed: 0.18, beads: 4 },
    ],
    [],
  );
  useFrame((s, dt) => {
    const b = wishBoost(s.clock.elapsedTime);
    rings.current.forEach((g, i) => {
      if (g) g.rotation.z += dt * defs[i].speed * (1 + b * 6);
    });
  });
  return (
    <group>
      {defs.map((d, i) => (
        <group key={i} rotation={d.tilt as [number, number, number]}>
          <group ref={(el) => void (rings.current[i] = el)}>
            <mesh material={gold}>
              <torusGeometry args={[d.r, 0.016, 12, 200]} />
            </mesh>
            {/* 目盛り */}
            <mesh material={gold}>
              <torusGeometry args={[d.r - 0.07, 0.006, 6, 200]} />
            </mesh>
            {Array.from({ length: d.beads }).map((_, j) => {
              const a = (j / d.beads) * Math.PI * 2;
              return (
                <mesh key={j} position={[Math.cos(a) * d.r, Math.sin(a) * d.r, 0]}>
                  <sphereGeometry args={[0.055, 16, 16]} />
                  <meshBasicMaterial color={j % 2 ? "#c9b8ff" : "#fff1c9"} toneMapped={false} />
                </mesh>
              );
            })}
          </group>
        </group>
      ))}
    </group>
  );
}

function OrbitingGems() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const gems = useMemo(
    () => [
      { c: "#ffd98a", r: 3.1, s: 0.42, y: 0.4, size: 0.16 },
      { c: "#b48cff", r: 3.35, s: -0.3, y: -0.5, size: 0.13 },
      { c: "#84d8f1", r: 2.95, s: 0.55, y: 0.9, size: 0.11 },
      { c: "#f2b8d2", r: 3.5, s: 0.22, y: -0.1, size: 0.1 },
      { c: "#ffffff", r: 3.2, s: -0.48, y: 0.15, size: 0.09 },
    ],
    [],
  );
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const g = gems[i];
      const a = t * g.s + i * 1.3;
      m.position.set(Math.cos(a) * g.r, g.y + Math.sin(t * 0.8 + i) * 0.18, Math.sin(a) * g.r * 0.55);
      m.rotation.set(t * 0.9 + i, t * 1.2, 0);
    });
  });
  return (
    <>
      {gems.map((g, i) => (
        <mesh key={i} ref={(el) => void (refs.current[i] = el)}>
          <octahedronGeometry args={[g.size, 0]} />
          <meshStandardMaterial color={g.c} emissive={g.c} emissiveIntensity={0.6} metalness={0.2} roughness={0.15} flatShading />
        </mesh>
      ))}
    </>
  );
}

function FloorCircle() {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  const t1 = useMemo(() => makeMagicCircleTexture(1024, "main"), []);
  const t2 = useMemo(() => makeMagicCircleTexture(512, "inner"), []);
  useEffect(
    () => () => {
      t1.dispose();
      t2.dispose();
    },
    [t1, t2],
  );
  useFrame((_, dt) => {
    if (a.current) a.current.rotation.z += dt * 0.06;
    if (b.current) b.current.rotation.z -= dt * 0.12;
  });
  return (
    <group position={[0, -2.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={a}>
        <planeGeometry args={[6.4, 6.4]} />
        <meshBasicMaterial map={t1} color="#d8b976" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={b} position={[0, 0, 0.01]}>
        <planeGeometry args={[3.4, 3.4]} />
        <meshBasicMaterial map={t2} color="#a58bea" transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}

const SHAFT_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float edge = pow(sin(vUv.x * 3.14159), 3.0);
    float fade = smoothstep(0.0, 0.5, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
    float flicker = 0.8 + 0.2 * sin(uTime * 1.3 + vUv.x * 12.0);
    gl_FragColor = vec4(vec3(1.0, 0.9, 0.7), edge * fade * flicker * 0.16);
  }
`;

function LightShaft() {
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame((s) => {
    uniforms.uTime.value = s.clock.elapsedTime;
  });
  return (
    <mesh position={[0, 0.6, -0.3]}>
      <cylinderGeometry args={[0.35, 2.2, 7, 40, 1, true]} />
      <shaderMaterial
        vertexShader="varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
        fragmentShader={SHAFT_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

const RISE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float life = fract(uTime * (0.06 + aSeed * 0.08) + aSeed * 13.0);
    p.y = -2.3 + life * 5.0;
    float ang = uTime * 0.2 + aSeed * 6.283;
    p.x = cos(ang) * position.x;
    p.z = sin(ang) * position.x * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (30.0 + aSeed * 40.0) / -mv.z;
    vAlpha = sin(life * 3.14159);
  }
`;
const RISE_FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 2.2) * vAlpha;
    gl_FragColor = vec4(1.0, 0.88, 0.62, a);
  }
`;

function RisingMotes({ count }: { count: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([0.6 + Math.random() * 2.6, 0, 0], i * 3);
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    return g;
  }, [count]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((s) => {
    uniforms.uTime.value = s.clock.elapsedTime;
  });
  return (
    <points geometry={geo}>
      <shaderMaterial vertexShader={RISE_VERT} fragmentShader={RISE_FRAG} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Shockwave() {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (wish.pending) {
      wish.pending = false;
      wish.t = s.clock.elapsedTime;
    }
    const m = ring.current;
    if (!m) return;
    const k = s.clock.elapsedTime - wish.t;
    const on = k >= 0 && k < 1.4;
    m.visible = on;
    if (!on) return;
    const p = k / 1.4;
    m.scale.setScalar(0.5 + p * 4.5);
    (m.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.8;
  });
  return (
    <mesh ref={ring} visible={false} rotation={[-Math.PI / 2.2, 0, 0]}>
      <ringGeometry args={[0.95, 1, 96]} />
      <meshBasicMaterial color="#ffe6a8" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}

function Rig({ compact }: { compact: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((s, dt) => {
    const g = group.current;
    if (!g) return;
    const t = s.clock.elapsedTime;
    const k = Math.min(1, dt * 2.5);
    g.rotation.x += (-pointer.y * 0.18 + 0.08 - g.rotation.x) * k;
    g.rotation.y += (pointer.x * 0.35 - g.rotation.y) * k;
    g.position.y = Math.sin(t * 0.7) * 0.08;
  });
  return (
    <group ref={group} scale={compact ? 0.78 : 1}>
      <Crystal />
      <Shockwave />
      <Armillary />
      <OrbitingGems />
      <FloorCircle />
      <LightShaft />
      <RisingMotes count={compact ? 40 : 80} />
    </group>
  );
}

export default function HeroCenterpiece({ className }: { className?: string }) {
  const { ref, active } = useActiveRender<HTMLDivElement>();
  const compact = typeof window !== "undefined" && window.innerWidth < 640;
  useEffect(() => {
    installPointer();
    const onScroll = () => {
      scroll.y = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div ref={ref} className={className} aria-hidden>
      <Canvas
        frameloop={active ? "always" : "never"}
        dpr={compact ? [1, 1.5] : [1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0.35, 8.2], fov: 40 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 5]} intensity={1.2} color="#fff1d6" />
        <directionalLight position={[-5, 1, -3]} intensity={0.8} color="#9d7bff" />
        <RoomEnv />
        <Rig compact={compact} />
      </Canvas>
    </div>
  );
}
