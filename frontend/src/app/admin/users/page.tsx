"use client";

import Link from "next/link";
import { Badge, SearchInput, Select, TableWrap, Toolbar, useAdminList } from "@/components/admin/kit";
import { PageTitle, Pagination, Spinner } from "@/components/ui";
import { fmtDateTime, fmtNum } from "@/lib/format";

type U = { id: number; email: string; display_name: string; role: string; status: string; email_verified_at: string | null; last_login_at: string | null; created_at: string; balance: number; point_balance?: number };

export default function AdminUsers() {
  const l = useAdminList<U>("/api/admin/users", { q: "", status: "", role: "", verified: "" });
  return (
    <div>
      <PageTitle en="USERS" title="ユーザー管理" sub={l.data ? `${fmtNum(l.data.total)}件` : undefined} />
      <Toolbar>
        <SearchInput value={l.filters.q} onChange={(v) => l.set("q", v)} placeholder="メールアドレス・ニックネーム・ID" />
        <Select label="状態" value={l.filters.status} onChange={(v) => l.set("status", v)} options={[["", "すべての状態"], ["active", "有効"], ["suspended", "停止中"]]} />
        <Select label="権限" value={l.filters.role} onChange={(v) => l.set("role", v)} options={[["", "すべての権限"], ["user", "一般"], ["staff", "スタッフ"], ["admin", "管理者"]]} />
        <Select label="メール確認" value={l.filters.verified} onChange={(v) => l.set("verified", v)} options={[["", "メール確認：すべて"], ["true", "確認済み"], ["false", "未確認"]]} />
      </Toolbar>
      {!l.data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr>
                <th>ID</th>
                <th>ニックネーム / メール</th>
                <th>状態</th>
                <th className="text-right">チケット</th>
                <th className="text-right">ポイント</th>
                <th>最終ログイン</th>
                <th>登録日時</th>
              </tr>
            </thead>
            <tbody>
              {l.data.items.map((u) => (
                <tr key={u.id}>
                  <td className="tabular-nums text-moon/50">{u.id}</td>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="hover:text-gold-light">
                      <span className="block font-medium">{u.display_name}</span>
                      <span className="block text-xs text-moon/50">{u.email}</span>
                    </Link>
                  </td>
                  <td className="space-x-1">
                    {u.status === "suspended" ? <Badge tone="bad">停止中</Badge> : <Badge tone="good">有効</Badge>}
                    {u.role !== "user" && <Badge tone="info">{u.role === "admin" ? "管理者" : "スタッフ"}</Badge>}
                    {!u.email_verified_at && <Badge tone="warn">メール未確認</Badge>}
                  </td>
                  <td className="text-right tabular-nums">{fmtNum(u.balance)}</td>
                  <td className="text-right tabular-nums">{fmtNum(u.point_balance ?? 0)}</td>
                  <td className="text-xs text-moon/60">{fmtDateTime(u.last_login_at)}</td>
                  <td className="text-xs text-moon/60">{fmtDateTime(u.created_at)}</td>
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
