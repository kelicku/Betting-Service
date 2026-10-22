"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Badge } from "@/components/admin/kit";
import { PrizeArt } from "@/components/PrizeCard";
import { useToast } from "@/components/Toast";
import { Alert, Button, Field, PageTitle, Panel, RarityBadge, Spinner, StatusPill } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Rarity, Shipping } from "@/lib/types";

type Detail = {
  id: number; user_id: number; email: string; display_name: string; status: string; status_label: string; carrier: string | null; tracking_number: string | null; admin_note: string | null; user_message: string | null;
  created_at: string; approved_at: string | null; shipped_at: string | null; completed_at: string | null; pii_purged_at: string | null;
  shipping: Shipping | null; allowed_transitions: string[];
  items: { user_prize_id: number; active: boolean; status: string; prize: { id: number; name: string; rarity: Rarity; image_url: string | null; requires_shipping: boolean } }[];
  history: { from_status: string | null; to_status: string; note: string | null; created_at: string; actor_email: string | null }[];
};
const ACTION: Record<string, [string, "gold" | "purple" | "ghost" | "danger"]> = {
  approved: ["承認する", "gold"],
  preparing: ["発送準備に進める", "purple"],
  shipped: ["発送済みにする", "gold"],
  completed: ["完了にする", "gold"],
  rejected: ["却下する", "danger"],
};

export default function AdminExchangeDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: ex, mutate } = useSWR<Detail>(`/api/admin/exchanges/${id}`, fetcher, { revalidateOnFocus: false });
  const toast = useToast();
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("ヤマト運輸");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  if (!ex) return <Spinner />;

  const go = async (status: string) => {
    if (status === "rejected" && !note.trim()) return toast("却下する場合は理由を入力してください（ユーザーに通知されます）", "error");
    if (!confirm(`「${ACTION[status][0]}」を実行します。よろしいですか？`)) return;
    setBusy(true);
    try {
      const r = await api<Detail>(`/admin/exchanges/${ex.id}/status`, { body: { status, note: note || null, carrier: status === "shipped" ? carrier : null, tracking_number: status === "shipped" ? tracking || null : null } });
      mutate(r, { revalidate: false });
      setNote("");
      toast("状態を更新し、ユーザーに通知しました");
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = () => {
    if (!ex.shipping) return;
    const s = ex.shipping;
    navigator.clipboard?.writeText(`〒${s.postal_code}\n${s.prefecture}${s.address1} ${s.address2}\n${s.name} 様\nTEL ${s.phone}`);
    toast("お届け先をコピーしました");
  };

  return (
    <div>
      <nav className="mb-3 text-xs text-moon/50"><Link href="/admin/exchanges" className="hover:text-gold-light">交換申請管理</Link> / #{ex.id}</nav>
      <PageTitle en={`EXCHANGE #${ex.id}`} title="交換申請の詳細" sub={`申請日時：${fmtDateTime(ex.created_at)}`} right={<StatusPill status={ex.status} label={ex.status_label} />} />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Panel>
            <h2 className="mb-3 font-serif font-bold text-gold-light">申請者</h2>
            <p><Link className="hover:text-gold-light" href={`/admin/users/${ex.user_id}`}>{ex.display_name}（{ex.email}）</Link></p>
            {ex.user_message && <p className="mt-2 rounded-lg bg-veil/[0.04] p-3 text-sm text-moon/75">メッセージ：{ex.user_message}</p>}
          </Panel>
          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif font-bold text-gold-light">お届け先</h2>
              {ex.shipping && <Button size="sm" variant="subtle" onClick={copyAddress}>コピー</Button>}
            </div>
            {ex.pii_purged_at ? (
              <Alert kind="info">保持期間を過ぎたため、配送先情報は {fmtDateTime(ex.pii_purged_at)} に消去されました。</Alert>
            ) : ex.shipping ? (
              <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-moon/50">氏名</dt><dd>{ex.shipping.name}</dd>
                <dt className="text-moon/50">郵便番号</dt><dd>〒{ex.shipping.postal_code}</dd>
                <dt className="text-moon/50">住所</dt><dd>{ex.shipping.prefecture}{ex.shipping.address1} {ex.shipping.address2}</dd>
                <dt className="text-moon/50">電話番号</dt><dd>{ex.shipping.phone}</dd>
                <dt className="text-moon/50">補足</dt><dd>{ex.shipping.note || "—"}</dd>
              </dl>
            ) : (
              <p className="text-sm text-moon/55">配送不要の景品です。</p>
            )}
          </Panel>
          <Panel>
            <h2 className="mb-3 font-serif font-bold text-gold-light">景品（{ex.items.length}点）</h2>
            <ul className="divide-y divide-veil/5">
              {ex.items.map((it) => (
                <li key={it.user_prize_id} className="flex items-center gap-3 py-2">
                  <div className="h-12 w-9 overflow-hidden rounded border border-veil/10"><PrizeArt prize={{ ...it.prize, description: "" }} /></div>
                  <RarityBadge rarity={it.prize.rarity} />
                  <span className="flex-1 text-sm">{it.prize.name}</span>
                  {!it.active && <Badge>解除済み</Badge>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel strong>
            <h2 className="mb-3 font-serif font-bold text-gold-light">処理</h2>
            {ex.allowed_transitions.length === 0 ? (
              <p className="text-sm text-moon/55">この申請は処理が終了しています。</p>
            ) : (
              <div className="space-y-3">
                {ex.allowed_transitions.includes("shipped") && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="配送業者"><input className="field" value={carrier} onChange={(e) => setCarrier(e.target.value)} /></Field>
                    <Field label="お問い合わせ番号"><input className="field" value={tracking} onChange={(e) => setTracking(e.target.value)} /></Field>
                  </div>
                )}
                <Field label="メモ・却下理由（ユーザーに通知されます）">
                  <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {[...ex.allowed_transitions].sort((a, b) => Number(a === "rejected") - Number(b === "rejected")).map((s) => (
                    <Button key={s} variant={ACTION[s][1]} loading={busy} onClick={() => go(s)}>{ACTION[s][0]}</Button>
                  ))}
                </div>
              </div>
            )}
            {ex.tracking_number && <p className="mt-4 text-sm">配送：{ex.carrier}／{ex.tracking_number}</p>}
          </Panel>
          <Panel>
            <h2 className="mb-3 font-serif font-bold text-gold-light">処理履歴</h2>
            <ol className="space-y-3 border-l border-gold/20 pl-4">
              {ex.history.map((h, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold" />
                  <p>{h.from_status ? `${h.from_status} → ` : ""}<span className="font-bold">{h.to_status}</span></p>
                  <p className="text-xs text-moon/45">{fmtDateTime(h.created_at)}・{h.actor_email ?? "—"}</p>
                  {h.note && <p className="text-xs text-moon/65">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}
