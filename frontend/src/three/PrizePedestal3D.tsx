"use client";

/** 特別な景品（ラストワン賞など）を飾る台座：魔法陣の上でカードが浮かび、金の輪が巡る。 */

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { makeGlowTexture, makeMagicCircleTexture } from "@/ceremony/textures";
import { RARITY_FRAME, RoomEnv, cardBackTexture, installPointer, loadCardTexture, pointer, roundedRectGeometry, useActiveRender } from "./shared";

function FloatingCard({ image, rarity }: { image: string | null; rarity: string }) {
  const group = useRef<THREE.Group>(null);
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const geo = useMemo(() => roundedRectGeometry(1.5, 2, 0.1), []);
  const fgeo = useMemo(() => roundedRectGeometry(1.58, 2.08, 0.13), []);
  useEffect(() => {
    let alive = true;
    if (image) loadCardTexture(image).then((t) => alive && setTex(t)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [image]);
  useEffect(
    () => () => {
      geo.dispose();
      fgeo.dispose();
    },
    [geo, fgeo],
  );
  useFrame((s, dt) => {
    const g = group.current;
    if (!g) return;
    const t = s.clock.elapsedTime;
    g.position.y = 0.25 + Math.sin(t * 1.1) * 0.1;
    const target = Math.sin(t * 0.5) * 0.45 + pointer.x * 0.3;
    g.rotation.y += (target - g.rotation.y) * Math.min(1, dt * 2);
    g.rotation.x += (-pointer.y * 0.12 - g.rotation.x) * Math.min(1, dt * 2);
  });
  const color = RARITY_FRAME[rarity] ?? RARITY_FRAME.SSR;
  return (
    <group ref={group}>
      <mesh geometry={fgeo} position={[0, 0, -0.012]}>
        <meshStandardMaterial color={color} metalness={1} roughness={0.22} emissive={color} emissiveIntensity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo}>{tex ? <meshBasicMaterial key="tex" map={tex} color="#ffffff" toneMapped={false} /> : <meshBasicMaterial key="plain" color="#1a1f45" />}</mesh>
      <mesh geometry={geo} position={[0, 0, -0.024]} rotation={[0, Math.PI, 0]}>
        <meshBasicMaterial map={cardBackTexture()} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Halo() {
  const rings = useRef<THREE.Group>(null);
  const circle = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => makeMagicCircleTexture(1024, "grand"), []);
  const glow = useMemo(() => makeGlowTexture(), []);
  useEffect(
    () => () => {
      tex.dispose();
      glow.dispose();
    },
    [tex, glow],
  );
  useFrame((_, dt) => {
    if (rings.current) {
      rings.current.children.forEach((c, i) => {
        c.rotation.z += dt * (i % 2 ? -0.4 : 0.3);
      });
    }
    if (circle.current) circle.current.rotation.z += dt * 0.15;
  });
  return (
    <>
      <mesh ref={circle} position={[0, -1.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.2, 4.2]} />
        <meshBasicMaterial map={tex} color="#e8c983" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <sprite position={[0, 0.2, -0.6]} scale={[4.5, 4.5, 1]}>
        <spriteMaterial map={glow} color="#ffd98a" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <group ref={rings} position={[0, 0.25, 0]}>
        {[
          [1.55, 1.25, 0.3],
          [1.75, -0.5, 1.1],
        ].map(([r, tx, tz], i) => (
          <group key={i} rotation={[tx, 0, tz]}>
            <mesh>
              <torusGeometry args={[r, 0.012, 8, 160]} />
              <meshStandardMaterial color="#e2bf72" metalness={1} roughness={0.25} />
            </mesh>
            <mesh position={[r, 0, 0]}>
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshBasicMaterial color="#fff1c9" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </>
  );
}

export default function PrizePedestal3D({ image, rarity = "SSR" }: { image: string | null; rarity?: string }) {
  const { ref, active } = useActiveRender<HTMLDivElement>();
  useEffect(() => installPointer(), []);
  return (
    <div ref={ref} className="h-full w-full" aria-hidden>
      <Canvas frameloop={active ? "always" : "never"} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} camera={{ position: [0, 0.4, 5.2], fov: 42 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 4, 5]} intensity={1.3} color="#fff1d6" />
        <RoomEnv />
        <FloatingCard image={image} rarity={rarity} />
        <Halo />
      </Canvas>
    </div>
  );
}
