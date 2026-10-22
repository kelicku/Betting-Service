"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api";
import { refreshMe, useMe } from "@/lib/hooks";
import { TicketIcon, cx } from "./ui";

const NAV = [
  { href: "/", label: "ホーム" },
  { href: "/gacha", label: "ガチャ" },
  { href: "/shop", label: "ポイント交換" },
  { href: "/news", label: "お知らせ" },
  { href: "/mypage", label: "マイページ" },
];

/** 白い縁取り付きの装飾文字（ロゴ・見出し用）。読み上げは前面の文字だけ。 */
export function OutlineText({ children, className, stroke = 8 }: { children: React.ReactNode; className?: string; stroke?: number }) {
  return (
    <span className={cx("relative inline-block", className)}>
      <span aria-hidden className="outline-back absolute inset-0" style={{ WebkitTextStrokeWidth: stroke }}>
        {children}
      </span>
      <span className="relative">{children}</span>
    </span>
  );
}

export function Logo({ large }: { large?: boolean }) {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-1 whitespace-nowrap" aria-label="わくわくガチャ トップへ">
      <Image
        width={56} height={72} src="/images/waku/logo-coin.webp"
        alt=""
        className={cx("shrink-0 object-contain transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-110", large ? "h-12 w-12 sm:h-16 sm:w-16" : "h-7 w-7 min-[380px]:h-8 min-[380px]:w-8 sm:h-[3.6rem] sm:w-[3.6rem]")}
      />
      <OutlineText stroke={large ? 9 : 7} className={cx("logo-text font-round font-black tracking-[-0.02em]", large ? "text-[2rem] sm:text-[2.6rem]" : "text-[1rem] min-[380px]:text-[1.15rem] min-[400px]:text-[1.4rem] sm:text-[2rem] min-[1400px]:text-[2.45rem]")}>
        わくわくガチャ
      </OutlineText>
    </Link>
  );
}

function CoinIcon({ className }: { className?: string }) {
  // 各アイコンに固有の ID（非表示の要素内の定義を参照すると色が消えるため）
  const gid = `coin${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <radialGradient id={gid} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset=".45" stopColor="#ffc928" />
          <stop offset="1" stopColor="#e08a00" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${gid})`} stroke="#d07a00" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="11.2" fill="none" stroke="#fff6c8" strokeOpacity=".8" strokeWidth="1" />
      <path d="M12.3 9.5h4.6a4.1 4.1 0 010 8.2h-2.2v4.8h-2.4zm2.4 2.2v3.8h2.1a1.9 1.9 0 000-3.8z" fill="#fff" />
    </svg>
  );
}
export { CoinIcon };

function PointPill({ balance }: { balance: number }) {
  return (
    <Link
      href="/points"
      className="group flex h-12 items-center gap-2 rounded-full border-2 border-[#f6c445] bg-white pl-1.5 pr-4 shadow-[0_4px_14px_-4px_rgba(240,170,30,0.6)] transition hover:shadow-[0_6px_20px_-4px_rgba(240,170,30,0.8)] min-[1400px]:h-14 min-[1400px]:min-w-[12rem] min-[1400px]:gap-3 min-[1400px]:pl-2.5 min-[1400px]:pr-6"
      aria-label={`所持ポイント ${balance.toLocaleString("ja-JP")}pt`}
    >
      <CoinIcon className="h-9 w-9 shrink-0 min-[1400px]:h-[2.6rem] min-[1400px]:w-[2.6rem]" />
      <motion.span key={balance} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="ml-auto font-round text-xl font-extrabold tabular-nums text-[#1e1f3a] min-[1400px]:text-[1.6rem]">
        {balance.toLocaleString("ja-JP")}
        <span className="ml-1 text-sm font-bold min-[1400px]:text-base">pt</span>
      </motion.span>
    </Link>
  );
}

