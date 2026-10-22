import type { Metadata } from "next";
import { PageTitle, Panel } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { serverGet } from "@/lib/server";
import type { Announcement } from "@/lib/types";

export const metadata: Metadata = { title: "お知らせ" };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { campaign: "キャンペーン", maintenance: "メンテナンス", new_gacha: "新ガチャ", info: "お知らせ", important: "重要" };

export default async function NewsPage() {
  const news = (await serverGet<Announcement[]>("/announcements?limit=100", 30)) ?? [];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageTitle en="NEWS" title="お知らせ" />
      <Panel>
        {news.length === 0 ? (
          <p className="py-10 text-center text-moon/60">お知らせはありません。</p>
        ) : (
          <ul className="divide-y divide-veil/5">
            {news.map((n) => (
              <li key={n.id} id={`n${n.id}`} className="scroll-mt-24 py-5">
                <div className="flex flex-wrap items-center gap-3 text-xs text-moon/55">
                  <time>{fmtDate(n.published_at)}</time>
                  <span className="rounded-full border border-gold/30 px-2 py-0.5 text-gold-light/85">{LABEL[n.category] ?? "お知らせ"}</span>
                </div>
                <h2 className="mt-2 font-serif text-lg font-bold">{n.title}</h2>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-moon/70">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
