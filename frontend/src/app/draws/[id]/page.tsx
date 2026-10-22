"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { RarityCounts, ResultGrid } from "@/ceremony/Reveal";
import { RequireAuth } from "@/components/Guard";
import { PrizeCard } from "@/components/PrizeCard";
import { Button, Modal, PageTitle, Panel, RarityBadge, Spinner, Tickets } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Draw, DrawResult } from "@/lib/types";

function Content() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error } = useSWR<Draw>(`/api/draws/${id}`, fetcher);
  const [sel, setSel] = useState<DrawResult | null>(null);
  if (error) return <p className="py-24 text-center text-moon/60">{error.message}</p>;
  if (!d) return <Spinner />;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageTitle
        en="RESULT"
        title="抽選結果"
        sub={`${d.gacha_title}・${d.count}回・${fmtDateTime(d.created_at)}`}
        right={
          <div className="flex gap-2">
            <Button variant="ghost" href="/draws">抽選履歴を見る</Button>
            <Button href={`/gacha/${d.gacha_slug}`}>もう一度引く</Button>
          </div>
        }
      />
      <Panel className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
        <span className="text-moon/60">
          使用チケット <Tickets n={d.tickets_spent} className="text-gold-light" />
        </span>
        <span className="flex items-center gap-2 text-moon/60">
          最高レアリティ <RarityBadge rarity={d.best_rarity} />
        </span>
        {d.has_last_one && <span className="font-bold text-gold-light">✦ ラストワン賞を獲得しました</span>}
        <span className="text-xs text-moon/40">抽選ID: {d.id}</span>
      </Panel>
      {d.count > 1 && (
        <div className="mb-6">
          <RarityCounts counts={d.rarity_counts} animate={false} />
        </div>
      )}
      {d.count === 1 && !d.has_last_one ? (
        <div className="mx-auto w-64">
          <PrizeCard prize={d.results[0].prize} rarity={d.results[0].rarity} size="lg" />
        </div>
      ) : (
        <ResultGrid results={d.results} onSelect={setSel} dense={d.count === 100} />
      )}
      <Modal open={!!sel} onClose={() => setSel(null)}>
        {sel && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-56">
              <PrizeCard prize={sel.prize} rarity={sel.rarity} size="lg" lastOne={sel.is_last_one} />
            </div>
            <p className="font-serif text-xl font-bold">{sel.prize.name}</p>
            <p className="text-sm text-moon/65">{sel.prize.description}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function DrawResultPage() {
  return <RequireAuth>{() => <Content />}</RequireAuth>;
}
