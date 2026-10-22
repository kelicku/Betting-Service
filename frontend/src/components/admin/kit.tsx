"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { cx } from "../ui";

export type AdminPage<T> = { items: T[]; total: number; page: number; per_page: number };

/** 一覧画面用：クエリ（絞り込み条件）とページを URL 文字列にまとめて取得する。 */
export function useAdminList<T>(base: string, initial: Record<string, string> = {}, perPage = 30) {
  const [filters, setFilters] = useState<Record<string, string>>(initial);
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")), page: String(page), per_page: String(perPage) });
  const { data, mutate, error, isLoading } = useSWR<AdminPage<T> & Record<string, unknown>>(`${base}?${qs}`, fetcher, { keepPreviousData: true });
  const set = useCallback((k: string, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  }, []);
  return { data, mutate, error, isLoading, filters, set, page, setPage, perPage };
}

export function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cx("glass p-4", accent && "border-gold/50 shadow-glow")}>
      <p className="text-xs text-moon/55">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-moon">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-moon/45">{sub}</p>}
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onChange(v);
      }}
      className="flex min-w-[14rem] flex-1 gap-2 sm:max-w-sm"
    >
      <input className="field py-2 text-sm" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button className="rounded-lg border border-gold/40 px-3 text-sm text-gold-light hover:bg-gold/10">検索</button>
    </form>
  );
}

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) {
  return (
    <select className="field w-auto py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map(([v, t]) => (
        <option key={v} value={v}>{t}</option>
      ))}
    </select>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="glass overflow-x-auto p-1">{children}</div>;
}

export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" | "info" }) {
  const t = {
    default: "bg-veil/5 text-moon/70 border-veil/10",
    good: "bg-emerald-400/10 text-emerald-200 border-emerald-300/30",
    warn: "bg-gold/10 text-gold-light border-gold/30",
    bad: "bg-rose-500/10 text-rose-200 border-rose-400/30",
    info: "bg-aurora/10 text-aurora border-aurora/30",
  }[tone];
  return <span className={cx("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]", t)}>{children}</span>;
}

export const GACHA_STATUS: Record<string, [string, "default" | "good" | "warn"]> = {
  draft: ["下書き", "default"],
  published: ["公開中", "good"],
  archived: ["終了", "warn"],
};
