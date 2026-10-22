"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { Empty, PageTitle, Pagination, Panel, Spinner, Tabs, cx } from "@/components/ui";
import { api, fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { refreshMe } from "@/lib/hooks";
import type { Announcement, NotificationItem, Page } from "@/lib/types";

function Content() {
  const [tab, setTab] = useState<"mine" | "news">("mine");
  const [page, setPage] = useState(1);
  const { data } = useSWR<Page<NotificationItem>>(`/api/notifications?page=${page}`, fetcher, { keepPreviousData: true });
  const { data: news } = useSWR<Announcement[]>("/api/announcements?limit=50", fetcher);
  useEffect(() => {
    if (data?.items.some((n) => !n.read_at)) {
      // 一覧を開いたら既読にする（表示中の未読マークは次回から消える）
      api("/notifications/read-all", { method: "POST" }).then(() => refreshMe()).catch(() => {});
    }
  }, [data]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageTitle en="NOTICE" title="お知らせ" />
      <Tabs value={tab} onChange={setTab} items={[{ value: "mine", label: "あなたへのお知らせ" }, { value: "news", label: "運営からのお知らせ" }]} />
      <Panel>
        {tab === "mine" ? (
          !data ? (
            <Spinner />
          ) : data.items.length === 0 ? (
            <Empty title="お知らせはありません" />
          ) : (
            <ul className="divide-y divide-veil/5">
              {data.items.map((n) => {
                const body = (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {!n.read_at && <span className="h-2 w-2 rounded-full bg-blush" aria-label="未読" />}
                      {n.kind === "message" && (
                        <span className="whitespace-nowrap rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] text-gold-light">運営からのメッセージ</span>
                      )}
                      <p className={cx("font-bold", n.kind === "last_one" && "text-gold-light")}>{n.title}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-moon/65">{n.body}</p>
                    <p className="mt-1 text-xs text-moon/40">{fmtDateTime(n.created_at)}</p>
                  </>
                );
                return (
                  <li key={n.id} className="py-4">
                    {n.link ? <Link href={n.link} className="block hover:opacity-90">{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          )
        ) : !news ? (
          <Spinner />
        ) : news.length === 0 ? (
          <Empty title="お知らせはありません" />
        ) : (
          <ul className="divide-y divide-veil/5">
            {news.map((n) => (
              <li key={n.id} className="py-4">
                <p className="text-xs text-moon/45">{fmtDateTime(n.published_at)}</p>
                <p className="mt-1 font-serif font-bold">{n.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-moon/65">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
        {tab === "mine" && data && <Pagination page={page} total={data.total} perPage={20} onChange={setPage} />}
      </Panel>
    </div>
  );
}

export default function NotificationsPage() {
  return <RequireAuth>{() => <Content />}</RequireAuth>;
}
