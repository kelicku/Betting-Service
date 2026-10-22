"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/lib/hooks";
import type { Me } from "@/lib/types";
import { Spinner } from "./ui";

/** 会員専用ページのガード（実際の権限チェックは API 側で行う）。 */
export function RequireAuth({ children, role }: { children: (me: Me) => React.ReactNode; role?: "staff" | "admin" }) {
  const { me, loading } = useMe();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, me, router, path]);
  if (loading || !me) return <Spinner />;
  if (role === "admin" && me.role !== "admin") return <Forbidden />;
  if (role === "staff" && me.role === "user") return <Forbidden />;
  return <>{children(me)}</>;
}

function Forbidden() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="font-serif text-xl text-gold-light">このページを表示する権限がありません。</p>
    </div>
  );
}

export function AuthShell({ title, en, children }: { title: string; en: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-md items-center px-4 py-10">
      <div className="glass-strong relative w-full overflow-hidden p-7 sm:p-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-amethyst/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-gold/15 blur-3xl" />
        <p className="relative text-center font-display text-[11px] tracking-[0.45em] text-gold/70">{en}</p>
        <h1 className="relative mt-2 text-center font-serif text-2xl font-bold">
          <span className="gold-text">{title}</span>
        </h1>
        <div className="relative mt-7">{children}</div>
      </div>
    </div>
  );
}
