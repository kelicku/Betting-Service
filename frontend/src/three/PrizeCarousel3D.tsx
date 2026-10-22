"use client";

/**
 * 「宝物の回廊」：景品カードが円環状に並び、ゆっくり回る 3D カルーセル。
 * ドラッグ（スワイプ）で回転、カードを押すとそのガチャのページへ移動する。
 * 正面のカードの情報は DOM 側（呼び出し元）に通知して文字で表示する（読み上げにも対応）。
 */

import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { makeGlowTexture } from "@/ceremony/textures";
import { RARITY_FRAME, RoomEnv, cardBackTexture, loadCardTexture, roundedRectGeometry, useActiveRender } from "./shared";

export type CarouselItem = { key: string; image: string | null; rarity: string; name: string; href: string };

const W = 1.5,
  H = 2;
const cardGeo = () => roundedRectGeometry(W, H, 0.1);
const frameGeo = () => roundedRectGeometry(W + 0.08, H + 0.08, 0.13);

function Card({ item, angle, radius, onPick, isFront }: { item: CarouselItem; angle: number; radius: number; onPick: () => void; isFront: boolean }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [hover, setHover] = useState(false);
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(cardGeo, []);
  const fgeo = useMemo(frameGeo, []);
  useEffect(() => {
    let alive = true;
    if (item.image) loadCardTexture(item.image).then((t) => alive && setTex(t)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.image]);
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
    const target = hover || isFront ? 1.08 : 1;
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, target, Math.min(1, dt * 6)));
    g.position.y = Math.sin(s.clock.elapsedTime * 0.9 + angle * 3) * 0.06;
  });
  const color = RARITY_FRAME[item.rarity] ?? RARITY_FRAME.N;
  return (
    <group position={[Math.sin(angle) * radius, 0, Math.cos(angle) * radius]} rotation={[0, angle, 0]}>
      <group
        ref={group}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHover(true);
          window.dispatchEvent(new CustomEvent("hf-cursor", { detail: { hover: true } }));
        }}
        onPointerOut={() => {
          setHover(false);
          window.dispatchEvent(new CustomEvent("hf-cursor", { detail: { hover: false } }));
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onPick();
        }}
      >
        {/* 金属の縁取り（レアリティの色） */}
        <mesh geometry={fgeo} position={[0, 0, -0.012]}>
          <meshStandardMaterial color={color} metalness={1} roughness={0.25} emissive={color} emissiveIntensity={hover || isFront ? 0.35 : 0.12} side={THREE.DoubleSide} />
        </mesh>
        <mesh geometry={geo}>
          {tex ? <meshBasicMaterial key="tex" map={tex} color="#ffffff" toneMapped={false} /> : <meshBasicMaterial key="plain" color="#1a1f45" />}
        </mesh>
        <mesh geometry={geo} position={[0, 0, -0.024]} rotation={[0, Math.PI, 0]}>
          <meshBasicMaterial map={cardBackTexture()} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Ring({ items, onFront, onPick, spin }: { items: CarouselItem[]; onFront: (i: number) => void; onPick: (i: number) => void; spin: React.MutableRefObject<{ vel: number; drag: boolean }> }) {
  const group = useRef<THREE.Group>(null);
  const n = items.length;
  const radius = Math.max(3.2, (n * (W + 0.5)) / (Math.PI * 2));
  const [front, setFront] = useState(0);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const sp = spin.current;
    if (!sp.drag) sp.vel += (-0.12 - sp.vel) * Math.min(1, dt * 0.8); // 何もしないときはゆっくり自動回転
    g.rotation.y += sp.vel * dt;
    // 正面（カメラ側）に最も近いカード
    const step = (Math.PI * 2) / n;
    const idx = ((Math.round(-g.rotation.y / step) % n) + n) % n;
    if (idx !== front) {
      setFront(idx);
      onFront(idx);
    }
  });
  return (
    <group ref={group}>
      {items.map((it, i) => (
        <Card key={it.key} item={it} angle={(i / n) * Math.PI * 2} radius={radius} isFront={i === front} onPick={() => onPick(i)} />
      ))}
    </group>
  );
}

function FloorGlow() {
  const tex = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, -1.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12, 12]} />
      <meshBasicMaterial map={tex} color="#7654c8" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

export default function PrizeCarousel3D({ items, onFront, onPick }: { items: CarouselItem[]; onFront: (i: number) => void; onPick: (i: number) => void }) {
  const { ref, active } = useActiveRender<HTMLDivElement>();
  const spin = useRef({ vel: -0.12, drag: false });
  const drag = useRef<{ x: number; moved: number } | null>(null);
  const n = items.length;
  const radius = Math.max(3.2, (n * (W + 0.5)) / (Math.PI * 2));
  return (
    <div
      ref={ref}
      className="h-full w-full touch-pan-y select-none"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, moved: 0 };
        spin.current.drag = true;
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        d.x = e.clientX;
        d.moved += Math.abs(dx);
        spin.current.vel = dx * 0.25;
      }}
      onPointerUp={() => {
        spin.current.drag = false;
        setTimeout(() => (drag.current = null), 0);
      }}
      onPointerLeave={() => {
        spin.current.drag = false;
        drag.current = null;
      }}
    >
      <Canvas
        frameloop={active ? "always" : "never"}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0.55, radius + 4.4], fov: 38 }}
        onCreated={({ camera }) => camera.lookAt(0, 0, radius - 1)}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 6]} intensity={1.2} />
        <RoomEnv />
        <Ring
          items={items}
          spin={spin}
          onFront={onFront}
          onPick={(i) => {
            // ドラッグ中の誤タップは無視
            if (drag.current && drag.current.moved > 8) return;
            onPick(i);
          }}
        />
        <FloorGlow />
      </Canvas>
    </div>
  );
}
