"use client";

import { useState } from "react";
import useSWR from "swr";
import { Badge, TableWrap } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Button, Field, Modal, PageTitle, Spinner } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useMe } from "@/lib/hooks";

type B = { id?: number; tag: string; tag_color: "pink" | "gold" | "purple" | "blue"; title: string; subtitle: string; image_url: string | null; link: string; starts_at: string | null; ends_at: string | null; sort_order: number; is_active: boolean };
const EMPTY: B = { tag: "PICK UP", tag_color: "pink", title: "", subtitle: "", image_url: null, link: "/gacha", starts_at: null, ends_at: null, sort_order: 0, is_active: true };
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(`${v}:00+09:00`).toISOString() : null);

export default function AdminBanners() {
  const { data, mutate } = useSWR<{ items: B[] }>("/api/admin/banners", fetcher);
  const [edit, setEdit] = useState<B | null>(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const r = await api<{ url: string }>("/admin/uploads?folder=gachas", { form });
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
      await api(id ? `/admin/banners/${id}` : "/admin/banners", { method: id ? "PUT" : "POST", body });
      toast("バナーを保存しました");
      setEdit(null);
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  const remove = async (b: B) => {
    if (!b.id || !confirm(`「${b.title}」を削除しますか？`)) return;
    await api(`/admin/banners/${b.id}`, { method: "DELETE" });
    mutate();
  };

  return (
    <div>
      <PageTitle en="BANNERS" title="キャンペーンバナー" sub="トップページのメインビジュアル下に、掲載期間中のバナーが表示順に並びます。" right={isAdmin && <Button onClick={() => setEdit({ ...EMPTY })}>バナーを追加</Button>} />
      {!data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>画像</th><th>タイトル</th><th>ラベル</th><th>リンク先</th><th>掲載期間</th><th>状態</th><th /></tr></thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <td>{b.image_url && <img src={b.image_url} alt="" className="h-10 w-24 rounded object-cover" />}</td>
                  <td><span className="block">{b.title}</span><span className="text-xs text-moon/50">{b.subtitle}</span></td>
                  <td className="text-xs">{b.tag}</td>
                  <td className="text-xs text-moon/60">{b.link}</td>
                  <td className="text-xs text-moon/60">{fmtDateTime(b.starts_at)}〜{fmtDateTime(b.ends_at)}</td>
                  <td>{b.is_active ? <Badge tone="good">掲載</Badge> : <Badge>停止</Badge>}</td>
                  <td className="whitespace-nowrap text-right">
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="subtle" onClick={() => setEdit(b)}>編集</Button>
                        <button className="ml-2 text-xs text-rose-300" onClick={() => remove(b)}>削除</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "バナーを編集" : "バナーを追加"} wide>
        {edit && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {edit.image_url && <img src={edit.image_url} alt="" className="mb-2 aspect-[2.35/1] w-full rounded-lg object-cover" />}
              <label className="inline-block cursor-pointer rounded-lg border border-dashed border-gold/40 px-3 py-2 text-xs text-gold-light hover:bg-gold/10">
                {uploading ? "アップロード中…" : "画像をアップロード（横長 約2.35:1）"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
            </div>
            <Field label="タイトル"><input className="field" value={edit.title} maxLength={60} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="サブタイトル"><input className="field" value={edit.subtitle} maxLength={80} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} /></Field>
            <Field label="ラベル（例：PICK UP / NEW / LAST ONE）"><input className="field" value={edit.tag} maxLength={16} onChange={(e) => setEdit({ ...edit, tag: e.target.value })} /></Field>
            <Field label="ラベルの色">
              <select className="field" value={edit.tag_color} onChange={(e) => setEdit({ ...edit, tag_color: e.target.value as B["tag_color"] })}>
                <option value="pink">ピンク</option><option value="gold">金</option><option value="purple">紫</option><option value="blue">青</option>
              </select>
            </Field>
            <Field label="リンク先（サイト内のパス）"><input className="field" value={edit.link} onChange={(e) => setEdit({ ...edit, link: e.target.value })} /></Field>
            <Field label="表示順"><input className="field" type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
            <Field label="掲載開始（日本時間）"><input className="field" type="datetime-local" value={toLocal(edit.starts_at)} onChange={(e) => setEdit({ ...edit, starts_at: fromLocal(e.target.value) })} /></Field>
            <Field label="掲載終了（日本時間）"><input className="field" type="datetime-local" value={toLocal(edit.ends_at)} onChange={(e) => setEdit({ ...edit, ends_at: fromLocal(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#D8B976]" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />掲載する</label>
            <div className="md:col-span-2"><Button onClick={save} disabled={!edit.title.trim()}>保存する</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
