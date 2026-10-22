"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import DemoLogin from "@/components/DemoLogin";
import { AuthShell } from "@/components/Guard";
import { Alert, Button, Field } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { refreshMe } from "@/lib/hooks";

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/mypage";
}

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/auth/login", { body: { email, password } });
      await refreshMe();
      router.replace(next);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="ログイン" en="SIGN IN">
      <DemoLogin next={next === "/mypage" ? "/gacha" : next} />
      <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="メールアドレス">
          <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="パスワード">
          <input className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          ログイン
        </Button>
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="text-moon/60 hover:text-gold-light">
            パスワードをお忘れの方
          </Link>
          <Link href="/register" className="text-gold-light hover:underline">
            新規登録
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
