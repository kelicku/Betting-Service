"use client";

import Link from "next/link";
import useSWR from "swr";
import { Badge, TableWrap } from "@/components/admin/kit";
import { PageTitle, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { fmtDateTime, fmtNum } from "@/lib/format";

type Award = { id: number; gacha_id: number; gacha_title: string; user_id: number; email: string; draw_id: string; prize_name: string; awarded_at: string };
type G = { id: number; title: string; status: string; has_last_one: boolean; remaining: number | null; last_one_prize_id: number | null; last_one_award: unknown };

export default function AdminLastOne() {
  const { data: awards } = useSWR<{ items: Award[] }>("/api/admin/last-one-awards", fetcher);
  const { data: gachas } = useSWR<{ items: G[] }>("/api/admin/gachas", fetcher);
  const targets = (gachas?.items ?? []).filter((g) => g.last_one_prize_id);
  return (
    <div>
      <PageTitle en="LAST ONE" title="ラストワン賞管理" sub="ラストワン賞の景品・説明は各ガチャの基本設定から変更できます。付与はガチャ単位で1件のみ（データベースの一意制約で保証）。" />
      <h2 className="mb-2 font-serif font-bold text-gold-light">対象ガチャ</h2>
      {!gachas ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>ガチャ</th><th>状態</th><th className="text-right">残り口数</th><th>ラストワン賞</th><th /></tr></thead>
            <tbody>
              {targets.map((g) => (
                <tr key={g.id}>
                  <td>{g.title}</td>
                  <td className="text-xs">{g.status}</td>
                  <td className="text-right tabular-nums">{g.remaining == null ? "—" : fmtNum(g.remaining)}</td>
                  <td>{!g.has_last_one ? <Badge tone="bad">無効（総口数未設定）</Badge> : g.last_one_award ? <Badge tone="warn">付与済み</Badge> : <Badge tone="info">未付与</Badge>}</td>
                  <td className="text-right"><Link href={`/admin/gachas/${g.id}`} className="text-xs text-gold-light hover:underline">設定 →</Link></td>
                </tr>
              ))}
              {targets.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-moon/50">ラストワン賞を設定したガチャはありません</td></tr>}
            </tbody>
          </table>
        </TableWrap>
      )}
      <h2 className="mb-2 mt-8 font-serif font-bold text-gold-light">付与履歴</h2>
      {!awards ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>付与日時</th><th>ガチャ</th><th>景品</th><th>獲得ユーザー</th><th>抽選</th></tr></thead>
            <tbody>
              {awards.items.map((a) => (
                <tr key={a.id}>
                  <td className="text-xs text-moon/60">{fmtDateTime(a.awarded_at)}</td>
                  <td>{a.gacha_title}</td>
                  <td className="text-gold-light">{a.prize_name}</td>
                  <td className="text-xs"><Link className="hover:text-gold-light" href={`/admin/users/${a.user_id}`}>{a.email}</Link></td>
                  <td className="text-xs"><Link className="hover:text-gold-light" href={`/admin/draws?draw=${a.draw_id}`}>{a.draw_id.slice(0, 8)}…</Link></td>
                </tr>
              ))}
              {awards.items.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-moon/50">まだ付与されていません</td></tr>}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
