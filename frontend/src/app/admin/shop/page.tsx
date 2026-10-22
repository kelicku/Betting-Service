"use client";

/** 管理：ポイント交換の景品（デジタルギフト・発送する景品）と、ギフトコード在庫の登録。 */

import { useState } from "react";
import useSWR from "swr";
import { Badge, TableWrap } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Alert, Button, Field, Modal, PageTitle, Spinner } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { useMe } from "@/lib/hooks";

type Item = {
  id?: number; name: string; brand: string; description: string; image_url: string | null; kind: "digital_code" | "shipping";
  point_cost: number; face_value_yen: number | null; stock_total: number | null; stock_remaining?: number | null;
  per_user_limit: number | null; is_active: boolean; sort_order: number; codes_available?: number; orders_pending?: number;
};
const EMPTY: Item = { name: "", brand: "デジコ", description: "", image_url: null, kind: "digital_code", point_cost: 5000, face_value_yen: 500, stock_total: null, per_user_limit: null, is_active: true, sort_order: 0 };
const num = (v: string) => (v === "" ? null : Number(v));

export default function AdminShop() {
  const { data, mutate } = useSWR<{ items: Item[] }>("/api/admin/shop/items", fetcher);
  const { data: cfg } = useSWR<{ demo_login: boolean }>("/api/config", fetcher);
  const [edit, setEdit] = useState<Item | null>(null);
  const [codesFor, setCodesFor] = useState<Item | null>(null);
  const [codes, setCodes] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await api<{ url: string }>("/admin/uploads?folder=prizes", { form });
      setEdit((e) => (e ? { ...e, image_url: r.url } : e));
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  const save = async () => {
    if (!edit) return;
    const { id, codes_available: _c, orders_pending: _o, stock_remaining: _s, ...body } = edit; // eslint-disable-line @typescript-eslint/no-unused-vars
    try {
      await api(id ? `/admin/shop/items/${id}` : "/admin/shop/items", { method: id ? "PUT" : "POST", body });
      toast("景品を保存しました");
      setEdit(null);
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  const remove = async (it: Item) => {
    if (!it.id || !confirm(`「${it.name}」を削除しますか？（交換申請がある場合は非公開になります）`)) return;
    const r = await api<{ deleted: boolean }>(`/admin/shop/items/${it.id}`, { method: "DELETE" });
    toast(r.deleted ? "削除しました" : "交換申請があるため非公開にしました");
    mutate();
  };
  const sendCodes = async () => {
    if (!codesFor?.id) return;
    setBusy(true);
    try {
      const r = await api<{ added: number; skipped_duplicates: number; delivered_to_waiting: number }>(`/admin/shop/items/${codesFor.id}/codes`, {
        body: { codes, expires_on: expires || null },
      });
      toast(`${r.added}件を登録しました（重複 ${r.skipped_duplicates}件は除外）。受付中の申請 ${r.delivered_to_waiting}件にお渡ししました。`);
      setCodesFor(null);
      setCodes("");
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageTitle
        en="POINT EXCHANGE"
        title="ポイント交換の景品・ギフトコード"
        sub="会員がポイントで交換できる景品です。デジタルギフトは、ギフトコードを登録しておくと交換時にすぐお渡しされます（在庫がない場合は「ポイント交換の申請」から手動でお渡し）。"
        right={isAdmin && <Button onClick={() => setEdit({ ...EMPTY })}>景品を追加</Button>}
      />
      {cfg?.demo_login && (
        <div className="mb-4">
          <Alert kind="warn">
            この環境では「ワンクリックでログイン」（お試しアカウント）が有効です。誰でも何度でもお試しアカウントを作れるため、
            <strong>本物のギフトコードは登録しないでください</strong>（テスト用のコードのみ）。本番環境では自動で無効になります。
          </Alert>
        </div>
      )}
      {!data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>景品</th><th>種類</th><th className="text-right">必要pt</th><th className="text-right">在庫</th><th className="text-right">コード在庫</th><th className="text-right">対応待ち</th><th>状態</th><th /></tr></thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <span className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {it.image_url && <img src={it.image_url} alt="" className="h-9 w-12 rounded object-contain" />}
                      <span><span className="block font-bold">{it.name}</span><span className="text-xs text-moon/50">{it.brand}{it.face_value_yen != null && `・額面 ${fmtNum(it.face_value_yen)}円`}</span></span>
                    </span>
                  </td>
                  <td>{it.kind === "digital_code" ? <Badge tone="info">デジタルギフト</Badge> : <Badge>発送</Badge>}</td>
                  <td className="text-right tabular-nums">{fmtNum(it.point_cost)}</td>
                  <td className="text-right tabular-nums">{it.stock_remaining == null ? "無制限" : `${fmtNum(it.stock_remaining)} / ${fmtNum(it.stock_total ?? 0)}`}</td>
                  <td className="text-right tabular-nums">{it.kind === "digital_code" ? (it.codes_available ? fmtNum(it.codes_available) : <Badge tone="warn">0</Badge>) : "—"}</td>
                  <td className="text-right tabular-nums">{it.orders_pending ? <Badge tone="warn">{it.orders_pending}</Badge> : 0}</td>
                  <td>{it.is_active ? <Badge tone="good">公開</Badge> : <Badge>非公開</Badge>}</td>
                  <td className="whitespace-nowrap text-right">
                    {isAdmin && (
                      <>
                        {it.kind === "digital_code" && <Button size="sm" variant="ghost" onClick={() => { setCodesFor(it); setCodes(""); setExpires(""); }}>コード登録</Button>}
                        <Button size="sm" variant="subtle" className="ml-1" onClick={() => setEdit(it)}>編集</Button>
                        <button className="ml-2 text-xs text-rose-500" onClick={() => remove(it)}>削除</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "景品を編集" : "景品を追加"}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="景品名"><input className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="ブランド（例：デジコ）"><input className="field" value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} /></Field>
            <Field label="種類">
              <select className="field" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Item["kind"] })}>
                <option value="digital_code">デジタルギフト（コードをお渡し）</option>
                <option value="shipping">発送する景品</option>
              </select>
            </Field>
            <Field label="必要ポイント"><input className="field" type="number" min={1} value={edit.point_cost} onChange={(e) => setEdit({ ...edit, point_cost: Number(e.target.value) })} /></Field>
            <Field label="額面（円・任意）"><input className="field" type="number" min={0} value={edit.face_value_yen ?? ""} onChange={(e) => setEdit({ ...edit, face_value_yen: num(e.target.value) })} /></Field>
            <Field label="在庫数（空欄で無制限）"><input className="field" type="number" min={0} value={edit.stock_total ?? ""} onChange={(e) => setEdit({ ...edit, stock_total: num(e.target.value) })} /></Field>
            <Field label="1人あたりの交換上限（空欄で無制限）"><input className="field" type="number" min={1} value={edit.per_user_limit ?? ""} onChange={(e) => setEdit({ ...edit, per_user_limit: num(e.target.value) })} /></Field>
            <Field label="表示順"><input className="field" type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
            <div className="sm:col-span-2">
              <Field label="説明"><textarea className="field" rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {edit.image_url && <img src={edit.image_url} alt="" className="h-12 w-16 rounded object-contain" />}
              <label className="cursor-pointer rounded-lg border-2 border-dashed border-gold/40 px-3 py-2 text-sm text-gold-light">
                画像をアップロード
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              <label className="ml-auto flex items-center gap-2 text-sm">
                <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="accent-[#ff3b7f]" />
                公開する
              </label>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="ghost" onClick={() => setEdit(null)}>やめる</Button>
              <Button onClick={save}>保存する</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!codesFor} onClose={() => !busy && setCodesFor(null)} title="ギフトコードの登録">
        {codesFor && (
          <div className="space-y-3">
            {cfg?.demo_login && <Alert kind="warn">お試しログインが有効な環境です。本物のギフトコードは登録しないでください。</Alert>}
            <p className="text-sm text-moon/70">「{codesFor.name}」のギフトコードを 1 行に 1 件ずつ貼り付けてください（最大 5,000 件）。重複は自動で除外され、受付中の申請があれば古い順にお渡しします。コードは暗号化して保存され、運営画面には表示されません。</p>
            <textarea className="field font-mono text-sm" rows={8} value={codes} onChange={(e) => setCodes(e.target.value)} placeholder={"XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY"} />
            <Field label="有効期限（任意）"><input className="field" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCodesFor(null)} disabled={busy}>やめる</Button>
              <Button onClick={sendCodes} loading={busy} disabled={!codes.trim()}>登録する（{codes.split("\n").filter((l) => l.trim()).length}件）</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
