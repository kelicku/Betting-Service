"use client";

/** 電話番号の確認（SMS 認証）。運営が必須にしている場合、ガチャ・チケット獲得・ポイント交換の前に必要。 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequireAuth } from "@/components/Guard";
import { useToast } from "@/components/Toast";
import { Alert, Button, Field, PageTitle, Panel } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { refreshMe, useMe } from "@/lib/hooks";

function safeNext(n: string | null): string {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/mypage";
}

function Content() {
  const { me } = useMe();
  const toast = useToast();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (me?.phone_verified) {
    return (
      <Panel className="space-y-4 text-center">
        <Alert kind="success">電話番号は確認済みです。</Alert>
        <Button href={next}>戻る</Button>
      </Panel>
    );
  }

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ message: string; last4: string }>("/phone/send-code", { body: { phone } });
      setSentTo(r.last4);
      toast(r.message);
    } catch (e2) {
      setErr((e2 as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/phone/verify", { body: { code } });
      await refreshMe();
      toast("電話番号の確認が完了しました");
      router.push(next);
    } catch (e2) {
      setErr((e2 as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="space-y-5">
      <p className="text-sm leading-relaxed text-moon/70">
        不正防止のため、SMS（ショートメッセージ）を受け取れる携帯電話番号の確認をお願いしています。
        電話番号そのものは保存せず、確認用の情報と末尾 4 桁だけを保存します。
      </p>
      {!sentTo ? (
        <form onSubmit={send} className="space-y-4">
          <Field label="携帯電話番号" hint="070・080・090 で始まる番号（ハイフンなしでも可）">
            <input className="field" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="090-1234-5678" required />
          </Field>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" loading={busy} className="w-full">確認コードを送信</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <Alert kind="info">末尾 {sentTo} の番号に 6 桁の確認コードを送りました（10 分間有効）。</Alert>
          <Field label="確認コード（6 桁）">
            <input className="field text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
          </Field>
          {err && <Alert kind="error">{err}</Alert>}
          <Button type="submit" loading={busy} disabled={code.length !== 6} className="w-full">確認する</Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-moon/60 underline" onClick={() => { setSentTo(null); setCode(""); setErr(null); }}>電話番号を変更する</button>
            <button type="button" className="font-bold text-gold-light underline" onClick={() => send()} disabled={busy}>コードを再送する</button>
          </div>
        </form>
      )}
    </Panel>
  );
}

export default function VerifyPhonePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <PageTitle en="SMS VERIFICATION" title="電話番号の確認" />
      <RequireAuth>{() => <Suspense><Content /></Suspense>}</RequireAuth>
    </div>
  );
}
