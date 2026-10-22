"use client";

import { SearchInput, Select, TableWrap, Toolbar, useAdminList } from "@/components/admin/kit";
import { PageTitle, Pagination, Spinner } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

type A = { id: number; actor_id: number | null; actor_email: string | null; action: string; target_type: string | null; target_id: string | null; detail: Record<string, unknown>; ip: string | null; created_at: string };

const ACTIONS: [string, string][] = [
  ["", "すべての操作"],
  ["tickets", "チケット付与・調整"],
  ["points", "ポイント付与・調整"],
  ["shop_order", "ポイント交換の対応"],
  ["shop_item", "交換景品の設定"],
  ["gift_codes", "ギフトコード登録"],
  ["user", "ユーザー（停止・権限）"],
  ["gacha", "ガチャ設定"],
  ["prize", "景品"],
  ["offer", "広告・アンケート案件"],
  ["mission", "ミッション"],
  ["exchange", "交換申請・個人情報閲覧"],
  ["settings", "システム設定"],
  ["announcement", "お知らせ"],
];

export default function AdminAudit() {
  const l = useAdminList<A>("/api/admin/audit-logs", { action: "", target_id: "" }, 50);
  return (
    <div>
      <PageTitle en="AUDIT LOG" title="操作履歴" sub="管理者・スタッフによるすべての変更操作と、個人情報の閲覧が記録されます。" />
      <Toolbar>
        <Select label="操作" value={l.filters.action} onChange={(v) => l.set("action", v)} options={ACTIONS} />
        <SearchInput value={l.filters.target_id} onChange={(v) => l.set("target_id", v)} placeholder="対象ID" />
      </Toolbar>
      {!l.data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>日時</th><th>操作者</th><th>操作</th><th>対象</th><th>内容</th><th>IP</th></tr></thead>
            <tbody>
              {l.data.items.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-xs text-moon/60">{fmtDateTime(a.created_at)}</td>
                  <td className="text-xs">{a.actor_email ?? "—"}</td>
                  <td className="font-mono text-xs text-gold-light">{a.action}</td>
                  <td className="text-xs">{a.target_type}{a.target_id && ` #${a.target_id}`}</td>
                  <td className="max-w-md truncate font-mono text-[11px] text-moon/55" title={JSON.stringify(a.detail)}>{JSON.stringify(a.detail)}</td>
                  <td className="font-mono text-xs text-moon/45">{a.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {l.data && <Pagination page={l.page} total={l.data.total} perPage={l.perPage} onChange={l.setPage} />}
    </div>
  );
}
