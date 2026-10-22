"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { RequireAuth } from "@/components/Guard";
import { cx } from "@/components/ui";

const NAV: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/users", label: "ユーザー管理" },
  { href: "/admin/tickets", label: "チケット管理" },
  { href: "/admin/gachas", label: "ガチャ管理" },
  { href: "/admin/prizes", label: "景品管理" },
  { href: "/admin/inventory", label: "在庫管理" },
  { href: "/admin/last-one", label: "ラストワン賞管理" },
  { href: "/admin/ranks", label: "当選ランク・演出" },
  { href: "/admin/draws", label: "抽選履歴" },
  { href: "/admin/offers", label: "広告・アンケート管理" },
  { href: "/admin/exchanges", label: "景品の発送申請" },
  { href: "/admin/shop/orders", label: "ポイント交換の申請" },
  { href: "/admin/shop", label: "ポイント交換の景品・ギフトコード" },
  { href: "/admin/referrals", label: "友達紹介" },
  { href: "/admin/coupons", label: "クーポンコード" },
  { href: "/admin/messages", label: "メッセージ配信" },
  { href: "/admin/audit", label: "操作履歴", adminOnly: true },
  { href: "/admin/settings", label: "システム設定" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <RequireAuth role="staff">
      {(me) => (
        <div className="mx-auto flex max-w-[1400px] gap-6 px-3 py-6 sm:px-5">
          <aside className={cx("fixed inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-gold/15 bg-night-900/95 p-4 backdrop-blur-xl transition-transform lg:static lg:z-auto lg:block lg:translate-x-0 lg:rounded-2xl lg:border lg:bg-veil/[0.03]", open ? "translate-x-0" : "-translate-x-full")}>
            <p className="px-2 font-display text-[10px] tracking-[0.35em] text-gold/60">ADMIN CONSOLE</p>
            <p className="mt-1 px-2 text-xs text-moon/50">
              {me.display_name}（{me.role === "admin" ? "管理者" : "スタッフ"}）
            </p>
            <nav className="mt-4 grid gap-0.5" aria-label="管理メニュー">
              {NAV.filter((n) => !n.adminOnly || me.role === "admin").map((n) => {
                // 最も長く一致する項目だけを選択状態にする（/admin/shop と /admin/shop/orders など）
                const best = NAV.filter((x) => (x.href === "/admin" ? path === "/admin" : path === x.href || path.startsWith(`${x.href}/`)))
                  .sort((a, b) => b.href.length - a.href.length)[0];
                const active = best?.href === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={cx("rounded-lg px-3 py-2 text-sm transition", active ? "bg-gold/15 text-gold-light shadow-[inset_3px_0_0_#ff5c93]" : "text-moon/70 hover:bg-veil/5 hover:text-moon")}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <Link href="/" className="mt-6 block px-3 text-xs text-moon/45 hover:text-gold-light">← サイトへ戻る</Link>
          </aside>
          {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
          <div className="min-w-0 flex-1">
            <button className="mb-4 rounded-lg border border-veil/10 px-3 py-2 text-sm lg:hidden" onClick={() => setOpen(true)}>
              ☰ 管理メニュー
            </button>
            {children}
          </div>
        </div>
      )}
    </RequireAuth>
  );
}
