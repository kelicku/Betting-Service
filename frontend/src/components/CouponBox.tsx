"use client";

/** クーポンコードの入力（マイページ）。正しいコードを入れると、すぐにチケットが加算される。 */

import { useState } from "react";
import { useToast } from "./Toast";
import { Alert, Button, Panel } from "./ui";
import { ApiError, api } from "@/lib/api";
import { refreshMe } from "@/lib/hooks";

export default function CouponBox() {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ message: string; balance: number }>("/coupons/redeem", { body: { code } });
      setMsg({ ok: true, text: r.message });
      toast(r.message);
      setCode("");
      refreshMe({ balance: r.balance });
    } catch (err) {
      setMsg({ ok: false, text: (err as ApiError).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <h2 className="font-serif text-lg font-bold text-gold-light">クーポンコード</h2>
      <p className="mt-1 text-xs text-moon/60">公式 SNS などで配布されたコードを入力すると、チケットを受け取れます。</p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          className="field min-w-0 flex-1 font-mono uppercase tracking-wider"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="コードを入力"
          aria-label="クーポンコード"
          maxLength={40}
          autoComplete="off"
        />
        <Button type="submit" loading={busy} disabled={!code.trim()}>受け取る</Button>
      </form>
      {msg && <div className="mt-3"><Alert kind={msg.ok ? "success" : "error"}>{msg.text}</Alert></div>}
    </Panel>
  );
}
