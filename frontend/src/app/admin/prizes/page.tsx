"use client";

import { useState } from "react";
import { Badge, SearchInput, Select, TableWrap, Toolbar, useAdminList } from "@/components/admin/kit";
import { PrizeArt } from "@/components/PrizeCard";
import { useToast } from "@/components/Toast";
import { Button, Field, Modal, PageTitle, Pagination, RarityBadge, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import type { Rarity } from "@/lib/types";

type P = { id: number; name: string; description: string; image_url: string | null; rarity: Rarity; is_exchangeable: boolean; requires_shipping: boolean; reference_value_yen: number | null; is_active: boolean; subtitle: string; is_featured: boolean; featured_order: number; point_value: number };
const EMPTY: Omit<P, "id"> = { name: "", description: "", image_url: null, rarity: "N", is_exchangeable: true, requires_shipping: true, reference_value_yen: null, is_active: true, subtitle: "", is_featured: false, featured_order: 0, point_value: 0 };

export default function AdminPrizes() {
  const l = useAdminList<P>("/api/admin/prizes", { q: "", rarity: "" }, 50);
  const [edit, setEdit] = useState<(Omit<P, "id"> & { id?: number }) | null>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const r = await api<{ url: string }>("/admin/uploads?folder=prizes", { form });
      setEdit((e) => (e ? { ...e, image_url: r.url } : e));
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setUploading(false);
    }
  };
  const save = async () => {
    if (!edit) return;
    const { id, ...body } = edit;
    try {
      await api(id ? `/admin/prizes/${id}` : "/admin/prizes", { method: id ? "PUT" : "POST", body });
      toast("景品を保存しました");
      setEdit(null);
      l.mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  return (
    <div>
      <PageTitle en="PRIZES" title="景品管理" right={isAdmin && <Button onClick={() => setEdit({ ...EMPTY })}>景品を登録</Button>} />
      <Toolbar>
        <SearchInput value={l.filters.q} onChange={(v) => l.set("q", v)} placeholder="景品名で検索" />
        <Select label="レアリティ" value={l.filters.rarity} onChange={(v) => l.set("rarity", v)} options={[["", "すべてのレアリティ"], ["SSR", "SSR"], ["SR", "SR"], ["R", "R"], ["N", "N"]]} />
      </Toolbar>
      {!l.data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr><th>画像</th><th>景品名</th><th>レアリティ</th><th>交換</th><th className="text-right">参考価格</th><th>状態</th><th /></tr>
            </thead>
            <tbody>
              {l.data.items.map((p) => (
                <tr key={p.id}>
                  <td><div className="h-12 w-9 overflow-hidden rounded border border-veil/10"><PrizeArt prize={p} /></div></td>
                  <td><span className="block">{p.name}</span><span className="line-clamp-1 text-xs text-moon/45">{p.description}</span></td>
                  <td><RarityBadge rarity={p.rarity} /></td>
                  <td className="text-xs">{p.is_exchangeable ? (p.requires_shipping ? "配送" : "配送不要") : "交換不可"}</td>
                  <td className="text-right tabular-nums">{p.reference_value_yen != null ? `¥${fmtNum(p.reference_value_yen)}` : "—"}</td>
                  <td className="space-x-1">{p.is_active ? <Badge tone="good">有効</Badge> : <Badge>無効</Badge>}{p.is_featured && <Badge tone="warn">注目</Badge>}</td>
                  <td className="text-right">{isAdmin && <Button size="sm" variant="subtle" onClick={() => setEdit(p)}>編集</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {l.data && <Pagination page={l.page} total={l.data.total} perPage={l.perPage} onChange={l.setPage} />}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "景品を編集" : "景品を登録"} wide>
        {edit && (
          <div className="grid gap-4 md:grid-cols-[10rem_1fr]">
            <div>
              <div className="aspect-[3/4] overflow-hidden rounded-xl border border-gold/30">
                <PrizeArt prize={{ id: 0, name: edit.name, description: "", image_url: edit.image_url, rarity: edit.rarity }} />
              </div>
              <label className="mt-2 block cursor-pointer rounded-lg border border-dashed border-gold/40 px-2 py-2 text-center text-xs text-gold-light hover:bg-gold/10">
                {uploading ? "アップロード中…" : "画像をアップロード"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              <p className="mt-1 text-[10px] text-moon/40">5MB以下。自動で最適化（WebP変換・縮小・位置情報除去）されます。</p>
            </div>
            <div className="space-y-3">
              <Field label="景品名"><input className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="副題（任意）" hint="トップページ「注目の景品」で「— 副題 —」と表示"><input className="field" value={edit.subtitle} maxLength={60} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} /></Field>
              <Field label="説明"><textarea className="field" rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="レアリティ">
                  <select className="field" value={edit.rarity} onChange={(e) => setEdit({ ...edit, rarity: e.target.value as Rarity })}>
                    {["N", "R", "SR", "SSR"].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="参考価格（円）" hint="景品表示法の上限確認用">
                  <input className="field" type="number" min={0} value={edit.reference_value_yen ?? ""} onChange={(e) => setEdit({ ...edit, reference_value_yen: e.target.value ? Number(e.target.value) : null })} />
                </Field>
                <Field label="ポイント景品（pt）" hint="0 より大きくすると、当選したときにこの数のポイントが自動で加算されます（発送・交換申請の対象外）。">
                  <input className="field" type="number" min={0} value={edit.point_value ?? 0} onChange={(e) => setEdit({ ...edit, point_value: Number(e.target.value) || 0 })} />
                </Field>
              </div>
              <Field label="画像 URL"><input className="field" value={edit.image_url ?? ""} onChange={(e) => setEdit({ ...edit, image_url: e.target.value || null })} /></Field>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#D8B976]" checked={edit.is_exchangeable} onChange={(e) => setEdit({ ...edit, is_exchangeable: e.target.checked })} />交換可能</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#D8B976]" checked={edit.requires_shipping} onChange={(e) => setEdit({ ...edit, requires_shipping: e.target.checked })} />配送が必要</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#D8B976]" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />有効</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#D8B976]" checked={edit.is_featured} onChange={(e) => setEdit({ ...edit, is_featured: e.target.checked })} />注目の景品に掲載</label>
                {edit.is_featured && (
                  <label className="flex items-center gap-2">表示順<input type="number" className="field w-20 py-1" value={edit.featured_order} onChange={(e) => setEdit({ ...edit, featured_order: Number(e.target.value) })} /></label>
                )}
              </div>
              <Button onClick={save} disabled={!edit.name.trim()}>保存する</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
