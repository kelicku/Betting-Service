"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { PrizeCard } from "@/components/PrizeCard";
import { Button, Empty, Modal, PageTitle, Pagination, RarityBadge, Spinner, Tabs, cx } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { RARITY, fmtDateTime } from "@/lib/format";
import type { Page, Rarity, UserPrize } from "@/lib/types";

const STATUS_LABEL: Record<UserPrize["status"], string> = { owned: "所持中", exchange_pending: "発送申請中", exchanged: "発送完了" };

function Content() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"all" | UserPrize["status"]>("all");
  const [rarity, setRarity] = useState<Rarity | "">((sp.get("rarity") as Rarity) ?? "");
  const [page, setPage] = useState(1);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<UserPrize | null>(null);
  const q = `/api/prizes?status=${status}${rarity ? `&rarity=${rarity}` : ""}&page=${page}&per_page=30`;
  const { data } = useSWR<Page<UserPrize>>(q, fetcher, { keepPreviousData: true });

  const toggle = (up: UserPrize) => {
    if (up.status !== "owned" || !up.is_exchangeable) return;
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(up.id)) n.delete(up.id);
      else n.add(up.id);
      return n;
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageTitle
        en="TREASURES"
        title="獲得した景品"
        right={
          selecting ? (
            <div className="flex gap-2">
              <Button variant="subtle" onClick={() => (setSelecting(false), setPicked(new Set()))}>キャンセル</Button>
              <Button disabled={picked.size === 0} onClick={() => router.push(`/exchanges/new?ids=${[...picked].join(",")}`)}>
                発送を申請する（{picked.size}点）
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => (setSelecting(true), setStatus("owned"), setPage(1))}>発送する景品を選ぶ</Button>
          )
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onChange={(v) => (setStatus(v), setPage(1))}
          items={[
            { value: "all", label: "すべて" },
            { value: "owned", label: "所持中" },
            { value: "exchange_pending", label: "発送申請中" },
            { value: "exchanged", label: "発送完了" },
          ]}
        />
        <select className="field mb-5 w-auto py-2 text-sm" value={rarity} onChange={(e) => (setRarity(e.target.value as Rarity), setPage(1))} aria-label="レアリティで絞り込み">
          <option value="">すべてのレアリティ</option>
          {["SSR", "SR", "R", "N"].map((r) => (
            <option key={r} value={r}>{RARITY[r as keyof typeof RARITY].label}</option>
          ))}
        </select>
      </div>
      {selecting && <p className="mb-4 text-sm text-gold-light/80">発送したい景品をタップして選択してください（所持中の景品のみ選択できます）。</p>}
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty title="景品はまだありません">ガチャを引いて宝物を集めましょう。</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {data.items.map((up) => {
            const can = up.status === "owned" && up.is_exchangeable;
            const on = picked.has(up.id);
            return (
              <button
                key={up.id}
                className={cx("relative text-left transition", selecting && !can && "opacity-40", on && "scale-[0.97]")}
                onClick={() => (selecting ? toggle(up) : setDetail(up))}
                aria-pressed={selecting ? on : undefined}
              >
                <PrizeCard
                  prize={up.prize}
                  size="sm"
                  lastOne={up.source === "last_one"}
                  highlight={!selecting || on}
                  footer={
                    <div className="flex items-center justify-between">
                      <span>{STATUS_LABEL[up.status]}</span>
                      <span>{fmtDateTime(up.acquired_at).slice(0, 10)}</span>
                    </div>
                  }
                />
                {selecting && can && (
                  <span
                    className={cx(
                      "absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm font-bold",
                      on ? "border-gold bg-gold text-night" : "border-white/60 bg-night/60",
                    )}
                    aria-hidden
                  >
                    {on && "✓"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {data && <Pagination page={page} total={data.total} perPage={30} onChange={setPage} />}

      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-56">
              <PrizeCard prize={detail.prize} size="lg" lastOne={detail.source === "last_one"} />
            </div>
            <div>
              <RarityBadge rarity={detail.prize.rarity} size="md" />
              <p className="mt-2 font-serif text-xl font-bold">{detail.prize.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-moon/65">{detail.prize.description}</p>
            </div>
            <dl className="w-full space-y-1 rounded-xl bg-veil/[0.03] p-4 text-left text-sm">
              <div className="flex justify-between"><dt className="text-moon/55">獲得日時</dt><dd>{fmtDateTime(detail.acquired_at)}</dd></div>
              <div className="flex justify-between"><dt className="text-moon/55">獲得元</dt><dd>{detail.gacha_title ?? "—"}{detail.source === "last_one" && "（ラストワン賞）"}</dd></div>
              <div className="flex justify-between"><dt className="text-moon/55">発送状況</dt><dd>{STATUS_LABEL[detail.status]}</dd></div>
            </dl>
            {detail.status === "owned" && detail.is_exchangeable && (
              <Button className="w-full" href={`/exchanges/new?ids=${detail.id}`}>この景品の発送を申請する</Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function PrizesPage() {
  return (
    <RequireAuth>
      {() => (
        <Suspense>
          <Content />
        </Suspense>
      )}
    </RequireAuth>
  );
}
