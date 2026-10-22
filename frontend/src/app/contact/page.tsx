"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Field, PageTitle, Panel } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/hooks";

export default function ContactPage() {
  const { me } = useMe();
  const [f, setF] = useState({ name: "", email: "", category: "other", body: "" });
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (me) setF((s) => ({ ...s, name: s.name || me.display_name, email: s.email || me.email }));
  }, [me]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ message: string }>("/contact", { body: f });
      setDone(r.message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageTitle en="CONTACT" title="お問い合わせ" sub="ご不明な点やお困りのことがございましたら、お気軽にお問い合わせください。" />
      <Panel>
        {done ? (
          <Alert kind="success">{done}</Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && <Alert kind="error">{error}</Alert>}
            <Field label="お名前">
              <input className="field" required maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="メールアドレス">
              <input className="field" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="お問い合わせの種類">
              <select className="field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                <option value="account">アカウント・ログインについて</option>
                <option value="gacha">ガチャについて</option>
                <option value="tickets">チケット・ポイントについて</option>
                <option value="exchange">景品交換・配送について</option>
                <option value="other">その他</option>
              </select>
            </Field>
            <Field label="お問い合わせ内容">
              <textarea className="field" rows={6} required minLength={5} maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading}>送信する</Button>
          </form>
        )}
      </Panel>
    </div>
  );
}
