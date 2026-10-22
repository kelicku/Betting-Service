"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { Empty, PageTitle, Pagination, Panel, RarityBadge, Spinner, Tickets } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { DrawSummary, Page } from "@/lib/types";

function Content() {
  const [page, setPage] = useState(1);
  const { data } = useSWR<Page<DrawSummary>>(`/api/draws?page=${page}&per_page=20`, fetcher, { keepPreviousData: true });
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageTitle en="HISTORY" title="抽選履歴" sub="すべての抽選結果はサーバーに記録されています。" />
      <Panel>
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty title="まだガチャを引いていません">
            <Link href="/gacha" className="text-gold-light underline-offset-4 hover:underline">ガチャ一覧へ</Link>
          </Empty>
        ) : (
          <ul className="divide-y divide-veil/5">
            {data.items.map((d) => (
              <li key={d.id}>
                <Link href={`/draws/${d.id}`} className="flex items-center gap-3 py-3.5 transition hover:text-gold-light">
                  <RarityBadge rarity={d.best_rarity} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {d.gacha_title}
                      <span className="ml-2 text-sm text-moon/55">{d.count}回</span>
                      {d.has_last_one && <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] text-gold-light">ラストワン賞</span>}
                    </p>
                    <p className="text-xs text-moon/45">{fmtDateTime(d.created_at)}</p>
                  </div>
                  <Tickets n={d.tickets_spent} className="text-sm text-moon/60" />
                  <span aria-hidden className="text-moon/40">›</span>
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

export default function DrawsPage() {
  return <RequireAuth>{() => <Content />}</RequireAuth>;
}
