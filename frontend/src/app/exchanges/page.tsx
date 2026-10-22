"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { PrizeArt } from "@/components/PrizeCard";
import { Button, Empty, PageTitle, Pagination, Panel, Spinner, StatusPill } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Exchange, Page } from "@/lib/types";

function Content() {
  const [page, setPage] = useState(1);
  const { data } = useSWR<Page<Exchange>>(`/api/exchanges?page=${page}`, fetcher, { keepPreviousData: true });
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageTitle en="EXCHANGE HISTORY" title="景品の発送申請" right={<Button variant="ghost" href="/prizes">発送を申請する</Button>} />
      <Panel>
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty title="発送の申請はまだありません" />
        ) : (
          <ul className="divide-y divide-veil/5">
            {data.items.map((ex) => (
              <li key={ex.id}>
                <Link href={`/exchanges/${ex.id}`} className="flex items-center gap-4 py-4 hover:text-gold-light">
                  <div className="flex -space-x-3">
                    {ex.items.slice(0, 3).map((it) => (
                      <div key={it.user_prize_id} className="h-12 w-9 overflow-hidden rounded-md border border-gold/30">
                        <PrizeArt prize={it.prize} />
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      申請番号 #{ex.id}・{ex.items.length}点
                    </p>
                    <p className="text-xs text-moon/45">{fmtDateTime(ex.created_at)}</p>
                  </div>
                  <StatusPill status={ex.status} label={ex.status_label} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data && <Pagination page={page} total={data.total} perPage={20} onChange={setPage} />}
      </Panel>
    </div>
  );
}

export default function ExchangesPage() {
  return <RequireAuth>{() => <Content />}</RequireAuth>;
}
