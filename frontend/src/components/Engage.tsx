"use client";

/** 興味を引く小さな仕掛け：最近の当選ティッカー・カウントダウン・ログインボーナスの贈り物・月のスクロール表示。 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { ApiError, api, fetcher } from "@/lib/api";
import { RARITY } from "@/lib/format";
import { refreshMe, useMe } from "@/lib/hooks";
import type { Rarity } from "@/lib/types";
import { useToast } from "./Toast";
import { TreasureChest } from "./TreasureChest";
import { RarityBadge, cx } from "./ui";

// ── 最近の当選 ─────────────────────────────────────────

type Win = { id: string; name: string; gacha_title: string; gacha_slug: string | null; rarity: Rarity; prize_name: string; image_url: string | null; is_last_one: boolean; created_at: string };

/** 当選の一行。公開中のガチャならそのガチャへのリンク、公開を終えたガチャなら文字だけ。 */
function WinLink({ slug, children }: { slug: string | null; children: React.ReactNode }) {
  const cls = "flex items-center gap-2.5 whitespace-nowrap text-sm text-moon/75";
  return slug ? (
    <Link href={`/gacha/${slug}`} className={`${cls} transition hover:text-gold-light`}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "たった今";
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
}

export function RecentWinsTicker() {
  const { data } = useSWR<Win[]>("/api/recent-wins", fetcher, { refreshInterval: 30000 });
  if (!data || data.length === 0) return null;
  // 途切れずに流れるよう 2 周分並べる
  const loop = data.length < 6 ? [...data, ...data, ...data] : data;
  return (
    <section aria-label="最近の当選" className="relative border-y border-gold/15 bg-night-900/50 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 sm:px-6">
        <p className="flex shrink-0 items-center gap-2 py-3 font-serif text-sm text-gold-light">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
          </span>
          <span className="hidden sm:inline">最新の当選</span>
        </p>
        <div className="group relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
          <ul className="flex w-max animate-[ticker_60s_linear_infinite] gap-8 py-3 group-hover:[animation-play-state:paused]">
            {[...loop, ...loop].map((w, i) => (
              <li key={`${w.id}-${i}`} aria-hidden={i >= loop.length}>
                <WinLink slug={w.gacha_slug}>
                  {w.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.image_url} alt="" className="h-8 w-6 rounded border object-cover" style={{ borderColor: RARITY[w.rarity].color, boxShadow: `0 0 10px ${RARITY[w.rarity].glow}` }} loading="lazy" />
                  )}
                  <span className="text-moon/55">{w.name}さんが</span>
                  {w.is_last_one ? (
                    <span className="rounded-full bg-gradient-to-r from-gold-light to-gold px-2 py-0.5 text-[10px] font-bold text-night">ラストワン賞</span>
                  ) : (
                    <RarityBadge rarity={w.rarity} />
                  )}
                  <span className="font-medium text-moon">「{w.prize_name}」</span>
                  <span className="text-moon/55">を獲得</span>
                  <span className="text-xs text-moon/35">{ago(w.created_at)}</span>
                </WinLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── カウントダウン ──────────────────────────────────────

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Digit({ value, label }: { value: number; label: string }) {
  const v = String(value).padStart(2, "0");
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-11 w-11 overflow-hidden rounded-lg border border-gold/30 bg-night-800/80 shadow-inner sm:h-12 sm:w-12">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={v}
            className="absolute inset-0 flex items-center justify-center font-display text-xl font-bold tabular-nums text-gold-light"
            initial={{ y: "-100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {v}
          </motion.span>
        </AnimatePresence>
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/30" />
      </div>
      <span className="mt-1 text-[10px] text-moon/45">{label}</span>
    </div>
  );
}

/** 開催終了までの残り時間（数字がめくれるように変わる）。 */
export function Countdown({ endsAt, label = "終了まで" }: { endsAt: string; label?: string }) {
  const now = useNow();
  if (now == null) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return <p className="text-sm text-rose-300">このガチャは終了しました</p>;
  const d = Math.floor(ms / 86400000),
    h = Math.floor((ms % 86400000) / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000);
  const urgent = ms < 86400000;
  return (
    <div role="timer" aria-label={`${label} ${d}日${h}時間${m}分`}>
      <p className={cx("mb-2 text-xs", urgent ? "text-blush" : "text-moon/55")}>{urgent ? "まもなく終了！" : label}</p>
      <div className="flex items-start gap-1.5">
        <Digit value={d} label="日" />
        <span className="pt-2.5 text-gold/60">:</span>
        <Digit value={h} label="時間" />
        <span className="pt-2.5 text-gold/60">:</span>
        <Digit value={m} label="分" />
        <span className="pt-2.5 text-gold/60">:</span>
        <Digit value={s} label="秒" />
      </div>
    </div>
  );
}

/** 一覧カード用の小さなカウントダウン（1 分ごと、24 時間を切ると秒まで）。 */
export function MiniCountdown({ endsAt }: { endsAt: string }) {
  const now = useNow(1000);
  if (now == null) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return <>終了</>;
  const d = Math.floor(ms / 86400000),
    h = Math.floor((ms % 86400000) / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return <>残り{d}日{h}時間</>;
  return (
    <span className="tabular-nums">
      残り{String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

// ── ログインボーナスの贈り物 ─────────────────────────────

export function BonusReminder() {
  const { me } = useMe();
  const path = usePathname();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(true);
  const [opening, setOpening] = useState(false);
  const { data, mutate } = useSWR<{ claimed_today: boolean; streak: number; next_reward: number }>(me?.email_verified ? "/api/rewards/daily" : null, fetcher);
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem("hf_bonus_dismissed") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  const hiddenRoute = path.startsWith("/admin") || /\/play/.test(path) || path === "/mypage";
  if (!me || !data || data.claimed_today || dismissed || hiddenRoute) return null;

  const claim = async () => {
    setOpening(true);
    try {
      const r = await api<{ amount: number; streak: number; balance: number }>("/rewards/daily", { method: "POST" });
      await new Promise((res) => setTimeout(res, 700));
      toast(`ログインボーナス：チケット${r.amount}枚を受け取りました（${r.streak}日連続）`);
      refreshMe({ balance: r.balance });
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
      setOpening(false);
    }
  };

  return (
    <motion.div
      // ガチャ詳細（スマートフォン）は画面下に「ガチャを引く」の帯があるため、その上に出す（ボタンを隠さない）
      className={cx(
        "bonus-reminder fixed right-4 z-40 md:bottom-8 md:right-8",
        /^\/gacha\/[^/]+$/.test(path) ? "bottom-[calc(9.75rem+env(safe-area-inset-bottom))]" : "bottom-[calc(5.5rem+env(safe-area-inset-bottom))]",
      )}
      initial={{ opacity: 0, y: 30, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 1.2, type: "spring", stiffness: 180, damping: 14 }}
    >
      <div className="relative">
        <button
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem("hf_bonus_dismissed", "1");
            } catch {
              /* ignore */
            }
          }}
          className="sh-diamond absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center bg-night-800 text-[10px] text-moon/70 hover:text-moon"
          aria-label="閉じる"
        >
          ×
        </button>
        <button onClick={claim} disabled={opening} className="sh-tag sh-framed relative [--c:18px] [--fill:rgba(20,22,60,0.92)] group flex items-center gap-3 bg-gold/70 py-2.5 pr-5 backdrop-blur-xl" aria-label={`本日のログインボーナス（${data.next_reward}pt）を受け取る`}>
          <motion.span
            className="relative flex h-11 w-11 items-center justify-center"
            animate={opening ? { rotate: [0, -10, 10, -6, 0], scale: [1, 1.15, 1.3, 0] } : { y: [0, -3, 0] }}
            transition={opening ? { duration: 0.7 } : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <TreasureChest size="sm" open={opening} />
          </motion.span>
          <span className="text-left">
            <span className="block text-[11px] font-bold text-[#ffe9a8]/85">本日のログインボーナス</span>
            <span className="block font-serif text-sm font-bold text-gold-light">チケット{data.next_reward}枚を受け取る</span>
          </span>
        </button>
      </div>
    </motion.div>
  );
}

// ── スクロール量の表示（押すとページ上部へ） ──────────────────

export function ScrollMoon() {
  const [p, setP] = useState(0);
  const path = usePathname();
  useEffect(() => {
    const on = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [path]);
  if (path.startsWith("/admin") || /\/play/.test(path)) return null;
  // 読んだ割合だけピンクの輪が伸びる
  return (
    <AnimatePresence>
      {p > 0.04 && (
        <motion.button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="sh-diamond fixed bottom-8 left-6 z-40 hidden h-[3.6rem] w-[3.6rem] items-center justify-center bg-white text-[#ff3b7f] md:flex"
          aria-label={`ページの先頭へ（${Math.round(p * 100)}%）`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          whileHover={{ scale: 1.08 }}
        >
          <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full" aria-hidden>
            {/* ひし形の枠に沿って、読んだ割合だけ線が伸びる */}
            <path d="M24 1.5L46.5 24 24 46.5 1.5 24z" fill="none" stroke="#ffe0ec" strokeWidth="3" />
            <path d="M24 1.5L46.5 24 24 46.5 1.5 24z" fill="none" stroke="#ff3b7f" strokeWidth="3" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
          </svg>
          <svg viewBox="0 0 24 24" className="relative h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 14l6-6 6 6" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
