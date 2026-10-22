"use client";

import Image from "next/image";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { GiftCodeBox } from "@/components/GiftCodeBox";
import { RequireAuth } from "@/components/Guard";
import { useToast } from "@/components/Toast";
import { Button, Empty, PageTitle, Pagination, Panel, Spinner, cx } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { refreshMe } from "@/lib/hooks";
import type { ShopOrder } from "@/lib/types";

const STATUS_CLS: Record<ShopOrder["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  fulfilled: "bg-emerald-100 text-emerald-700",
  shipped: "bg-sky-100 text-sky-700",
  cancelled: "bg-veil/10 text-moon/60",
};

function Content() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const url = `/api/shop/orders?page=${page}&per_page=20`;
  const { data } = useSWR<{ items: ShopOrder[]; total: number }>(url, fetcher, { keepPreviousData: true });
  const [open, setOpen] = useState<string | null>(null);

  const cancel = async (o: ShopOrder) => {
    if (!confirm(`「${o.item_name}」のポイント交換を取り消しますか？ ${o.point_cost.toLocaleString("ja-JP")}pt が返還されます。`)) return;
    try {
      await api(`/shop/orders/${o.id}/cancel`, { method: "POST" });
      toast("ポイント交換を取り消しました");
      await Promise.all([mutate(url), refreshMe()]);
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageTitle en="EXCHANGE HISTORY" title="ポイント交換の履歴" right={<Button variant="ghost" href="/shop">ポイント交換へ</Button>} />
      <Panel>
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty title="ポイント交換の履歴はまだありません">ガチャで貯めたポイントで、デジタルギフトと交換できます。</Empty>
        ) : (
          <ul className="divide-y divide-veil/5">
            {data.items.map((o) => (
              <li key={o.id} className="py-4">
                <div className="flex items-center gap-3">
                  {o.image_url && <Image src={o.image_url} alt="" width={80} height={50} className="h-12 w-16 shrink-0 object-contain" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-round font-bold">{o.item_name}</p>
                    <p className="text-xs text-moon/50">{fmtDateTime(o.created_at)}・{o.point_cost.toLocaleString("ja-JP")}pt</p>
                  </div>
                  <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_CLS[o.status])}>{o.status_label}</span>
                </div>
                <div className="mt-3 pl-0 sm:pl-[4.75rem]">
                  {o.gift_code ? (
                    open === o.id ? (
                      <GiftCodeBox code={o.gift_code} expires={o.gift_code_expires_on} />
                    ) : (
                      <Button size="sm" onClick={() => setOpen(o.id)}>ギフトコードを表示</Button>
                    )
                  ) : o.status === "shipped" ? (
                    <p className="text-sm text-moon/70">発送済み{o.tracking_number ? `（${o.carrier ?? ""} ${o.tracking_number}）` : ""}</p>
                  ) : o.status === "cancelled" ? (
                    <p className="text-sm text-moon/60">取り消し済み（ポイントは返還されました）{o.admin_note ? `：${o.admin_note}` : ""}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-moon/70">{o.kind === "shipping" ? "発送の準備中です。" : "ギフトコードを準備中です。ご用意ができ次第お知らせします。"}</p>
                      <button onClick={() => cancel(o)} className="text-xs font-bold text-moon/50 underline hover:text-gold-light">取り消す</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={page} total={data.total} perPage={20} onChange={setPage} />}
      </Panel>
    </div>
  );
}

export default function ShopOrdersPage() {
  return <RequireAuth>{() => <Content />}</RequireAuth>;
}
