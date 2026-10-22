"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DemoLogin from "@/components/DemoLogin";
import { AuthShell } from "@/components/Guard";
import { Alert, Button, Field } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useSignupBonus } from "@/lib/hooks";

export default function RegisterPage() {
  const bonus = useSignupBonus();
  const [form, setForm] = useState({ email: "", password: "", display_name: "", agree_terms: false, invite_code: "" });
  // 招待リンク（/register?ref=XXXX）から来た場合は招待コードを入れておく
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setForm((f) => ({ ...f, invite_code: ref.toUpperCase().slice(0, 16) }));
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwOk = form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /\d/.test(form.password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!pwOk) return setError("パスワードは英字と数字を含む8文字以上で入力してください。");
    if (!form.agree_terms) return setError("利用規約とプライバシーポリシーへの同意が必要です。");
    setLoading(true);
    try {
      const res = await api<{ message: string }>("/auth/register", { body: { ...form, invite_code: form.invite_code.trim() || null } });
      setDone(res.message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="確認メールを送信しました" en="CHECK YOUR MAIL">
        <div className="space-y-5 text-center">
          <svg viewBox="0 0 64 64" className="mx-auto h-16 w-16 text-gold" aria-hidden>
            <rect x="8" y="16" width="48" height="34" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M8 20l24 16 24-16" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M48 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="currentColor" />
          </svg>
          <p className="leading-relaxed text-moon/75">{done}</p>
          <p className="text-xs text-moon/50">
            メールが届かない場合は、迷惑メールフォルダをご確認ください。リンクの有効期限は24時間です。
          </p>
          <Button variant="ghost" href="/login" className="w-full">
            ログイン画面へ
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="新規登録" en="CREATE ACCOUNT">
      <DemoLogin />
      <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
        <Alert kind="info">メールアドレスの確認が完了すると、新規登録特典として{bonus ? `チケット${bonus.toLocaleString("ja-JP")}枚` : "チケット"}をお贈りします。</Alert>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="ニックネーム" hint="20文字以内。サイト内で表示されます。">
          <input className="field" maxLength={20} required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </Field>
        <Field label="メールアドレス">
          <input className="field" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="パスワード" hint="英字と数字を含む8文字以上">
          <input className="field" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className="mt-2 flex gap-1" aria-hidden>
            {[form.password.length >= 8, /[A-Za-z]/.test(form.password), /\d/.test(form.password)].map((ok, i) => (
              <span key={i} className={"h-1 flex-1 rounded-full transition " + (ok ? "bg-gold" : "bg-veil/10")} />
            ))}
          </div>
        </Field>
        <Field label="招待コード（任意）" hint="お友達から招待コードを受け取った方は入力してください。登録完了後にチケットがもらえます。">
          <input className="field font-mono uppercase tracking-widest" maxLength={16} autoComplete="off" value={form.invite_code} onChange={(e) => setForm({ ...form, invite_code: e.target.value.toUpperCase() })} />
        </Field>
        <label className="flex items-start gap-3 text-sm text-moon/75">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#ff3b7f]"
            checked={form.agree_terms}
            onChange={(e) => setForm({ ...form, agree_terms: e.target.checked })}
          />
          <span>
            <Link href="/terms" target="_blank" className="text-gold-light underline-offset-2 hover:underline">利用規約</Link>
            と
            <Link href="/privacy" target="_blank" className="text-gold-light underline-offset-2 hover:underline">プライバシーポリシー</Link>
            に同意します
          </span>
        </label>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          登録して確認メールを受け取る
        </Button>
        <p className="text-center text-sm text-moon/60">
          既にアカウントをお持ちの方は <Link href="/login" className="text-gold-light hover:underline">ログイン</Link>
        </p>
      </form>
    </AuthShell>
  );
}
