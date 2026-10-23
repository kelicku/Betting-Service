"use client";

import Link from "next/link";
import { useRanks } from "@/lib/hooks";
import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useCallback, useEffect, useRef, useState, useId } from "react";
import { RARITY } from "@/lib/format";
import type { Rarity } from "@/lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

// ── ボタン：押したときに小さな光が広がる ─────────────────────

type Variant = "gold" | "ghost" | "purple" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "xl";

// 種類ごとに形を変える（角丸は使わない）：主要＝宝石カット、青＝矢羽根、枠＝金の額縁、控えめ＝はんこ、危険＝六角形
const VARIANT: Record<Variant, string> = {
  gold: "sh-gem btn-gem text-white font-round font-extrabold [text-shadow:0_1px_0_rgba(170,0,70,0.3)]",
  purple: "sh-chevron btn-chevron text-white font-round font-bold",
  ghost: "sh-bracket text-gold-light font-round font-bold bg-white/85 shadow-[inset_0_0_0_1.5px_rgba(231,181,74,0.45)] hover:bg-gold/10 hover:shadow-[inset_0_0_0_1.5px_rgba(231,181,74,0.8)]",
  subtle: "sh-stamp text-moon/80 font-round font-bold bg-white border-2 border-[#1d2350]/25 hover:border-[#1d2350]/40",
  danger: "sh-hex btn-hex text-white font-semibold",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm [--c:7px]",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 min-h-[3.25rem] px-7 text-base [--c:12px]",
  xl: "min-h-[3.75rem] px-8 text-lg [--c:14px]",
};

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  href?: string;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "gold", size = "md", loading, className, children, onClick, disabled, href, ...rest },
  ref,
) {
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number }[]>([]);
  const idRef = useRef(0);
  const spark = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = ++idRef.current;
    setSparks((s) => [...s, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setSparks((s) => s.filter((p) => p.id !== id)), 700);
  }, []);
  // 大きな主要ボタン：ポインターに少し引き寄せられ、ときどき光が流れる
  const magnetic = (size === "lg" || size === "xl") && variant !== "subtle";
  const onMagnet = (e: React.PointerEvent<HTMLElement>) => {
    if (!magnetic || e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * 0.18;
    const dy = (e.clientY - (r.top + r.height / 2)) * 0.25;
    el.style.translate = `${dx}px ${dy}px`;
  };
  const offMagnet = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.style.translate = "";
  };
  const cls = cx(
    "relative inline-flex select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap tracking-wide transition-all duration-300 [transition-property:translate,box-shadow,background,border-color,transform,opacity]",
    magnetic && variant === "gold" && "btn-sheen",
    "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
    VARIANT[variant],
    SIZE[size],
    className,
  );
  const inner = (
    <>
      {sparks.map((s) => (
        <span
          key={s.id}
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            left: s.x,
            top: s.y,
            width: 8,
            height: 8,
            marginLeft: -4,
            marginTop: -4,
            background: "radial-gradient(circle, rgba(255,250,235,0.95), rgba(243,223,179,0.4) 40%, transparent 70%)",
            animation: "btn-spark 0.7s ease-out forwards",
          }}
        />
      ))}
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      <span className="relative z-[1] inline-flex items-center gap-2">{children}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={(e) => spark(e)} onPointerMove={onMagnet} onPointerLeave={offMagnet}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      ref={ref}
      className={cls}
      disabled={disabled || loading}
      onPointerMove={onMagnet}
      onPointerLeave={offMagnet}
      onClick={(e) => {
        spark(e);
        onClick?.(e);
      }}
      {...rest}
    >
      {inner}
    </button>
  );
});

// ── レイアウト部品 ───────────────────────────────────────

export function Panel({ className, children, strong }: { className?: string; children: React.ReactNode; strong?: boolean }) {
  return <section className={cx(strong ? "glass-strong" : "glass", "p-5 sm:p-6", className)}>{children}</section>;
}

