"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { Badge, Select, TableWrap, Toolbar, useAdminList } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Button, Field, Modal, PageTitle, Pagination, Panel, Spinner, Tabs } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useMe } from "@/lib/hooks";

type SettingsRes = { values: Record<string, number | boolean | string>; descriptions: Record<string, string> };

function SystemTab({ isAdmin }: { isAdmin: boolean }) {
  const { data, mutate } = useSWR<SettingsRes>("/api/admin/settings", fetcher);
  const [v, setV] = useState<Record<string, number | boolean | string>>({});
  const toast = useToast();
  useEffect(() => {
    if (data) setV(data.values);
  }, [data]);
  if (!data) return <Spinner />;
  const save = async () => {
    try {
      await api("/admin/settings", { method: "PUT", body: v });
      toast("設定を保存しました");
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  return (
    <Panel className="space-y-4">
      {Object.entries(data.descriptions).map(([k, desc]) => {
        const val = v[k];
        return (
          <div key={k} className="grid items-center gap-2 border-b border-veil/5 pb-4 md:grid-cols-[1fr_16rem]">
            <div>
              <p className="text-sm">{desc}</p>
              <p className="font-mono text-[11px] text-moon/40">{k}</p>
            </div>
            {typeof val === "boolean" ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-[#D8B976]" disabled={!isAdmin} checked={val} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
                {val ? "有効" : "無効"}
              </label>
            ) : typeof val === "number" ? (
              <input className="field" type="number" min={0} disabled={!isAdmin} value={val} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
            ) : (
              <input className="field" disabled={!isAdmin} value={String(val ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
            )}
          </div>
        );
      })}
      {isAdmin && <Button onClick={save}>保存する</Button>}
    </Panel>
  );
}

type Ann = { id: number; title: string; body: string; category: string; is_published: boolean; published_at: string | null };

function AnnouncementsTab() {
  const { data, mutate } = useSWR<{ items: Ann[] }>("/api/admin/announcements", fetcher);
  const [edit, setEdit] = useState<Partial<Ann> | null>(null);
  const toast = useToast();
  const save = async () => {
    if (!edit) return;
    const { id, ...body } = edit;
    try {
      await api(id ? `/admin/announcements/${id}` : "/admin/announcements", { method: id ? "PUT" : "POST", body });
      toast("お知らせを保存しました");
      setEdit(null);
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  if (!data) return <Spinner />;
  return (
    <>
      <div className="mb-3 text-right"><Button size="sm" onClick={() => setEdit({ title: "", body: "", category: "info", is_published: false })}>お知らせを作成</Button></div>
      <TableWrap>
        <table className="table-base">
          <thead><tr><th>タイトル</th><th>区分</th><th>公開</th><th>公開日時</th><th /></tr></thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td className="text-xs">{a.category}</td>
                <td>{a.is_published ? <Badge tone="good">公開</Badge> : <Badge>下書き</Badge>}</td>
                <td className="text-xs text-moon/55">{fmtDateTime(a.published_at)}</td>
                <td className="text-right"><Button size="sm" variant="subtle" onClick={() => setEdit(a)}>編集</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="お知らせ" wide>
        {edit && (
          <div className="space-y-3">
            <Field label="タイトル"><input className="field" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="区分">
              <select className="field" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                <option value="info">お知らせ</option><option value="campaign">キャンペーン</option><option value="maintenance">メンテナンス</option><option value="new_gacha">新ガチャ</option><option value="important">重要</option>
              </select>
            </Field>
            <Field label="本文"><textarea className="field" rows={6} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#D8B976]" checked={!!edit.is_published} onChange={(e) => setEdit({ ...edit, is_published: e.target.checked })} />公開する</label>
            <Button onClick={save} disabled={!edit.title?.trim() || !edit.body?.trim()}>保存する</Button>
          </div>
        )}
      </Modal>
    </>
  );
}

type C = { id: number; user_id: number | null; name: string; email: string; category: string; body: string; status: string; created_at: string };

function ContactsTab() {
  const l = useAdminList<C>("/api/admin/contacts", { status: "open" });
  const toast = useToast();
  const setStatus = async (id: number, status: string) => {
    try {
      await api(`/admin/contacts/${id}/status`, { body: { status } });
      l.mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  return (
    <>
      <Toolbar>
        <Select label="状態" value={l.filters.status} onChange={(v) => l.set("status", v)} options={[["", "すべて"], ["open", "未対応"], ["in_progress", "対応中"], ["closed", "完了"]]} />
      </Toolbar>
      {!l.data ? <Spinner /> : (
        <div className="space-y-3">
          {l.data.items.map((c) => (
            <Panel key={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-bold">{c.name}</span> <span className="text-moon/50">&lt;{c.email}&gt;</span> <Badge>{c.category}</Badge>
                  {c.user_id && (
                    <Link href={`/admin/messages?user=${c.user_id}`} className="ml-2 text-xs text-gold-light hover:underline">
                      会員にメッセージで返信 →
                    </Link>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-moon/45">{fmtDateTime(c.created_at)}</span>
                  <select className="field w-auto py-1 text-xs" value={c.status} onChange={(e) => setStatus(c.id, e.target.value)} aria-label="対応状況">
                    <option value="open">未対応</option><option value="in_progress">対応中</option><option value="closed">完了</option>
                  </select>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-moon/75">{c.body}</p>
            </Panel>
          ))}
          {l.data.items.length === 0 && <p className="py-8 text-center text-moon/50">お問い合わせはありません</p>}
        </div>
      )}
      {l.data && <Pagination page={l.page} total={l.data.total} perPage={l.perPage} onChange={l.setPage} />}
    </>
  );
}

function NewsletterTab() {
  const l = useAdminList<{ id: number; email: string; user_id: number | null; created_at: string }>("/api/admin/newsletter", {}, 50);
  if (!l.data) return <Spinner />;
  return (
    <>
      <p className="mb-3 text-sm text-moon/60">フッターの「最新情報を受け取る」から登録したメールアドレス（{l.data.total}件）。</p>
      <TableWrap>
        <table className="table-base">
          <thead><tr><th>メールアドレス</th><th>会員</th><th>登録日時</th></tr></thead>
          <tbody>
            {l.data.items.map((n) => (
              <tr key={n.id}><td>{n.email}</td><td className="text-xs">{n.user_id ? `#${n.user_id}` : "—"}</td><td className="text-xs text-moon/60">{fmtDateTime(n.created_at)}</td></tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Pagination page={l.page} total={l.data.total} perPage={l.perPage} onChange={l.setPage} />
    </>
  );
}

function Content() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"system" | "announcements" | "contacts" | "newsletter">((sp.get("tab") as "contacts") ?? "system");
  const { me } = useMe();
  return (
    <div>
      <PageTitle en="SETTINGS" title="システム設定" />
      <Tabs value={tab} onChange={setTab} items={[{ value: "system", label: "システム設定" }, { value: "announcements", label: "お知らせ配信" }, { value: "contacts", label: "お問い合わせ" }, { value: "newsletter", label: "メール登録者" }]} />
      {tab === "system" && <SystemTab isAdmin={me?.role === "admin"} />}
      {tab === "announcements" && <AnnouncementsTab />}
      {tab === "contacts" && <ContactsTab />}
      {tab === "newsletter" && <NewsletterTab />}
    </div>
  );
}

export default function AdminSettings() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
