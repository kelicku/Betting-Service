"use client";

import { useState } from "react";
import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { Button, Empty, PageTitle, Pagination, Panel, Spinner, Tabs, Tickets, cx } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { TX_KIND, fmtDateTime, fmtNum } from "@/lib/format";
import type { Page, TicketTx } from "@/lib/types";

function Content() {
  const [dir, setDir] = useState<"all" | "earn" | "spend">("all");
  const [page, setPage] = useState(1);
  const { data: wallet } = useSWR<{ balance: number; total_earned: number; total_spent: number }>("/api/tickets/wallet", fetcher);
  const { data } = useSWR<Page<TicketTx>>(`/api/tickets/transactions?direction=${dir}&page=${page}&per_page=20`, fetcher, { keepPreviousData: true });
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageTitle en="TICKETS" title="チケットの履歴" right={<Button href="/earn">チケットを獲得する</Button>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel strong className="text-center">
          <p className="text-sm text-moon/60">所持チケット</p>
          <Tickets n={wallet?.balance ?? 0} className="mt-2 text-3xl text-gold-light" />
        </Panel>
        <Panel className="text-center">
          <p className="text-sm text-moon/60">累計獲得</p>
          <p className="mt-2 font-display text-2xl font-bold text-aurora">+{fmtNum(wallet?.total_earned ?? 0)}</p>
        </Panel>
        <Panel className="text-center">
          <p className="text-sm text-moon/60">累計使用</p>
          <p className="mt-2 font-display text-2xl font-bold text-amethyst-200">−{fmtNum(wallet?.total_spent ?? 0)}</p>
        </Panel>
      </div>
      <Panel className="mt-6">
        <Tabs
          value={dir}
          onChange={(v) => {
            setDir(v);
            setPage(1);
          }}
          items={[
            { value: "all", label: "すべて" },
            { value: "earn", label: "獲得履歴" },
            { value: "spend", label: "使用履歴" },
          ]}
        />
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty title="履歴はまだありません" />
        ) : (
          <ul className="divide-y divide-veil/5">
            {data.items.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <span
                  className={cx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    t.delta > 0 ? "bg-aurora/10 text-aurora" : "bg-amethyst/15 text-amethyst-200",
                  )}
                  aria-hidden
                >
                  {t.delta > 0 ? "+" : "−"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.description}</p>
                  <p className="text-xs text-moon/45">
                    {TX_KIND[t.kind] ?? t.kind}・{fmtDateTime(t.created_at)}
                    {t.is_test && <span className="ml-2 rounded bg-veil/10 px-1.5 text-[10px]">テスト</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cx("font-display text-lg font-bold tabular-nums", t.delta > 0 ? "text-aurora" : "text-amethyst-200")}>
                    {t.delta > 0 ? "+" : ""}
                    {fmtNum(t.delta)}
                  </p>
                  <p className="text-[11px] text-moon/40">残高 {fmtNum(t.balance_after)}</p>
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

export default function TicketsPage() {
  return <RequireAuth>{() => <Content />}</RequireAuth>;
}
