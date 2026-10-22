"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";
import { Badge, Stat, TableWrap } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Button, Field, Modal, PageTitle, Panel, RarityBadge, Spinner } from "@/components/ui";
import { ApiError, api, fetcher, newIdempotencyKey } from "@/lib/api";
import { TX_KIND, fmtDateTime, fmtNum } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import type { Rarity } from "@/lib/types";

type Detail = {
  id: number;
  email: string;
  display_name: string;
  role: string;
  status: string;
  suspended_reason: string | null;
  email_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
  failed_login_count: number;
  locked_until: string | null;
  wallet: { balance: number; total_earned: number; total_spent: number } | null;
  point_wallet: { balance: number; total_earned: number; total_spent: number } | null;
  recent_point_transactions: { id: number; delta: number; balance_after: number; kind: string; description: string; created_at: string }[];
  phone_verified_at: string | null;
  phone_last4: string | null;
  invite_code: string | null;
  referred_by_id: number | null;
  recent_draws: { id: string; gacha_title: string; count: number; tickets_spent: number; best_rarity: Rarity; has_last_one: boolean; created_at: string }[];
  prize_counts: Record<string, number>;
  recent_transactions: { id: number; delta: number; balance_after: number; kind: string; description: string; created_at: string; is_test: boolean }[];
  exchanges: number;
};

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: u, mutate } = useSWR<Detail>(`/api/admin/users/${id}`, fetcher);
  const { me } = useMe();
  const toast = useToast();
  const [modal, setModal] = useState<"tickets" | "points" | "suspend" | null>(null);
  const [delta, setDelta] = useState("10");
  const [reason, setReason] = useState("");
  const key = useRef(newIdempotencyKey());
  const isAdmin = me?.role === "admin";

  if (!u) return <Spinner />;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      setModal(null);
      setReason("");
      key.current = newIdempotencyKey();
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  return (
    <div>
      <PageTitle
        en={`USER #${u.id}`}
        title={u.display_name}
        sub={u.email}
        right={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" href={`/admin/messages?user=${u.id}`}>メッセージを送る</Button>
            {isAdmin && (
            <>
              <Button size="sm" onClick={() => setModal("tickets")}>チケット付与・調整</Button>
              <Button size="sm" variant="purple" onClick={() => setModal("points")}>ポイント付与・調整</Button>
              {u.status === "active" ? (
                <Button size="sm" variant="danger" onClick={() => setModal("suspend")}>アカウント停止</Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => run(() => api(`/admin/users/${u.id}/unsuspend`, { method: "POST" }), "停止を解除しました")}>停止を解除</Button>
              )}
            </>
            )}
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        {u.status === "suspended" ? <Badge tone="bad">停止中：{u.suspended_reason}</Badge> : <Badge tone="good">有効</Badge>}
        {u.email_verified_at ? <Badge tone="info">メール確認済み</Badge> : <Badge tone="warn">メール未確認</Badge>}
        {!u.email_verified_at && (
          <>
            <button
              className="rounded-full border border-gold/40 px-2.5 py-0.5 text-xs font-bold text-gold-light hover:bg-gold/10"
              onClick={() => run(() => api(`/admin/users/${u.id}/resend-verification`, { method: "POST" }), "確認メールを再送しました")}
            >
              確認メールを再送
            </button>
            {isAdmin && (
              <button
                className="rounded-full border border-gold/40 px-2.5 py-0.5 text-xs font-bold text-gold-light hover:bg-gold/10"
                onClick={() =>
                  confirm("ご本人であることを確認できましたか？メールアドレスを確認済みにし、新規登録特典を付与します。") &&
                  run(() => api(`/admin/users/${u.id}/verify-email`, { method: "POST" }), "メールアドレスを確認済みにしました")
                }
              >
                確認済みにする
              </button>
            )}
          </>
        )}
        {u.phone_verified_at ? <Badge tone="info">電話番号確認済み（末尾 {u.phone_last4}）</Badge> : <Badge>電話番号未確認</Badge>}
        {u.invite_code && <Badge>招待コード {u.invite_code}</Badge>}
        {u.referred_by_id && <Link href={`/admin/users/${u.referred_by_id}`}><Badge tone="info">紹介者 #{u.referred_by_id}</Badge></Link>}
        {u.locked_until && new Date(u.locked_until) > new Date() && <Badge tone="warn">ログインロック中（〜{fmtDateTime(u.locked_until)}）</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="チケット残高" value={fmtNum(u.wallet?.balance ?? 0)} sub={`獲得 ${fmtNum(u.wallet?.total_earned ?? 0)}・使用 ${fmtNum(u.wallet?.total_spent ?? 0)}`} />
        <Stat label="ポイント残高" value={fmtNum(u.point_wallet?.balance ?? 0)} sub={`獲得 ${fmtNum(u.point_wallet?.total_earned ?? 0)}・交換 ${fmtNum(u.point_wallet?.total_spent ?? 0)}`} />
        <Stat label="所持景品" value={u.prize_counts.owned ?? 0} sub={`申請中 ${u.prize_counts.exchange_pending ?? 0}・交換済 ${u.prize_counts.exchanged ?? 0}`} />
        <Stat label="交換申請" value={u.exchanges} />
        <Stat label="登録日時" value={<span className="text-base">{fmtDateTime(u.created_at)}</span>} sub={`最終ログイン ${fmtDateTime(u.last_login_at)}`} />
      </div>

      {isAdmin && (
        <Panel className="mt-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-moon/60">権限</span>
            {(["user", "staff", "admin"] as const).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={u.role === r ? "gold" : "subtle"}
                disabled={u.role === r || u.id === me?.id}
                onClick={() => confirm(`権限を「${r}」に変更しますか？（対象ユーザーは再ログインが必要になります）`) && run(() => api(`/admin/users/${u.id}/role`, { body: { role: r } }), "権限を変更しました")}
              >
                {{ user: "一般", staff: "スタッフ", admin: "管理者" }[r]}
              </Button>
            ))}
          </div>
        </Panel>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-serif font-bold text-gold-light">チケット履歴（直近20件）</h2>
            <Link href={`/admin/tickets?user_id=${u.id}`} className="text-xs text-moon/55 hover:text-gold-light">すべて見る →</Link>
          </div>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr><th>日時</th><th>内容</th><th className="text-right">増減</th><th className="text-right">残高</th></tr>
              </thead>
              <tbody>
                {u.recent_transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap text-xs text-moon/55">{fmtDateTime(t.created_at)}</td>
                    <td className="text-xs">
                      <span className="text-moon/50">{TX_KIND[t.kind] ?? t.kind}</span> {t.description} {t.is_test && <Badge>テスト</Badge>}
                    </td>
                    <td className={"text-right tabular-nums " + (t.delta > 0 ? "text-aurora" : "text-amethyst-200")}>{t.delta > 0 ? "+" : ""}{t.delta}</td>
                    <td className="text-right tabular-nums">{t.balance_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-serif font-bold text-gold-light">抽選履歴（直近20件）</h2>
            <Link href={`/admin/draws?user_id=${u.id}`} className="text-xs text-moon/55 hover:text-gold-light">すべて見る →</Link>
          </div>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr><th>日時</th><th>ガチャ</th><th>回数</th><th>最高</th></tr>
              </thead>
              <tbody>
                {u.recent_draws.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap text-xs text-moon/55">{fmtDateTime(d.created_at)}</td>
                    <td className="text-xs">{d.gacha_title} {d.has_last_one && <Badge tone="warn">ラストワン</Badge>}</td>
                    <td className="tabular-nums">{d.count}</td>
                    <td><RarityBadge rarity={d.best_rarity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </div>

      <div className="mt-5">
        <h2 className="mb-2 font-serif font-bold text-gold-light">ポイント履歴（直近20件）</h2>
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>日時</th><th>内容</th><th className="text-right">増減</th><th className="text-right">残高</th></tr></thead>
            <tbody>
              {u.recent_point_transactions.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-moon/50">履歴はありません</td></tr>}
              {u.recent_point_transactions.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap text-xs text-moon/55">{fmtDateTime(t.created_at)}</td>
                  <td className="text-xs"><span className="text-moon/50">{TX_KIND[t.kind] ?? t.kind}</span> {t.description}</td>
                  <td className={"text-right tabular-nums " + (t.delta > 0 ? "text-aurora" : "text-amethyst-200")}>{t.delta > 0 ? "+" : ""}{fmtNum(t.delta)}</td>
                  <td className="text-right tabular-nums">{fmtNum(t.balance_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>

      <Modal open={modal === "points"} onClose={() => setModal(null)} title="ポイントの付与・調整">
        <div className="space-y-4">
          <p className="text-sm text-moon/60">ポイントは交換用の残高です（チケットとは別）。現在の残高：{fmtNum(u.point_wallet?.balance ?? 0)}pt。マイナス値で減算します。</p>
          <Field label="増減するポイント数">
            <input className="field" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </Field>
          <Field label="理由（ユーザーの履歴にも表示されます）">
            <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={150} placeholder="例：キャンペーン当選" />
          </Field>
          <Button
            className="w-full"
            disabled={!Number(delta) || reason.trim().length < 2}
            onClick={() => run(() => api(`/admin/users/${u.id}/points`, { body: { delta: Number(delta), reason, idempotency_key: key.current } }), "ポイントを調整しました")}
          >
            {Number(delta) > 0 ? `${Number(delta).toLocaleString("ja-JP")}ptを付与する` : `${Math.abs(Number(delta)).toLocaleString("ja-JP")}ptを減算する`}
          </Button>
        </div>
      </Modal>
      <Modal open={modal === "tickets"} onClose={() => setModal(null)} title="チケットの付与・調整">
        <div className="space-y-4">
          <p className="text-sm text-moon/60">現在の残高：{fmtNum(u.wallet?.balance ?? 0)}枚。マイナス値で減算します（残高を下回る減算はできません）。</p>
          <Field label="増減するチケット枚数">
            <input className="field" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </Field>
          <Field label="理由（ユーザーの履歴にも表示されます）">
            <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={150} placeholder="例：メンテナンスのお詫び" />
          </Field>
          <Button
            className="w-full"
            disabled={!Number(delta) || reason.trim().length < 2}
            onClick={() => run(() => api(`/admin/users/${u.id}/tickets`, { body: { delta: Number(delta), reason, idempotency_key: key.current } }), "チケットを調整しました")}
          >
            {Number(delta) > 0 ? `${delta}枚を付与する` : `${Math.abs(Number(delta))}枚を減算する`}
          </Button>
        </div>
      </Modal>
      <Modal open={modal === "suspend"} onClose={() => setModal(null)} title="アカウントを停止">
        <div className="space-y-4">
          <p className="text-sm text-moon/60">停止すると、すべての端末からログアウトされ、ログインできなくなります。</p>
          <Field label="停止理由（記録用）">
            <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button variant="danger" className="w-full" disabled={reason.trim().length < 2} onClick={() => run(() => api(`/admin/users/${u.id}/suspend`, { body: { reason } }), "アカウントを停止しました")}>
            停止する
          </Button>
        </div>
      </Modal>
    </div>
  );
}
