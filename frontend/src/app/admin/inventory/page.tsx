"use client";

import Link from "next/link";
import useSWR from "swr";
import { Badge, TableWrap } from "@/components/admin/kit";
import { PageTitle, RarityBadge, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import type { Rarity } from "@/lib/types";

type Row = { gacha_id: number; gacha_title: string; gacha_status: string; mode: string; item_id: number; prize_name: string; rarity: Rarity; weight: number; stock_total: number | null; stock_remaining: number | null; is_active: boolean; awarded_total: number };

export default function AdminInventory() {
  const { data } = useSWR<{ items: Row[] }>("/api/admin/inventory", fetcher, { refreshInterval: 20000 });
  return (
    <div>
      <PageTitle en="INVENTORY" title="在庫管理" sub="在庫の増減は各ガチャの「在庫調整」から行えます。残り10%以下の在庫を強調表示します。" />
      {!data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr><th>ガチャ</th><th>景品</th><th className="text-right">残り / 総数</th><th className="w-40">残量</th><th className="text-right">累計払い出し</th><th>状態</th></tr>
            </thead>
            <tbody>
              {data.items.map((r) => {
                const pct = r.stock_total ? ((r.stock_remaining ?? 0) / r.stock_total) * 100 : null;
                const low = pct != null && pct <= 10;
                return (
                  <tr key={r.item_id}>
                    <td className="text-xs"><Link className="hover:text-gold-light" href={`/admin/gachas/${r.gacha_id}`}>{r.gacha_title}</Link><span className="ml-1 text-moon/40">（{r.mode === "box" ? "ボックス" : "確率"}）</span></td>
                    <td className="text-sm"><RarityBadge rarity={r.rarity} /> <span className="ml-1">{r.prize_name}</span></td>
                    <td className="text-right tabular-nums">{r.stock_total == null ? "無制限" : `${fmtNum(r.stock_remaining)} / ${fmtNum(r.stock_total)}`}</td>
                    <td>
                      {pct != null && (
                        <div className="h-1.5 overflow-hidden rounded-full bg-veil/10" role="img" aria-label={`残り${pct.toFixed(0)}%`}>
                          <div className={low ? "h-full bg-rose-400" : "h-full bg-[#9B7BEA]"} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="text-right tabular-nums text-moon/60">{fmtNum(r.awarded_total)}</td>
                    <td className="space-x-1">
                      {!r.is_active && <Badge>無効</Badge>}
                      {r.stock_remaining === 0 && <Badge tone="bad">在庫切れ</Badge>}
                      {low && r.stock_remaining !== 0 && <Badge tone="warn">残りわずか</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}
