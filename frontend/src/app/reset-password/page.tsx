"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/Guard";
import { Alert, Button, Field } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw !== pw2) return setError("確認用のパスワードが一致しません。");
    setLoading(true);
    try {
      const r = await api<{ message: string }>("/auth/reset-password", { body: { token, password: pw } });
      setMsg(r.message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  };
  if (!token) return <Alert kind="error">リンクが正しくありません。メールのリンクをもう一度開いてください。</Alert>;
  return msg ? (
    <div className="space-y-5">
      <Alert kind="success">{msg}</Alert>
      <Button href="/login" className="w-full">ログイン画面へ</Button>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-5">
      {error && <Alert kind="error">{error}</Alert>}
      <Field label="新しいパスワード" hint="英字と数字を含む8文字以上">
        <input className="field" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </Field>
      <Field label="新しいパスワード（確認）">
        <input className="field" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>パスワードを再設定する</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="新しいパスワード" en="NEW PASSWORD">
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
