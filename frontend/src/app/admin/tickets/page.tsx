"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useSWR from "swr";
import { Badge, SearchInput, Select, TableWrap, Toolbar, useAdminList } from "@/components/admin/kit";
import { PageTitle, Pagination, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { TX_KIND, fmtDateTime, fmtNum } from "@/lib/format";

type Tx = { id: number; user_id: number; email: string; delta: number; balance_after: number; kind: string; description: string; actor_id: number | null; is_test: boolean; created_at: string };

function Content() {
  const sp = useSearchParams();
  const l = useAdminList<Tx>("/api/admin/tickets/transactions", { user_id: sp.get("user_id") ?? "", kind: "", direction: "all", include_test: "true" }, 50);
  const { data: summary } = useSWR<{ by_kind: { kind: string; count: number; sum: number }[] }>("/api/admin/tickets/summary", fetcher);
  return (
    <div>
      <PageTitle en="TICKETS" title="チケット管理" sub="すべてのチケットの増減は取引履歴として記録されています。付与・調整はユーザー詳細から行えます。" />
      {summary && (
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {summary.by_kind.map((k) => (
            <div key={k.kind} className="glass px-3 py-2.5">
              <p className="text-xs text-moon/55">{TX_KIND[k.kind] ?? k.kind}</p>
              <p className={"font-display text-lg font-bold tabular-nums " + (k.sum >= 0 ? "text-aurora" : "text-amethyst-200")}>
                {k.sum > 0 ? "+" : ""}
                {fmtNum(k.sum)}
              </p>
              <p className="text-[11px] text-moon/40">{fmtNum(k.count)}件</p>
            </div>
          ))}
        </div>
      )}
      <Toolbar>
        <SearchInput value={l.filters.user_id} onChange={(v) => l.set("user_id", v)} placeholder="ユーザーIDで絞り込み" />
        <Select label="種類" value={l.filters.kind} onChange={(v) => l.set("kind", v)} options={[["", "すべての種類"], ...Object.entries(TX_KIND)]} />
        <Select label="増減" value={l.filters.direction} onChange={(v) => l.set("direction", v)} options={[["all", "増減：すべて"], ["earn", "付与のみ"], ["spend", "消費のみ"]]} />
        <Select label="テスト" value={l.filters.include_test} onChange={(v) => l.set("include_test", v)} options={[["true", "テストを含む"], ["false", "テストを除く"]]} />
      </Toolbar>
      {!l.data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr><th>ID</th><th>日時</th><th>ユーザー</th><th>種類</th><th>内容</th><th className="text-right">増減</th><th className="text-right">残高</th></tr>
            </thead>
            <tbody>
              {l.data.items.map((t) => (
                <tr key={t.id}>
                  <td className="tabular-nums text-moon/45">{t.id}</td>
                  <td className="whitespace-nowrap text-xs text-moon/60">{fmtDateTime(t.created_at)}</td>
                  <td className="text-xs"><Link className="hover:text-gold-light" href={`/admin/users/${t.user_id}`}>{t.email}</Link></td>
                  <td className="whitespace-nowrap text-xs">{TX_KIND[t.kind] ?? t.kind} {t.is_test && <Badge>テスト</Badge>} {t.actor_id && <Badge tone="info">運営</Badge>}</td>
                  <td className="text-xs text-moon/75">{t.description}</td>
                  <td className={"text-right tabular-nums " + (t.delta > 0 ? "text-aurora" : "text-amethyst-200")}>{t.delta > 0 ? "+" : ""}{t.delta}</td>
                  <td className="text-right tabular-nums">{t.balance_after}</td>
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

export default function AdminTickets() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