export function PageTitle({ en, title, sub, right }: { en?: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div>
        {en && <p className="font-display text-xs uppercase tracking-[0.35em] text-gold/70">{en}</p>}
        <h1 className="mt-1 font-serif text-2xl font-bold tracking-wide sm:text-3xl">
          <span className="gold-text">{title}</span>
        </h1>
        {sub && <p className="mt-2 text-sm text-moon/60">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Ornament({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center gap-3", className)} aria-hidden>
      <div className="ornament-line" />
      <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0 text-gold">
        <path d="M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z" fill="currentColor" opacity="0.85" />
      </svg>
      <div className="ornament-line" />
    </div>
  );
}

export function TicketIcon({ className = "h-4 w-4" }: { className?: string }) {
  // 各アイコンに固有の ID（同じ ID を共有すると、非表示の要素内の定義が参照されて色が消える）
  const gid = `tkg${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb3cf" />
          <stop offset="1" stopColor="#ff4f8f" />
        </linearGradient>
      </defs>
      <path
        d="M3 7a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4V7z"
        fill={`url(#${gid})`}
        stroke="#e8336f"
        strokeWidth=".6"
      />
      <path d="M12 8.2l.95 2.1 2.3.25-1.72 1.55.48 2.27L12 13.2l-2.01 1.17.48-2.27-1.72-1.55 2.3-.25z" fill="#fff" />
    </svg>
  );
}

/** ポイントの表示（交換用。チケットとは別）。 */
export function Points({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 font-semibold tabular-nums", className)}>
      <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden>
        <circle cx="16" cy="16" r="15" fill="#ffc928" stroke="#d07a00" strokeWidth="1.5" />
        <path d="M12.3 9.5h4.6a4.1 4.1 0 010 8.2h-2.2v4.8h-2.4zm2.4 2.2v3.8h2.1a1.9 1.9 0 000-3.8z" fill="#fff" />
      </svg>
      {n.toLocaleString("ja-JP")}
      <span className="text-[0.8em] font-normal opacity-70">pt</span>
    </span>
  );
}

export function Tickets({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 font-semibold tabular-nums", className)}>
      <TicketIcon />
      {n.toLocaleString("ja-JP")}
      <span className="text-[0.8em] font-normal opacity-70">枚</span>
    </span>
  );
}

export function RarityBadge({ rarity, size = "sm" }: { rarity: Rarity; size?: "sm" | "md" }) {
  const meta = RARITY[rarity];
  // 表示名は管理画面の「当選ランク」の設定（特賞・大当たり・中当たり・小当たり）
  const label = useRanks().byRarity[rarity]?.label ?? meta.label;
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded-md font-display font-bold tracking-widest",
        size === "sm" ? "h-5 min-w-[2.2rem] whitespace-nowrap px-1.5 text-[10px]" : "h-7 min-w-[3rem] whitespace-nowrap px-2 text-xs",
      )}
      style={{
        color: rarity === "N" ? "#1b2033" : "#120d2b",
        background:
          rarity === "SSR"
            ? "linear-gradient(135deg,#fff4d6,#e3c37f 50%,#b48a3c)"
            : rarity === "SR"
              ? "linear-gradient(135deg,#e6d9ff,#a785f2 55%,#7654c8)"
              : rarity === "R"
                ? "linear-gradient(135deg,#e3f8ff,#84d8f1 55%,#4aa9cc)"
                : "linear-gradient(135deg,#f5f7fb,#c9ced9 55%,#9aa2b5)",
        boxShadow: `0 0 12px ${meta.glow}`,
      }}
    >
      {label}
    </span>
  );
}

export function Spinner({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-moon/60" role="status">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-gold/20 border-t-gold" />
        <div className="absolute inset-2 animate-spin rounded-full border border-amethyst/30 border-b-amethyst-300 [animation-direction:reverse]" />
      </div>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      {/* サイトのキャラクター（猫） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/waku/cat-face.webp" alt="" width={260} height={195} className="h-auto w-20 opacity-90" loading="lazy" />
      <p className="font-serif text-lg text-moon/80">{title}</p>
      {children && <div className="text-sm text-moon/55">{children}</div>}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: React.ReactNode }) {
  const styles = {
    info: "border-aurora/30 bg-aurora/[0.07] text-aurora-300",
    error: "border-rose-400/40 bg-rose-500/10 text-rose-200",
    success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    warn: "border-gold/40 bg-gold/10 text-gold-light",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm leading-relaxed", styles)}>
      {children}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-moon/45">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-300">{error}</span>}
    </label>
  );
}

export function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  const nums = Array.from(new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))).sort((a, b) => a - b);
  return (
    <nav className="mt-6 flex items-center justify-center gap-1.5" aria-label="ページ切り替え">
      <button className="sh-tag h-9 bg-veil/5 px-3 text-sm text-moon/70 [--c:10px] hover:bg-veil/10 disabled:opacity-30" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        前へ
      </button>
      {nums.map((n, i) => (
        <span key={n} className="flex items-center">
          {i > 0 && nums[i - 1] !== n - 1 && <span className="px-1 text-moon/40">…</span>}
          <button
            onClick={() => onChange(n)}
            aria-current={n === page ? "page" : undefined}
            className={cx(
              "sh-diamond h-10 w-10 text-sm font-bold tabular-nums transition",
              n === page ? "bg-[linear-gradient(180deg,#ff86bb,#ee1f68)] text-white" : "bg-veil/5 text-moon/70 hover:bg-veil/10",
            )}
          >
            {n}
          </button>
        </span>
      ))}
      <button className="sh-arrow h-9 bg-veil/5 px-3 text-sm text-moon/70 [--c:10px] hover:bg-veil/10 disabled:opacity-30" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        次へ
      </button>
    </nav>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-night-900/75 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx(
              "glass-strong max-h-[92dvh] w-full overflow-y-auto rounded-b-none p-6 sm:rounded-2xl",
              wide ? "sm:max-w-3xl" : "sm:max-w-md",
            )}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && <h2 className="mb-4 font-serif text-xl font-bold text-gold-light">{title}</h2>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="no-scrollbar -mx-1 mb-5 flex gap-1 overflow-x-auto px-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            "sh-folder relative shrink-0 px-5 py-2 text-sm font-bold transition",
            value === it.value ? "bg-[linear-gradient(180deg,#ffe3ee,#ffd0e2)] text-gold-light shadow-[inset_0_-3px_0_#ff5f9a]" : "bg-veil/[0.04] text-moon/60 hover:bg-veil/10 hover:text-moon",
          )}
        >
          {it.label}
          {it.count != null && <span className="ml-1.5 text-xs tabular-nums opacity-70">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  const color: Record<string, string> = {
    pending: "bg-gold/15 text-gold-light border-gold/30",
    approved: "bg-aurora/10 text-aurora border-aurora/30",
    preparing: "bg-amethyst/15 text-amethyst-200 border-amethyst/30",
    shipped: "bg-sky-400/10 text-sky-200 border-sky-300/30",
    completed: "bg-emerald-400/10 text-emerald-200 border-emerald-300/30",
    rejected: "bg-rose-500/10 text-rose-200 border-rose-400/30",
    cancelled: "bg-veil/5 text-moon/50 border-veil/10",
  };
  return <span className={cx("inline-flex rounded-full border px-2.5 py-0.5 text-xs", color[status] ?? color.cancelled)}>{label}</span>;
}
