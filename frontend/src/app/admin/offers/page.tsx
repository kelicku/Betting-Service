"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Badge, Select, TableWrap, Toolbar, useAdminList } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Alert, Button, Field, Modal, PageTitle, Pagination, Spinner, Tabs } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { useMe } from "@/lib/hooks";

type O = { id: number; provider: string; kind: "ad" | "survey" | "video"; external_id: string | null; title: string; description: string; conditions: string; image_url: string | null; url_template: string; reward_tickets: number; estimated_minutes: number | null; per_user_limit: number; is_active: boolean; is_test: boolean; starts_at: string | null; ends_at: string | null; sort_order: number; conversions: number; tickets_paid: number };
type M = { id: number; code: string; kind: "campaign" | "achievement"; title: string; description: string; reward_tickets: number; condition_type: string; condition_value: number; starts_at: string | null; ends_at: string | null; is_active: boolean };
const COND: Record<string, string> = { none: "参加のみ", total_draws: "累計抽選回数", email_verified: "メール確認", first_exchange: "初回の発送申請", login_days: "ログインボーナス日数" };

function OffersTab({ isAdmin }: { isAdmin: boolean }) {
  const { data, mutate } = useSWR<{ providers: string[]; items: O[] }>("/api/admin/offers", fetcher);
  const [edit, setEdit] = useState<Partial<O> | null>(null);
  const toast = useToast();
  const save = async () => {
    if (!edit) return;
    const { id, conversions: _c, tickets_paid: _t, is_test: _i, ...body } = edit as O; // eslint-disable-line @typescript-eslint/no-unused-vars
    try {
      await api(id ? `/admin/offers/${id}` : "/admin/offers", { method: id ? "PUT" : "POST", body });
      toast("案件を保存しました");
      setEdit(null);
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  if (!data) return <Spinner />;
  return (
    <>
      {isAdmin && (
        <div className="mb-3 text-right">
          <Button size="sm" onClick={() => setEdit({ provider: data.providers[0], kind: "ad", title: "", description: "", conditions: "", url_template: "https://", reward_tickets: 1, per_user_limit: 1, is_active: true, sort_order: 0 })}>案件を追加</Button>
        </div>
      )}
      <TableWrap>
        <table className="table-base">
          <thead><tr><th>案件</th><th>事業者</th><th>種類</th><th className="text-right">報酬</th><th className="text-right">上限/人</th><th className="text-right">成果数</th><th className="text-right">付与合計</th><th>状態</th><th /></tr></thead>
          <tbody>
            {data.items.map((o) => (
              <tr key={o.id}>
                <td className="max-w-xs"><span className="block truncate">{o.title}</span><span className="block truncate text-xs text-moon/40">{o.url_template}</span></td>
                <td className="text-xs">{o.provider} {o.is_test && <Badge tone="info">テスト</Badge>}</td>
                <td className="text-xs">{{ video: "動画", ad: "広告", survey: "アンケート" }[o.kind]}</td>
                <td className="text-right tabular-nums">{o.reward_tickets}</td>
                <td className="text-right tabular-nums">{o.per_user_limit}</td>
                <td className="text-right tabular-nums">{fmtNum(o.conversions)}</td>
                <td className="text-right tabular-nums">{fmtNum(o.tickets_paid)}</td>
                <td>{o.is_active ? <Badge tone="good">掲載中</Badge> : <Badge>停止</Badge>}</td>
                <td className="text-right">{isAdmin && <Button size="sm" variant="subtle" onClick={() => setEdit(o)}>編集</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "案件を編集" : "案件を追加"} wide>
        {edit && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="事業者" hint="mock は開発用の模擬事業者（本番では無効）">
              <select className="field" value={edit.provider} onChange={(e) => setEdit({ ...edit, provider: e.target.value })}>
                {data.providers.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="種類">
              <select className="field" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as O["kind"] })}>
                <option value="video">動画リワード広告（1日の視聴上限あり）</option><option value="ad">広告・アプリ導入など</option><option value="survey">アンケート</option>
              </select>
            </Field>
            <div className="md:col-span-2"><Field label="案件名"><input className="field" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field></div>
            <div className="md:col-span-2"><Field label="遷移先 URL" hint="{click_id} が成果照合用 ID に置き換わります（必須）。{user_ref} も使用可"><input className="field" value={edit.url_template} onChange={(e) => setEdit({ ...edit, url_template: e.target.value })} /></Field></div>
            <Field label="説明"><textarea className="field" rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="成果条件"><textarea className="field" rows={2} value={edit.conditions} onChange={(e) => setEdit({ ...edit, conditions: e.target.value })} /></Field>
            <Field label="報酬チケット（枚）"><input className="field" type="number" min={1} value={edit.reward_tickets} onChange={(e) => setEdit({ ...edit, reward_tickets: Number(e.target.value) })} /></Field>
            <Field label="1人あたりの上限回数"><input className="field" type="number" min={1} value={edit.per_user_limit} onChange={(e) => setEdit({ ...edit, per_user_limit: Number(e.target.value) })} /></Field>
            <Field label="所要時間（分）"><input className="field" type="number" min={0} value={edit.estimated_minutes ?? ""} onChange={(e) => setEdit({ ...edit, estimated_minutes: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="事業者側の案件ID（任意）"><input className="field" value={edit.external_id ?? ""} onChange={(e) => setEdit({ ...edit, external_id: e.target.value || null })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#D8B976]" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />掲載する</label>
            <div className="md:col-span-2"><Button onClick={save}>保存する</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}

function ConversionsTab() {
  const l = useAdminList<{ id: number; provider: string; external_conversion_id: string; user_id: number | null; email: string | null; offer_title: string | null; status: string; reject_reason: string | null; reward_tickets: number; is_test: boolean; duplicate_count: number; received_at: string }>("/api/admin/conversions", { status: "", include_test: "true" }, 50);
  return (
    <>
      <Toolbar>
        <Select label="結果" value={l.filters.status} onChange={(v) => l.set("status", v)} options={[["", "すべての結果"], ["credited", "付与済み"], ["rejected", "不承認"]]} />
        <Select label="テスト" value={l.filters.include_test} onChange={(v) => l.set("include_test", v)} options={[["true", "テストを含む"], ["false", "本番のみ"]]} />
      </Toolbar>
      {!l.data ? <Spinner /> : (
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>受信日時</th><th>事業者 / 成果ID</th><th>案件</th><th>ユーザー</th><th>結果</th><th className="text-right">付与</th><th className="text-right">重複通知</th></tr></thead>
            <tbody>
              {l.data.items.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap text-xs text-moon/60">{fmtDateTime(c.received_at)}</td>
                  <td className="text-xs">{c.provider} {c.is_test && <Badge tone="info">テスト</Badge>}<span className="block font-mono text-moon/40">{c.external_conversion_id}</span></td>
                  <td className="text-xs">{c.offer_title ?? "—"}</td>
                  <td className="text-xs">{c.user_id ? <Link className="hover:text-gold-light" href={`/admin/users/${c.user_id}`}>{c.email}</Link> : "—"}</td>
                  <td>{c.status === "credited" ? <Badge tone="good">付与</Badge> : <Badge tone="bad">不承認：{c.reject_reason}</Badge>}</td>
                  <td className="text-right tabular-nums">{c.reward_tickets}</td>
                  <td className="text-right tabular-nums">{c.duplicate_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {l.data && <Pagination page={l.page} total={l.data.total} perPage={l.perPage} onChange={l.setPage} />}
    </>
  );
}

function PostbackLogsTab() {
  const l = useAdminList<{ id: number; provider: string; outcome: string; detail: string | null; ip: string | null; params: Record<string, string>; received_at: string }>("/api/admin/postback-logs", { outcome: "" }, 50);
  return (
    <>
      <Toolbar>
        <Select label="結果" value={l.filters.outcome} onChange={(v) => l.set("outcome", v)} options={[["", "すべて"], ["credited", "付与"], ["duplicate", "重複"], ["bad_signature", "署名不正"], ["stale", "時刻不正"], ["unknown_click", "クリック不明"], ["ip_not_allowed", "IP拒否"]]} />
      </Toolbar>
      {!l.data ? <Spinner /> : (
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>受信日時</th><th>事業者</th><th>結果</th><th>IP</th><th>パラメータ（署名を除く）</th></tr></thead>
            <tbody>
              {l.data.items.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap text-xs text-moon/60">{fmtDateTime(p.received_at)}</td>
                  <td className="text-xs">{p.provider}</td>
                  <td><Badge tone={p.outcome === "credited" ? "good" : p.outcome === "duplicate" || p.outcome === "pending_ignored" ? "default" : "bad"}>{p.outcome}</Badge></td>
                  <td className="font-mono text-xs text-moon/50">{p.ip}</td>
                  <td className="max-w-md truncate font-mono text-[11px] text-moon/50">{JSON.stringify(p.params)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {l.data && <Pagination page={l.page} total={l.data.total} perPage={l.perPage} onChange={l.setPage} />}
    </>
  );
}

function MissionsTab({ isAdmin }: { isAdmin: boolean }) {
  const { data, mutate } = useSWR<{ items: M[] }>("/api/admin/missions", fetcher);
  const [edit, setEdit] = useState<Partial<M> | null>(null);
  const toast = useToast();
  const save = async () => {
    if (!edit) return;
    const { id, ...body } = edit;
    try {
      await api(id ? `/admin/missions/${id}` : "/admin/missions", { method: id ? "PUT" : "POST", body });
      toast("保存しました");
      setEdit(null);
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  if (!data) return <Spinner />;
  return (
    <>
      {isAdmin && <div className="mb-3 text-right"><Button size="sm" onClick={() => setEdit({ code: "", kind: "campaign", title: "", description: "", reward_tickets: 1, condition_type: "none", condition_value: 0, is_active: true })}>ミッションを追加</Button></div>}
      <TableWrap>
        <table className="table-base">
          <thead><tr><th>コード</th><th>名称</th><th>種類</th><th>条件</th><th className="text-right">報酬</th><th>期限</th><th>状態</th><th /></tr></thead>
          <tbody>
            {data.items.map((m) => (
              <tr key={m.id}>
                <td className="font-mono text-xs">{m.code}</td>
                <td>{m.title}</td>
                <td className="text-xs">{m.kind === "campaign" ? "キャンペーン" : "条件達成"}</td>
                <td className="text-xs">{COND[m.condition_type]}{m.condition_value ? ` ≥ ${m.condition_value}` : ""}</td>
                <td className="text-right tabular-nums">{m.reward_tickets}</td>
                <td className="text-xs text-moon/55">{fmtDateTime(m.ends_at)}</td>
                <td>{m.is_active ? <Badge tone="good">有効</Badge> : <Badge>無効</Badge>}</td>
                <td className="text-right">{isAdmin && <Button size="sm" variant="subtle" onClick={() => setEdit(m)}>編集</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="ミッション" wide>
        {edit && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="コード（半角英小文字）"><input className="field" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <Field label="名称"><input className="field" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="種類"><select className="field" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as M["kind"] })}><option value="campaign">キャンペーン</option><option value="achievement">条件達成</option></select></Field>
            <Field label="報酬チケット（枚）"><input className="field" type="number" min={1} value={edit.reward_tickets} onChange={(e) => setEdit({ ...edit, reward_tickets: Number(e.target.value) })} /></Field>
            <Field label="達成条件"><select className="field" value={edit.condition_type} onChange={(e) => setEdit({ ...edit, condition_type: e.target.value })}>{Object.entries(COND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="条件の値"><input className="field" type="number" min={0} value={edit.condition_value} onChange={(e) => setEdit({ ...edit, condition_value: Number(e.target.value) })} /></Field>
            <div className="md:col-span-2"><Field label="説明"><input className="field" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#D8B976]" checked={!!edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />有効</label>
            <div className="md:col-span-2"><Button onClick={save}>保存する</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function AdminOffers() {
  const [tab, setTab] = useState<"offers" | "conversions" | "missions" | "logs">("offers");
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  return (
    <div>
      <PageTitle en="OFFERS" title="広告・アンケート管理" />
      <div className="mb-4">
        <Alert kind="info">
          成果通知 URL：<code className="font-mono">https://（公開ドメイン）/api/postbacks/（事業者名）</code>。署名（HMAC-SHA256）・時刻・click_id の照合に成功した成果のみポイントを付与し、同じ成果IDの重複通知は付与しません。
        </Alert>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "offers", label: "案件" },
          { value: "conversions", label: "成果履歴" },
          { value: "missions", label: "ミッション・キャンペーン" },
          ...(isAdmin ? [{ value: "logs" as const, label: "成果通知ログ" }] : []),
        ]}
      />
      {tab === "offers" && <OffersTab isAdmin={isAdmin} />}
      {tab === "conversions" && <ConversionsTab />}
      {tab === "missions" && <MissionsTab isAdmin={isAdmin} />}
      {tab === "logs" && <PostbackLogsTab />}
    </div>
  );
}
