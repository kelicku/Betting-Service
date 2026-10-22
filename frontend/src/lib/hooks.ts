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
export function useSignupBonus(): number | null {
  const { data } = useSWR<{ signup_bonus?: number }>("/api/stats/public", fetcher, { revalidateOnFocus: false });
  return data?.signup_bonus ?? null;
}
