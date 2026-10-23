"use client";

/** サイトの顔となるオリジナルキャラクター（宝箱に入った猫）。顔と吹き出しを表示する。 */

import Image from "next/image";
import { SITE } from "@/lib/site";
import { cx } from "./ui";

export function MascotFace({ className, bounce = false }: { className?: string; bounce?: boolean }) {
  return (
    <Image
      src={SITE.mascot.face}
      alt={SITE.mascot.name || "サイトのキャラクターの猫"}
      width={260}
      height={195}
      className={cx("h-auto select-none", bounce && "mascot-bounce", className)}
    />
  );
}

/** 吹き出し付き（空の一覧・読み込み中・結果画面などで使う） */
export function MascotSays({ children, className, size = "md" }: { children: React.ReactNode; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cx("flex items-end justify-center gap-2", className)}>
      <MascotFace className={size === "sm" ? "w-14" : "w-20"} />
      <p className="mascot-bubble relative mb-3 rounded-2xl bg-white px-3.5 py-2 font-round text-sm font-bold text-[#ff2f6e] shadow-[0_6px_16px_-8px_rgba(240,33,94,0.6)]">
        {children}
      </p>
    </div>
  );
}
