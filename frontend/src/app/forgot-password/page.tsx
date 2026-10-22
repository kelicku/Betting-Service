"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/Guard";
import { Alert, Button, Field } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ message: string }>("/auth/forgot-password", { body: { email } });
      setMsg(r.message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthShell title="パスワード再設定" en="RESET PASSWORD">
      {msg ? (
        <div className="space-y-5">
          <Alert kind="success">{msg}</Alert>
          <p className="text-xs leading-relaxed text-moon/50">メールに記載されたリンクの有効期限は1時間です。届かない場合は、入力したメールアドレスをご確認ください。</p>
          <Button variant="ghost" href="/login" className="w-full">ログイン画面へ</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <p className="text-sm leading-relaxed text-moon/70">ご登録のメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。</p>
          {error && <Alert kind="error">{error}</Alert>}
          <Field label="メールアドレス">
            <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={loading}>再設定メールを送信</Button>
          <Link href="/login" className="block text-center text-sm text-moon/60 hover:text-gold-light">ログイン画面に戻る</Link>
        </form>
      )}
    </AuthShell>
  );
}
