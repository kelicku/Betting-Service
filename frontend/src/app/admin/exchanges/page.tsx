"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TableWrap, useAdminList } from "@/components/admin/kit";
import { PageTitle, Pagination, Spinner, StatusPill, Tabs } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

type E = { id: number; user_id: number; email: string; status: string; status_label: string; recipient_masked: string | null; item_count: number; created_at: string; updated_at: string; tracking_number: string | null };

const TABS = [
  ["", "すべて"],
  ["pending", "申請受付"],
  ["approved", "承認済み"],
  ["preparing", "発送準備中"],
  ["shipped", "発送済み"],
  ["completed", "完了"],
  ["rejected", "却下"],
  ["cancelled", "取消"],
] as const;

function Content() {
  const sp = useSearchParams();
  const l = useAdminList<E>("/api/admin/exchanges", { status: sp.get("status") ?? "" });
  const by = (l.data?.by_status ?? {}) as Record<string, number>;
  return (
    <div>
      <PageTitle en="EXCHANGES" title="交換申請管理" sub="配送先（個人情報）の閲覧は操作履歴に記録されます。" />
      <Tabs
        value={l.filters.status}
        onChange={(v) => l.set("status", v)}
        items={TABS.map(([v, t]) => ({ value: v, label: t, count: v ? by[v] ?? 0 : undefined }))}
      />
      {!l.data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>申請番号</th><th>申請日時</th><th>ユーザー</th><th>お届け先</th><th className="text-right">点数</th><th>状態</th><th>更新</th></tr></thead>
            <tbody>
              {l.data.items.map((e) => (
                <tr key={e.id}>
                  <td><Link href={`/admin/exchanges/${e.id}`} className="font-medium text-gold-light hover:underline">#{e.id}</Link></td>
                  <td className="text-xs text-moon/60">{fmtDateTime(e.created_at)}</td>
                  <td className="text-xs"><Link className="hover:text-gold-light" href={`/admin/users/${e.user_id}`}>{e.email}</Link></td>
                  <td className="text-xs">{e.recipient_masked ?? "（配送不要）"}</td>
                  <td className="text-right tabular-nums">{e.item_count}</td>
                  <td><StatusPill status={e.status} label={e.status_label} /></td>
                  <td className="text-xs text-moon/55">{fmtDateTime(e.updated_at)}</td>
                </tr>
              ))}
              {l.data.items.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-moon/50">該当する申請はありません</td></tr>}
            </tbody>
          </table>
        </TableWrap>
      )}
      {l.data && <Pagination page={l.page} total={l.data.total} perPage={l.perPage} onChange={l.setPage} />}
    </div>
  );
}

export default function AdminExchanges() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
