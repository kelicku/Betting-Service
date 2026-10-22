"use client";

/** 管理：クーポンコード（チケット配布）の発行と一覧。 */

import { useState } from "react";
import { Badge, SearchInput, Select, TableWrap, Toolbar, useAdminList } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Button, Field, Modal, PageTitle, Pagination, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { useMe } from "@/lib/hooks";

type C = { id: number; code: string; kind: "single" | "shared"; tickets: number; max_uses: number; uses: number; expires_at: string | null; is_active: boolean; note: string; batch_id: string | null; created_at: string };
type Form = { kind: "single" | "shared"; tickets: number; count: number; prefix: string; code: string; max_uses: number; expires: string; note: string };
const EMPTY: Form = { kind: "single", tickets: 5, count: 10, prefix: "", code: "", max_uses: 100, expires: "", note: "" };

export default function AdminCoupons() {
  const toast = useToast();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const list = useAdminList<C>("/api/admin/coupons", { kind: "", q: "" }, 50);
  const [form, setForm] = useState<Form | null>(null);
  const [made, setMade] = useState<C[] | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const r = await api<{ items: C[] }>("/admin/coupons", {
        body: {
          kind: form.kind, tickets: form.tickets, note: form.note,
          expires_at: form.expires ? new Date(`${form.expires}T23:59:59+09:00`).toISOString() : null,
          ...(form.kind === "single" ? { count: form.count, prefix: form.prefix } : { code: form.code, max_uses: form.max_uses }),
        },
      });
      setForm(null);
      setMade(r.items);
      list.mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (c: C) => {
    await api(`/admin/coupons/${c.id}/active`, { body: { is_active: !c.is_active } });
    list.mutate();
  };
  const copyAll = () => {
    const text = (made ?? []).map((c) => c.code).join("\n");
    navigator.clipboard?.writeText(text).then(() => toast("コードをコピーしました"), () => toast("コピーできませんでした", "error"));
  };
  const download = () => {
    const rows = ["コード,チケット,種類,メモ", ...(made ?? []).map((c) => `${c.code},${c.tickets},${c.kind === "single" ? "使い捨て" : "先着"},${c.note}`)];
    const url = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "coupons.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageTitle
        en="COUPONS"
        title="クーポンコード"
        sub="会員がマイページでコードを入力すると、すぐにチケットが加算されます。使い捨て型（1 コード 1 回・SNS の DM などで個別に配布）と、先着型（全員共通のあいことば・先着 N 名で自動終了・1 人 1 回）があります。"
        right={isAdmin && <Button onClick={() => setForm({ ...EMPTY })}>クーポンを発行</Button>}
      />
      <Toolbar>
        <Select label="種類" value={list.filters.kind} onChange={(v) => list.set("kind", v)} options={[["", "すべて"], ["single", "使い捨て型"], ["shared", "先着型"]]} />
        <SearchInput value={list.filters.q} onChange={(v) => list.set("q", v)} placeholder="コード・メモで検索" />
      </Toolbar>
      {!list.data ? (
        <Spinner />
      ) : (
        <>
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>コード</th><th>種類</th><th className="text-right">チケット</th><th className="text-right">使用</th><th>有効期限</th><th>メモ</th><th>状態</th><th /></tr></thead>
              <tbody>
                {list.data.items.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-moon/50">まだクーポンはありません</td></tr>}
                {list.data.items.map((c) => (
                  <tr key={c.id}>
                    <td className="font-mono text-sm">{c.code}</td>
                    <td>{c.kind === "single" ? <Badge>使い捨て</Badge> : <Badge tone="info">先着</Badge>}</td>
                    <td className="text-right tabular-nums">{c.tickets}枚</td>
                    <td className="text-right tabular-nums">{fmtNum(c.uses)} / {fmtNum(c.max_uses)}</td>
                    <td className="text-xs">{c.expires_at ? fmtDateTime(c.expires_at) : "なし"}</td>
                    <td className="text-xs text-moon/60">{c.note}</td>
                    <td>{!c.is_active ? <Badge>停止</Badge> : c.uses >= c.max_uses ? <Badge tone="warn">終了</Badge> : <Badge tone="good">有効</Badge>}</td>
                    <td className="text-right">{isAdmin && <Button size="sm" variant="subtle" onClick={() => toggle(c)}>{c.is_active ? "停止" : "再開"}</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination page={list.page} total={list.data.total} perPage={list.perPage} onChange={list.setPage} />
        </>
      )}

      <Modal open={!!form} onClose={() => !busy && setForm(null)} title="クーポンを発行">
        {form && (
          <div className="space-y-3">
            <Field label="種類">
              <select className="field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Form["kind"] })}>
                <option value="single">使い捨て型（1 コード 1 回。個別に配る）</option>
                <option value="shared">先着型（全員共通のあいことば・先着 N 名）</option>
              </select>
            </Field>
            <Field label="配布するチケット（枚）"><input className="field" type="number" min={1} max={10000} value={form.tickets} onChange={(e) => setForm({ ...form, tickets: Number(e.target.value) })} /></Field>
            {form.kind === "single" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="発行する数（最大 1,000）"><input className="field" type="number" min={1} max={1000} value={form.count} onChange={(e) => setForm({ ...form, count: Number(e.target.value) })} /></Field>
                <Field label="コードの先頭の文字（任意・英数字）" hint="例：DM → DM7K3P..."><input className="field font-mono uppercase" maxLength={8} value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value.replace(/[^A-Za-z0-9]/g, "") })} /></Field>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="あいことば（英数字・-・_、4〜32 文字）"><input className="field font-mono uppercase" maxLength={32} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/[^A-Za-z0-9\-_]/g, "") })} placeholder="WAKU-OPEN" /></Field>
                <Field label="先着の人数"><input className="field" type="number" min={1} value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: Number(e.target.value) })} /></Field>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="有効期限（任意・この日の 23:59 まで）"><input className="field" type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} /></Field>
              <Field label="メモ（配布先など・会員には表示されません）"><input className="field" maxLength={100} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)} disabled={busy}>やめる</Button>
              <Button onClick={create} loading={busy} disabled={form.kind === "shared" && form.code.length < 4}>発行する</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!made} onClose={() => setMade(null)} title={`クーポンを発行しました（${made?.length ?? 0}件）`}>
        {made && (
          <div className="space-y-3">
            <textarea className="field h-48 font-mono text-sm" readOnly value={made.map((c) => c.code).join("\n")} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={download}>CSV をダウンロード</Button>
              <Button onClick={copyAll}>すべてコピー</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
