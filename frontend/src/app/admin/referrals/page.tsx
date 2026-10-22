"use client";

/** 管理：友達紹介の状況（紹介人数の多い順。不正な大量紹介の確認用）。 */

import Link from "next/link";
import { TableWrap, useAdminList } from "@/components/admin/kit";
import { PageTitle, Pagination, Spinner } from "@/components/ui";
import { fmtDateTime, fmtNum } from "@/lib/format";

type Row = { user_id: number; email: string; display_name: string; invited: number; completed: number; last_invited_at: string };

export default function AdminReferrals() {
  const list = useAdminList<Row>("/api/admin/referrals");
  return (
    <div>
      <PageTitle en="REFERRALS" title="友達紹介" sub="紹介された人が登録を完了（メール確認、SMS 認証が必須ならその完了）した時点で、双方にチケットを付与します。付与枚数はシステム設定で変更できます。紹介者への付与は 1 日 10 人までです。" />
      {!list.data ? (
        <Spinner />
      ) : (
        <>
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>紹介した会員</th><th className="text-right">紹介人数</th><th className="text-right">登録完了</th><th>最後の紹介</th></tr></thead>
              <tbody>
                {list.data.items.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-moon/50">まだ紹介はありません</td></tr>}
                {list.data.items.map((r) => (
                  <tr key={r.user_id}>
                    <td><Link href={`/admin/users/${r.user_id}`} className="font-bold text-gold-light hover:underline">{r.display_name}</Link><span className="block text-xs text-moon/50">{r.email}</span></td>
                    <td className="text-right tabular-nums">{fmtNum(r.invited)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.completed)}</td>
                    <td className="text-xs">{fmtDateTime(r.last_invited_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <Pagination page={list.page} total={list.data.total} perPage={list.perPage} onChange={list.setPage} />
        </>
      )}
    </div>
  );
}
