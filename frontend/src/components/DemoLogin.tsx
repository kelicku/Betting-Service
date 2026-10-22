"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ApiError, api, fetcher } from "@/lib/api";
import { refreshMe } from "@/lib/hooks";
import { Alert, Button } from "./ui";

/** デモ環境でのみ表示：ボタンを押すだけでお試しアカウントが作成され、ログインできる。 */
export default function DemoLogin({ next = "/gacha" }: { next?: string }) {
  const { data: cfg } = useSWR<{ demo_login: boolean; demo_login_tickets: number }>("/api/config", fetcher);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!cfg?.demo_login) return null;

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      await api("/auth/demo-login", { method: "POST" });
      await refreshMe();
      router.replace(next);
    } catch (e) {
      setError((e as ApiError).message);
      setLoading(false);
    }
  };

  return (
    <>
    <div className="space-y-3 rounded-2xl border border-gold/40 bg-gold/[0.07] p-5 shadow-glow">
      <p className="text-center font-serif font-bold text-gold-light">デモ版をお試しの方</p>
      <p className="text-center text-sm leading-relaxed text-moon/70">
        メールアドレスやパスワードの入力は不要です。
        <br />
        ボタンを押すとお試しアカウントが作成され、チケット{cfg.demo_login_tickets}枚ですぐにガチャをお楽しみいただけます。
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      <Button size="xl" className="w-full" loading={loading} onClick={login}>
        ワンクリックでログイン
      </Button>
      <p className="text-center text-[11px] leading-relaxed text-moon/45">
        お試しアカウントは端末ごとに作成されます。データは予告なく削除される場合があります。
      </p>
    </div>
    <div className="mt-6 flex items-center gap-3 text-xs text-moon/45" aria-hidden>
      <span className="h-px flex-1 bg-veil/10" />
      または、登録済みのアカウントで
      <span className="h-px flex-1 bg-veil/10" />
    </div>
    </>
  );
}
