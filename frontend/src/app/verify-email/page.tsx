"use client";

import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { AuthShell } from "@/components/Guard";
import { Alert, Button, Points, Spinner, Tickets } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { refreshMe } from "@/lib/hooks";
import type { Me } from "@/lib/types";

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (!token) {
      setError("リンクが正しくありません。");
      return;
    }
    api<Me>("/auth/verify-email", { body: { token } })
      .then((m) => {
        setMe(m);
        refreshMe();
      })
      .catch((e: ApiError) => {
        if (e.code === "already_verified") setAlready(true);
        else setError(e.message);
      });
  }, [token]);

  if (already)
    return (
      <div className="space-y-5">
        <Alert kind="success">このメールアドレスは確認済みです。ログインしてご利用ください。</Alert>
        <Button href="/login" className="w-full">ログインする</Button>
      </div>
    );
  if (error)
    return (
      <div className="space-y-5">
        <Alert kind="error">{error}</Alert>
        <p className="text-xs leading-relaxed text-moon/60">
          確認メールのリンクの有効期限は 24 時間です。ログインして、マイページの「確認メールを再送する」から新しいリンクを受け取ってください。
          メールが届かない場合は、迷惑メールフォルダもご確認ください。
        </p>
        <Button href="/login?next=/mypage" className="w-full">ログインしてメールを再送する</Button>
      </div>
    );
  if (!me) return <Spinner label="確認しています…" />;
  return (
    <div className="space-y-6 text-center">
      <motion.div initial={{ scale: 0.4, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 160, damping: 12 }}>
        <svg viewBox="0 0 64 64" className="mx-auto h-20 w-20 drop-shadow-[0_0_20px_rgba(243,223,179,0.6)]" aria-hidden>
          <path d="M32 4l6 20 20 8-20 8-6 20-6-20-20-8 20-8z" fill="#F3DFB3" />
        </svg>
      </motion.div>
      <p className="font-serif text-lg">{me.display_name} さん、ようこそ。</p>
      <p className="text-sm text-moon/70">
        新規登録特典として <Tickets n={me.balance} className="text-gold-light" />
        {me.point_balance > 0 && (
          <>
            ・<Points n={me.point_balance} className="text-gold-light" />
          </>
        )}
        をお贈りしました。
      </p>
      <Button size="lg" href="/gacha" className="w-full">さっそくガチャを引く</Button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell title="メールアドレスの確認" en="VERIFICATION">
      <Suspense>
        <Verify />
      </Suspense>
    </AuthShell>
  );
}