/** ガチャチケットの残高（ガチャを引くときに使う）。ポイントとは別。 */
function TicketPill({ balance }: { balance: number }) {
  return (
    <Link
      href="/tickets"
      className="flex h-11 items-center gap-1.5 rounded-full border-2 border-[#ffc2d6] bg-white pl-2 pr-3 shadow-[0_4px_12px_-6px_rgba(255,80,140,0.6)] transition hover:border-[#ff8fb5] min-[1400px]:h-12 min-[1400px]:pr-4"
      aria-label={`所持チケット ${balance.toLocaleString("ja-JP")}枚`}
    >
      <TicketIcon className="h-7 w-7 shrink-0" />
      <motion.span key={balance} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-round text-lg font-extrabold tabular-nums text-[#1e1f3a]">
        {balance.toLocaleString("ja-JP")}
        <span className="ml-0.5 text-xs font-bold">枚</span>
      </motion.span>
    </Link>
  );
}

/** 狭い画面用の短い表記：1 万以上は「4.5万」「12.3万」「123万」（正確な数は aria-label で読み上げる）。 */
function shortJa(n: number): string {
  if (n < 10_000) return n.toLocaleString("ja-JP");
  const man = n / 10_000;
  return `${man >= 1000 ? Math.floor(man).toLocaleString("ja-JP") : man >= 100 ? Math.floor(man) : Math.floor(man * 10) / 10}万`;
}

/** スマートフォン用：チケットとポイントを 1 つの小さな枠にまとめて表示する。 */
function BalancePillCompact({ tickets, points }: { tickets: number; points: number }) {
  return (
    <span className="flex h-10 items-center overflow-hidden rounded-full border-2 border-[#f6c445] bg-white text-[#1e1f3a] shadow-[0_4px_14px_-6px_rgba(240,170,30,0.6)] sm:h-11 lg:hidden">
      <Link href="/tickets" className="flex items-center gap-0.5 pl-1 pr-1.5 min-[380px]:pl-1.5 min-[380px]:pr-2" aria-label={`所持チケット ${tickets.toLocaleString("ja-JP")}枚`}>
        <TicketIcon className="h-5 w-5" />
        <span className="font-round text-sm font-extrabold tabular-nums">{shortJa(tickets)}</span>
      </Link>
      <span className="h-5 w-px bg-[#f6c445]" aria-hidden />
      <Link href="/points" className="flex items-center gap-0.5 pl-1 pr-2 min-[380px]:pl-1.5 min-[380px]:pr-2.5" aria-label={`所持ポイント ${points.toLocaleString("ja-JP")}pt`}>
        <CoinIcon className="h-5 w-5" />
        <span className="font-round text-sm font-extrabold tabular-nums">{shortJa(points)}</span>
      </Link>
    </span>
  );
}

export function Header() {
  const { me } = useMe();
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setMenu(false), [path]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    await refreshMe();
    router.push("/");
  };
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const account: [string, string][] = me
    ? [["/mypage", "マイページ"], ["/notifications", "通知"], ["/earn", "チケットを獲得する"], ["/tickets", "チケットの履歴"], ["/points", "ポイントの履歴"], ["/shop/orders", "ポイント交換の履歴"], ["/draws", "抽選履歴"], ["/prizes", "獲得した景品"], ["/exchanges", "景品の発送申請"], ["/invite", "友達紹介"], ["/settings", "プロフィール設定"]]
    : [["/login", "ログイン"], ["/register", "新規登録"], ["/earn", "チケットを獲得する"], ["/faq", "よくある質問"]];

  return (
    <header
      className={cx(
        "site-header sticky top-0 z-50 transition-all duration-300",
        scrolled ? "bg-white/92 shadow-[0_4px_20px_-8px_rgba(40,60,140,0.35)] backdrop-blur-xl" : "bg-white/80 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1360px] items-center gap-2 px-2 sm:gap-3 sm:px-6 lg:h-[5.25rem] min-[1400px]:pl-20 min-[1400px]:pr-2">
        <Logo />
        <nav className="ml-auto hidden h-full shrink-0 items-center gap-5 xl:flex min-[1400px]:gap-7" aria-label="メインメニュー">
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx("relative flex h-full items-center whitespace-nowrap font-round text-[16px] font-bold tracking-wide transition min-[1400px]:text-[17px]", active ? "text-[#1c2560]" : "text-[#2b3266] hover:text-[#ff3b7f]")}
              >
                {n.label}
                {active && <motion.span layoutId="nav-underline" className="absolute bottom-[17px] left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-[#1c2560]" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 xl:ml-6 min-[1400px]:ml-10">
          {me ? (
            <>
              <Link href="/notifications" className="relative hidden h-11 w-11 items-center sm:flex justify-center rounded-full text-[#1c2560] transition hover:bg-[#1c2560]/5" aria-label={me.unread_notifications > 0 ? `お知らせ（未読${me.unread_notifications}件）` : "お知らせ"}>
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16zM10 20a2 2 0 004 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {me.unread_notifications > 0 && (
                  <span className="absolute right-1 top-1 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full border-2 border-white bg-[#ff2d55] px-1 text-[10px] font-bold text-white">
                    {me.unread_notifications > 9 ? "9+" : me.unread_notifications}
                  </span>
                )}
              </Link>
              <span className="hidden items-center gap-2 lg:flex">
                <TicketPill balance={me.balance} />
                <PointPill balance={me.point_balance ?? 0} />
              </span>
              <BalancePillCompact tickets={me.balance} points={me.point_balance ?? 0} />
            </>
          ) : (
            <>
              <Link href="/login" className="flex h-10 items-center whitespace-nowrap rounded-full border-2 border-[#f6c445] bg-white px-3 font-round text-sm font-bold text-[#1c2560] transition hover:bg-[#fff8e1] sm:h-12 sm:px-6 sm:text-base">
                ログイン
              </Link>
              <Link href="/register" className="cta-pink hidden h-12 items-center whitespace-nowrap rounded-full px-6 font-round text-base font-bold text-white sm:flex">
                新規登録
              </Link>
            </>
          )}
          <div className="relative">
            <button
              onClick={() => setMenu((v) => !v)}
              className="flex h-10 w-10 items-center sm:h-11 sm:w-11 justify-center rounded-full text-[#1c2560] transition hover:bg-[#1c2560]/5"
              aria-expanded={menu}
              aria-haspopup="menu"
              aria-label="メニュー"
            >
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                {menu ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6.5h16M4 12h16M4 17.5h16" />}
              </svg>
            </button>
            <AnimatePresence>
              {menu && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-[#e7e9f7] bg-white p-1.5 text-[#1c2560] shadow-[0_18px_40px_-12px_rgba(30,40,110,0.4)]"
                >
                  {me && <p className="truncate px-3 pb-1 pt-2 text-xs text-[#6a6f99]">{me.display_name} さん</p>}
                  <div className="xl:hidden">
                    {NAV.map((n) => (
                      <Link key={n.href} href={n.href} role="menuitem" className="block rounded-lg px-3 py-2 text-sm font-bold hover:bg-[#f1f3ff]">
                        {n.label}
                      </Link>
                    ))}
                    <div className="my-1 h-px bg-[#eceef8]" />
                  </div>
                  {account.map(([href, label]) => (
                    <Link key={href} href={href} role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f1f3ff]">
                      {label}
                    </Link>
                  ))}
                  {me && (me.role === "admin" || me.role === "staff") && (
                    <Link href="/admin" role="menuitem" className="block rounded-lg px-3 py-2 text-sm text-[#5b3cc4] hover:bg-[#f1f3ff]">
                      管理画面
                    </Link>
                  )}
                  {me && (
                    <>
                      <div className="my-1 h-px bg-[#eceef8]" />
                      <button onClick={logout} role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#6a6f99] hover:bg-[#f1f3ff]">
                        ログアウト
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}

/** スマートフォン用の下部ナビ。親指の届く位置にガチャとポイントを配置。 */
export function MobileNav() {
  const path = usePathname();
  const { me } = useMe();
  if (path.startsWith("/admin") || /^\/gacha\/[^/]+\/play/.test(path)) return null;
  const items = [
    { href: "/", label: "ホーム", icon: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
    { href: "/earn", label: "獲得", icon: "M12 3v18M5 10l7-7 7 7" },
    { href: "/gacha", label: "ガチャ", icon: "", center: true },
    { href: "/shop", label: "交換", icon: "M4 8h16v12H4zM2 8h20V5H2zM12 5v15M12 5c-2-3-6-3-6 0M12 5c2-3 6-3 6 0" },
    { href: me ? "/mypage" : "/login", label: me ? "マイページ" : "ログイン", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#ffd6e4] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-10px_rgba(255,80,140,0.4)] backdrop-blur-xl md:hidden" aria-label="メニュー">
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-end">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          if (it.center)
            return (
              <Link key={it.href} href={it.href} className="relative -mt-6 flex flex-col items-center" aria-label="ガチャ一覧">
                <span className="cta-pink flex h-16 w-16 items-center justify-center rounded-full border-4 border-white">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 text-white">
                    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" fill="currentColor" />
                  </svg>
                </span>
                <span className="mt-0.5 text-[10px] font-bold text-[#ff3b7f]">ガチャ</span>
              </Link>
            );
          return (
            <Link key={it.href} href={it.href} className={cx("flex flex-col items-center gap-1 pb-2 text-[10px]", active ? "text-[#ff3b7f]" : "text-[#7a7fa8]")}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d={it.icon} />
              </svg>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SnsIcon({ kind }: { kind: "x" | "instagram" | "youtube" }) {
  const d = {
    x: "M4 4l7.2 9.4L4.3 20h1.6l6-5.6L16.6 20H20l-7.6-9.9L18.9 4h-1.6l-5.6 5.2L7.4 4z",
    instagram: "M7.5 3h9A4.5 4.5 0 0121 7.5v9a4.5 4.5 0 01-4.5 4.5h-9A4.5 4.5 0 013 16.5v-9A4.5 4.5 0 017.5 3zm4.5 5a4 4 0 100 8 4 4 0 000-8zm5-1.6a1 1 0 100 2 1 1 0 000-2z",
    youtube: "M21.6 7.2a2.6 2.6 0 00-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 002.4 7.2 27 27 0 002 12a27 27 0 00.4 4.8 2.6 2.6 0 001.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 001.8-1.8A27 27 0 0022 12a27 27 0 00-.4-4.8zM10 15V9l5.2 3z",
  }[kind];
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d={d} fillRule="evenodd" />
    </svg>
  );
}

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ message: string }>("/newsletter", { body: { email, consent } });
      setMsg({ ok: true, text: r.message });
      setEmail("");
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="w-full max-w-xs">
      <p className="font-round text-[15px] font-bold text-[#1c2560]">最新情報を受け取る</p>
      <div className="mt-3 flex overflow-hidden rounded-full border-2 border-[#ffc6da] bg-white focus-within:border-[#ff6fa0]">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="メールアドレスを入力"
          aria-label="メールアドレス"
          className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-[#1c2560] placeholder:text-[#9a9ec0] focus:outline-none"
        />
        <button disabled={busy} aria-label="登録する" className="cta-pink flex w-12 items-center justify-center text-white disabled:opacity-60">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M3 11.5L21 3l-6.5 18-3-7.5z" />
          </svg>
        </button>
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-[#5a5f88]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-3.5 w-3.5 accent-[#ff3b7f]" />
        お知らせ・キャンペーン情報を受け取る
      </label>
      {msg && <p className={cx("mt-2 text-xs", msg.ok ? "text-[#1e8a4c]" : "text-[#e0245e]")} role="status">{msg.text}</p>}
    </form>
  );
}

export function Footer() {
  const path = usePathname();
  const [links, setLinks] = useState<{ x: string | null; instagram: string | null; youtube: string | null } | null>(null);
  useEffect(() => {
    api<{ x: string | null; instagram: string | null; youtube: string | null }>("/site-links").then(setLinks).catch(() => setLinks(null));
  }, []);
  if (path.startsWith("/admin")) return null;
  const year = new Date().getFullYear();
  const col = (title: string, items: [string, string][]) => (
    <div>
      <p className="font-round text-[15px] font-bold text-[#1c2560] lg:text-base">{title}</p>
      <ul className="mt-3 space-y-1.5 text-[13px] text-[#4a5080] lg:text-[15px]">
        {items.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="transition hover:text-[#ff3b7f]">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <footer className="relative border-t-4 border-[#ffd6e4] bg-[linear-gradient(180deg,#fff7fb,#fdeef6)]">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-6 pb-7 pt-9 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_1fr_1.2fr] lg:px-16">
        <div>
          <Logo large />
          <p className="mt-4 max-w-sm text-[13px] leading-[1.9] text-[#4a5080] lg:text-[15px]">
            遊んで、貯めて、好きなギフトに交換。
            <br />
            毎日わくわくするガチャ体験をお届けします。
          </p>
          <div className="mt-5 flex gap-2.5">
            {(["x", "instagram", "youtube"] as const).map((k) => {
              const label = { x: "X", instagram: "Instagram", youtube: "YouTube" }[k];
              const url = links?.[k];
              const cls = "flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#ffd6e4] bg-white text-[#1c2560] transition";
              return url ? (
                <a key={k} href={url} target="_blank" rel="noopener noreferrer" aria-label={`公式${label}`} className={cx(cls, "hover:border-[#ff6fa0] hover:text-[#ff3b7f]")}>
                  <SnsIcon kind={k} />
                </a>
              ) : (
                <span key={k} title={`公式${label}（準備中）`} aria-label={`公式${label}（準備中）`} className={cx(cls, "opacity-60")}>
                  <SnsIcon kind={k} />
                </span>
              );
            })}
          </div>
        </div>
        {col("サービス", [["/gacha", "ガチャ一覧"], ["/earn", "チケットを獲得する"], ["/shop", "ポイント交換"], ["/invite", "友達紹介"], ["/news", "お知らせ"], ["/faq", "よくある質問"]])}
        {col("サポート", [["/contact", "お問い合わせ"], ["/terms", "利用規約"], ["/privacy", "プライバシーポリシー"], ["/legal/tokushoho", "特定商取引法に基づく表記"]])}
        <NewsletterForm />
      </div>
      <div className="border-t border-[#ffd6e4] bg-white/70 py-4 pb-[calc(1rem+5rem)] text-center text-xs tracking-wide text-[#6a6f99] md:pb-4">
        © {year} わくわくガチャ ｜ WAKUWAKU GACHA. All Rights Reserved.
      </div>
    </footer>
  );
}
