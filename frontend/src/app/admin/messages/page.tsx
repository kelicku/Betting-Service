"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { Badge, TableWrap, useAdminList } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Alert, Button, Field, Modal, PageTitle, Pagination, Panel, Spinner } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { useMe } from "@/lib/hooks";

type Target = "users" | "all" | "verified";
type Picked = { id: number; email: string; display_name: string };
type Hist = { id: number; target_label: string; target_user_ids: number[]; title: string; body: string; link: string | null; send_email: boolean; recipient_count: number; email_count: number; created_at: string; sender_email: string | null };

const LINKS: [string, string][] = [
  ["", "リンクなし"],
  ["/gacha", "ガチャ一覧"],
  ["/earn", "チケットを獲得する"],
  ["/shop", "ポイント交換"],
  ["/invite", "友達紹介"],
  ["/prizes", "獲得した景品"],
  ["/exchanges", "景品交換履歴"],
  ["/tickets", "チケットの履歴"],
  ["/points", "ポイントの履歴"],
  ["/mypage", "マイページ"],
];

function UserPicker({ picked, onAdd, onRemove }: { picked: Picked[]; onAdd: (u: Picked) => void; onRemove: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const { data } = useSWR<{ items: Picked[] }>(term ? `/api/admin/users?q=${encodeURIComponent(term)}&per_page=8` : null, fetcher);
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q.trim());
        }}
      >
        <input className="field py-2 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="メールアドレス・ニックネーム・会員IDで検索" aria-label="会員を検索" />
        <Button type="submit" size="sm" variant="ghost">検索</Button>
      </form>
      {term && data && (
        <ul className="max-h-48 overflow-y-auto rounded-xl border border-veil/10">
          {data.items.length === 0 && <li className="px-3 py-2 text-sm text-moon/50">該当する会員がいません</li>}
          {data.items.map((u) => {
            const on = picked.some((p) => p.id === u.id);
            return (
              <li key={u.id} className="flex items-center justify-between gap-2 border-b border-veil/5 px-3 py-2 text-sm last:border-0">
                <span className="min-w-0 truncate">
                  #{u.id} {u.display_name} <span className="text-moon/45">{u.email}</span>
                </span>
                <button type="button" disabled={on} onClick={() => onAdd(u)} className="shrink-0 text-xs text-gold-light hover:underline disabled:text-moon/35">
                  {on ? "追加済み" : "追加"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        {picked.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs text-gold-light">
            #{p.id} {p.display_name}
            <button type="button" onClick={() => onRemove(p.id)} aria-label={`${p.display_name}を外す`} className="ml-0.5 text-moon/60 hover:text-moon">×</button>
          </span>
        ))}
        {picked.length === 0 && <span className="text-xs text-moon/45">送信先の会員を追加してください</span>}
      </div>
    </div>
  );
}

function Content() {
  const sp = useSearchParams();
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const toast = useToast();
  const [target, setTarget] = useState<Target>("users");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const hist = useAdminList<Hist>("/api/admin/messages", {}, 20);
  const [detail, setDetail] = useState<Hist | null>(null);

  // ユーザー詳細の「メッセージを送る」から来た場合は宛先を設定
  const preset = sp.get("user");
  const { data: presetUser } = useSWR<Picked>(preset ? `/api/admin/users/${preset}` : null, fetcher);
  useEffect(() => {
    if (presetUser) setPicked((p) => (p.some((x) => x.id === presetUser.id) ? p : [...p, { id: presetUser.id, email: presetUser.email, display_name: presetUser.display_name }]));
  }, [presetUser]);

  const ids = picked.map((p) => p.id).join(",");
  const { data: count } = useSWR<{ count: number; email_count: number }>(`/api/admin/messages/recipients?target_type=${target}&user_ids=${ids}`, fetcher);
  const ready = title.trim() && body.trim() && (target !== "users" || picked.length > 0) && (count?.count ?? 0) > 0;

  const send = async () => {
    setSending(true);
    try {
      const r = await api<{ recipient_count: number; email_count: number }>("/admin/messages", {
        body: { target_type: target, user_ids: picked.map((p) => p.id), title, body, link: link || null, send_email: sendEmail },
      });
      toast(`${fmtNum(r.recipient_count)}名にメッセージを送信しました${r.email_count ? `（メール ${fmtNum(r.email_count)}通）` : ""}`);
      setConfirm(false);
      setTitle("");
      setBody("");
      setLink("");
      setPicked([]);
      hist.mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageTitle en="MESSAGES" title="メッセージ配信" sub="会員のお知らせ欄（ベルのアイコン）に届きます。必要に応じてメールでも送信できます。" />
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel className="space-y-5">
          <fieldset>
            <legend className="label">送信先</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["users", "指定した会員", "個別の連絡・お問い合わせへの返信"],
                  ["verified", "メール確認済みの会員", "キャンペーンなどのお知らせ"],
                  ["all", "全会員", "メンテナンス・重要なお知らせ"],
                ] as [Target, string, string][]
              ).map(([v, t, d]) => {
                const locked = v !== "users" && !isAdmin;
                return (
                  <label key={v} className={"cursor-pointer rounded-xl border p-3 transition " + (target === v ? "border-gold/60 bg-gold/10" : "border-veil/10 hover:border-veil/25") + (locked ? " cursor-not-allowed opacity-40" : "")}>
                    <input type="radio" name="target" className="sr-only" disabled={locked} checked={target === v} onChange={() => setTarget(v)} />
                    <span className="block text-sm font-bold">{t}</span>
                    <span className="mt-0.5 block text-[11px] text-moon/50">{locked ? "管理者のみ" : d}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {target === "users" && (
            <UserPicker picked={picked} onAdd={(u) => setPicked((p) => [...p, u])} onRemove={(id) => setPicked((p) => p.filter((x) => x.id !== id))} />
          )}
          <Field label="件名">
            <input className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="例：景品発送についてのご連絡" />
          </Field>
          <Field label="本文" hint={`${body.length} / 4000文字`}>
            <textarea className="field" rows={7} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Field label="リンク先（任意）" hint="お知らせをタップしたときに開くページ">
            <select className="field" value={link} onChange={(e) => setLink(e.target.value)}>
              {LINKS.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-start gap-2 text-sm text-moon/80">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#D8B976]" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            <span>
              メールでも送信する
              <span className="block text-xs text-moon/45">メールアドレス確認済みの会員にのみ送信されます（お試しアカウントには送信されません）。</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-veil/[0.04] px-4 py-3 text-sm">
            <span>
              送信対象：<strong className="font-display text-lg text-gold-light">{fmtNum(count?.count ?? 0)}</strong> 名
              {sendEmail && <span className="ml-2 text-moon/55">（メール {fmtNum(count?.email_count ?? 0)}通）</span>}
            </span>
            <Button disabled={!ready} onClick={() => setConfirm(true)}>
              内容を確認して送信
            </Button>
          </div>
          <p className="text-xs text-moon/45">利用停止中の会員には送信されません。送信したメッセージは取り消せません。送信内容は操作履歴に記録されます。</p>
        </Panel>

        <div>
          <p className="mb-2 font-serif font-bold text-gold-light">プレビュー（会員のお知らせ欄）</p>
          <Panel>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blush" aria-hidden />
              <Badge tone="warn">運営からのメッセージ</Badge>
            </div>
            <p className="mt-2 font-bold">{title || "件名"}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-moon/65">{body || "本文がここに表示されます。"}</p>
            {link && <p className="mt-2 text-xs text-gold-light">→ {LINKS.find(([v]) => v === link)?.[1]}を開く</p>}
          </Panel>
        </div>
      </div>

      <h2 className="mb-2 mt-8 font-serif font-bold text-gold-light">配信履歴</h2>
      {!hist.data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr><th>送信日時</th><th>件名</th><th>送信先</th><th className="text-right">人数</th><th className="text-right">メール</th><th>送信者</th></tr>
            </thead>
            <tbody>
              {hist.data.items.map((m) => (
                <tr key={m.id} className="cursor-pointer" onClick={() => setDetail(m)}>
                  <td className="whitespace-nowrap text-xs text-moon/60">{fmtDateTime(m.created_at)}</td>
                  <td className="max-w-xs truncate">{m.title}</td>
                  <td className="text-xs">
                    {m.target_label}
                    {m.target_user_ids.length > 0 && (
                      <span className="ml-1 text-moon/45">
                        （{m.target_user_ids.slice(0, 3).map((id) => (
                          <Link key={id} href={`/admin/users/${id}`} className="mr-1 hover:text-gold-light" onClick={(e) => e.stopPropagation()}>#{id}</Link>
                        ))}
                        {m.target_user_ids.length > 3 && `他${m.target_user_ids.length - 3}名`}）
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{fmtNum(m.recipient_count)}</td>
                  <td className="text-right tabular-nums">{m.send_email ? fmtNum(m.email_count) : "—"}</td>
                  <td className="text-xs text-moon/55">{m.sender_email}</td>
                </tr>
              ))}
              {hist.data.items.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-moon/50">まだメッセージを送信していません</td></tr>}
            </tbody>
          </table>
        </TableWrap>
      )}
      {hist.data && <Pagination page={hist.page} total={hist.data.total} perPage={hist.perPage} onChange={hist.setPage} />}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="この内容で送信しますか？">
        <div className="space-y-4">
          <Alert kind="warn">
            {target === "users" ? `指定した会員 ${picked.length}名` : target === "all" ? "全会員" : "メール確認済みの会員"}（{fmtNum(count?.count ?? 0)}名）に送信します。
            {sendEmail && ` メールも ${fmtNum(count?.email_count ?? 0)}通送信されます。`}送信後は取り消せません。
          </Alert>
          <div className="rounded-xl border border-veil/10 p-4">
            <p className="font-bold">{title}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-moon/70">{body}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="subtle" onClick={() => setConfirm(false)}>戻る</Button>
            <Button onClick={send} loading={sending}>送信する</Button>
          </div>
        </div>
      </Modal>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title}>
        {detail && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-moon/50">
              {fmtDateTime(detail.created_at)}・{detail.target_label}・{fmtNum(detail.recipient_count)}名{detail.send_email && `・メール${fmtNum(detail.email_count)}通`}
            </p>
            <p className="whitespace-pre-line leading-relaxed text-moon/80">{detail.body}</p>
            {detail.link && <p className="text-xs text-gold-light">リンク先：{detail.link}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function AdminMessages() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
