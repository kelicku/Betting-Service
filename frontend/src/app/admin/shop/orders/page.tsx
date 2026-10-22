"use client";

/** 管理：ポイント交換の申請（ギフトコードの手動お渡し・発送・取消）。 */

import { useState } from "react";
import useSWR from "swr";
import { Badge, Select, TableWrap, Toolbar, useAdminList } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Alert, Button, Field, Modal, PageTitle, Pagination, Spinner } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime, fmtNum } from "@/lib/format";

type Row = { id: string; user_id: number; email: string; display_name: string; item_name: string; kind: string; point_cost: number; status: string; status_label: string; recipient_masked: string | null; created_at: string };
type Detail = Row & {
  gift_code_assigned: boolean; carrier: string | null; tracking_number: string | null; admin_note: string | null;
  user: { id: number; email: string; display_name: string } | null;
  shipping: Record<string, string> | null;
};
const TONE: Record<string, "warn" | "good" | "info" | "default"> = { pending: "warn", fulfilled: "good", shipped: "info", cancelled: "default" };

export default function AdminShopOrders() {
  const toast = useToast();
  const list = useAdminList<Row>("/api/admin/shop/orders", { status: "pending", kind: "" });
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: d, mutate: mutDetail } = useSWR<Detail>(openId ? `/api/admin/shop/orders/${openId}` : null, fetcher);
  const [code, setCode] = useState("");
  const [expires, setExpires] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (to: "fulfilled" | "shipped" | "cancelled") => {
    if (!d) return;
    if (to === "cancelled" && !confirm("この申請を取り消し、ポイントを返還しますか？")) return;
    setBusy(true);
    try {
      await api(`/admin/shop/orders/${d.id}/transition`, {
        body: { to, code: code || null, expires_on: expires || null, carrier: carrier || null, tracking_number: tracking || null, note: note || null },
      });
      toast({ fulfilled: "ギフトコードをお渡ししました", shipped: "発送済みにしました", cancelled: "取り消してポイントを返還しました" }[to]);
      setCode(""); setExpires(""); setCarrier(""); setTracking(""); setNote("");
      mutDetail();
      list.mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageTitle en="EXCHANGE ORDERS" title="ポイント交換の申請" sub="ギフトコードの在庫がなかった申請は「受付」のまま残ります。コードを入力してお渡しするか、交換景品の画面でコードを登録すると自動でお渡しされます。" />
      <Toolbar>
        <Select label="状態" value={list.filters.status} onChange={(v) => list.set("status", v)} options={[["", "すべて"], ["pending", "受付（対応待ち）"], ["fulfilled", "お渡し済み"], ["shipped", "発送済み"], ["cancelled", "取消"]]} />
        <Select label="種類" value={list.filters.kind} onChange={(v) => list.set("kind", v)} options={[["", "すべて"], ["digital_code", "デジタルギフト"], ["shipping", "発送"]]} />
      </Toolbar>
      {!list.data ? (
        <Spinner />
      ) : (
        <>
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>申請日時</th><th>会員</th><th>景品</th><th className="text-right">pt</th><th>状態</th><th /></tr></thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr key={r.id}>
                    <td className="text-xs">{fmtDateTime(r.created_at)}</td>
                    <td><span className="block">{r.display_name}</span><span className="text-xs text-moon/50">{r.email}</span></td>
                    <td>{r.item_name}<span className="ml-1 text-xs text-moon/50">{r.kind === "shipping" ? "（発送）" : "（ギフト）"}</span></td>
                    <td className="text-right tabular-nums">{fmtNum(r.point_cost)}</td>
                    <td><Badge tone={TONE[r.status]}>{r.status_label}</Badge></td>
                    <td className="text-right"><Button size="sm" variant="subtle" onClick={() => setOpenId(r.id)}>対応する</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination page={list.page} total={list.data.total} perPage={list.perPage} onChange={list.setPage} />
        </>
      )}

      <Modal open={!!openId} onClose={() => setOpenId(null)} title="ポイント交換の申請">
        {!d ? (
          <Spinner />
        ) : (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5">
              <dt className="text-moon/50">会員</dt><dd>{d.user?.display_name}（{d.user?.email}）</dd>
              <dt className="text-moon/50">景品</dt><dd>{d.item_name}</dd>
              <dt className="text-moon/50">使用ポイント</dt><dd>{fmtNum(d.point_cost)}pt</dd>
              <dt className="text-moon/50">状態</dt><dd><Badge tone={TONE[d.status]}>{d.status_label}</Badge></dd>
              {d.gift_code_assigned && (<><dt className="text-moon/50">ギフトコード</dt><dd>お渡し済み（内容は表示しません）</dd></>)}
              {d.tracking_number && (<><dt className="text-moon/50">追跡番号</dt><dd>{d.carrier} {d.tracking_number}</dd></>)}
              {d.admin_note && (<><dt className="text-moon/50">取消理由</dt><dd>{d.admin_note}</dd></>)}
            </dl>
            {d.shipping && (
              <div className="rounded-xl bg-veil/[0.04] p-3">
                <p className="mb-1 font-bold">お届け先（閲覧は操作履歴に記録されます）</p>
                <p>〒{d.shipping.postal_code} {d.shipping.prefecture}{d.shipping.address1} {d.shipping.address2}</p>
                <p>{d.shipping.name}　{d.shipping.phone}</p>
              </div>
            )}
            {d.status === "pending" ? (
              <div className="space-y-3 border-t border-veil/10 pt-3">
                {d.kind === "digital_code" ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
                    <Field label="ギフトコード"><input className="field font-mono" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
                    <Field label="有効期限（任意）"><input className="field" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
                    <Button onClick={() => act("fulfilled")} loading={busy} disabled={!code.trim()}>お渡しする</Button>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
                    <Field label="配送業者"><input className="field" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="ヤマト運輸" /></Field>
                    <Field label="追跡番号"><input className="field" value={tracking} onChange={(e) => setTracking(e.target.value)} /></Field>
                    <Button onClick={() => act("shipped")} loading={busy}>発送済みにする</Button>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <Field label="取消理由（会員に表示）"><input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="在庫切れのため など" /></Field>
                  <Button variant="danger" onClick={() => act("cancelled")} loading={busy}>取り消してポイントを返還</Button>
                </div>
              </div>
            ) : (
              <Alert kind="info">この申請は対応済みです。</Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
