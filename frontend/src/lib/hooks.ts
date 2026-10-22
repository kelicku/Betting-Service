"use client";

import useSWR, { mutate } from "swr";
import { ApiError, fetcher } from "./api";
import type { Me } from "./types";

export function useMe() {
  const { data, error, isLoading, mutate: m } = useSWR<Me | null>(
    "/api/auth/me",
    async (url: string) => {
      try {
        return await fetcher<Me>(url);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 },
  );
  return { me: data ?? null, loading: isLoading && data === undefined, error, refresh: m };
}

export function refreshMe(patch?: Partial<Me>) {
  if (patch) {
    return mutate("/api/auth/me", (cur: Me | null | undefined) => (cur ? { ...cur, ...patch } : cur), { revalidate: true });
  }
  return mutate("/api/auth/me");
}

/** 新規登録特典のポイント数（管理画面の設定値）。読み込み前・取得失敗時は null。 */
export type SignupBonus = { tickets: number; points: number };

/** 新規登録特典（チケット・ポイント）。読み込み前は null。 */
export function useSignupBonus(): SignupBonus | null {
  const { data } = useSWR<{ signup_bonus?: number; signup_bonus_points?: number }>("/api/stats/public", fetcher, { revalidateOnFocus: false });
  return data ? { tickets: data.signup_bonus ?? 0, points: data.signup_bonus_points ?? 0 } : null;
}

/** 特典の文言（例：「1,000pt・チケット10枚」）。特典がなければ空文字。 */
export function signupBonusText(b: SignupBonus | null): string {
  if (!b) return "";
  const parts = [b.points > 0 && `${b.points.toLocaleString("ja-JP")}pt`, b.tickets > 0 && `チケット${b.tickets.toLocaleString("ja-JP")}枚`].filter(Boolean);
  return parts.join("・");
}

// 登録 → メール確認のあとに戻る画面（確認メールのリンクは別のタブで開かれるため、ブラウザに保存する）
const AFTER_VERIFY_KEY = "wk_after_verify";
export function rememberAfterVerify(path: string | null) {
  try {
    if (path && path.startsWith("/") && !path.startsWith("//")) localStorage.setItem(AFTER_VERIFY_KEY, path);
  } catch {}
}
export function takeAfterVerify(): string | null {
  try {
    const v = localStorage.getItem(AFTER_VERIFY_KEY);
    localStorage.removeItem(AFTER_VERIFY_KEY);
    return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
  } catch {
    return null;
  }
}

export type RankEffect = { rarity: "SSR" | "SR" | "R" | "N"; label: string; video_url: string | null; logo_url: string | null };
const DEFAULT_RANKS: RankEffect[] = [
  { rarity: "SSR", label: "特賞", video_url: null, logo_url: null },
  { rarity: "SR", label: "大当たり", video_url: null, logo_url: null },
  { rarity: "R", label: "中当たり", video_url: null, logo_url: null },
  { rarity: "N", label: "小当たり", video_url: null, logo_url: null },
];

/** 当選ランクの表示名・演出動画・ロゴ（管理画面で設定）。読み込み前は既定の名前。 */
export function useRanks(): { ranks: RankEffect[]; byRarity: Record<string, RankEffect>; loaded: boolean } {
  const { data } = useSWR<RankEffect[]>("/api/ranks", fetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  const ranks = data ?? DEFAULT_RANKS;
  return { ranks, byRarity: Object.fromEntries(ranks.map((r) => [r.rarity, r])), loaded: !!data };
}
