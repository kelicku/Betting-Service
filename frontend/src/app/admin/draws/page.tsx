"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWR from "swr";
import { Badge, SearchInput, Select, TableWrap, Toolbar, useAdminList } from "@/components/admin/kit";
import { Modal, PageTitle, Pagination, RarityBadge, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Rarity } from "@/lib/types";

type D = { id: string; user_id: number; email: string; gacha_id: number; gacha_title: string; count: number; tickets_spent: number; best_rarity: Rarity; has_last_one: boolean; created_at: string };
type Detail = D & { idempotency_key: string; digest_valid: boolean; results: { position: number; prize_name: string; rarity: Rarity; is_last_one: boolean }[] };

function DrawDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useSWR<Detail>(`/api/admin/draws/${id}`, fetcher);
  return (
    <Modal open onClose={onClose} title="抽選の詳細" wide>
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            {data.digest_valid ? <Badge tone="good">改ざん検知：正常（HMAC一致）</Badge> : <Badge tone="bad">改ざん検知：不一致</Badge>}
            {data.has_last_one && <Badge tone="warn">ラストワン賞を含む</Badge>}
          </div>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
            <dt className="text-moon/50">抽選ID</dt><dd className="font-mono">{data.id}</dd>
            <dt className="text-moon/50">ガチャ</dt><dd>{data.gacha_title}</dd>
            <dt className="text-moon/50">回数／消費</dt><dd>{data.count}回／チケット{data.tickets_spent}枚</dd>
            <dt className="text-moon/50">冪等キー</dt><dd className="font-mono">{data.idempotency_key}</dd>
            <dt className="text-moon/50">日時</dt><dd>{fmtDateTime(data.created_at)}</dd>
          </dl>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-veil/5">
            <table className="table-base">
              <thead><tr><th>#</th><th>レアリティ</th><th>景品</th></tr></thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.position}>
                    <td className="tabular-nums text-moon/45">{r.position + 1}</td>
                    <td><RarityBadge rarity={r.rarity} /></td>
                    <td>{r.prize_name} {r.is_last_one && <Badge tone="warn">ラストワン賞</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Content() {
  const sp = useSearchParams();
  const l = useAdminList<D>("/api/admin/draws", { user_id: sp.get("user_id") ?? "", gacha_id: "", rarity: "", last_one: "" }, 50);
  const { data: gachas } = useSWR<{ items: { id: number; title: string }[] }>("/api/admin/gachas", fetcher);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    const d = sp.get("draw");
    if (d) setSel(d);
  }, [sp]);
  return (
    <div>
      <PageTitle en="DRAWS" title="抽選履歴" />
      <Toolbar>
        <SearchInput value={l.filters.user_id} onChange={(v) => l.set("user_id", v)} placeholder="ユーザーID" />
        <Select label="ガチャ" value={l.filters.gacha_id} onChange={(v) => l.set("gacha_id", v)} options={[["", "すべてのガチャ"], ...(gachas?.items ?? []).map((g) => [String(g.id), g.title] as [string, string])]} />
        <Select label="最高レアリティ" value={l.filters.rarity} onChange={(v) => l.set("rarity", v)} options={[["", "最高レアリティ：すべて"], ["SSR", "SSR"], ["SR", "SR"], ["R", "R"], ["N", "N"]]} />
        <Select label="ラストワン" value={l.filters.last_one} onChange={(v) => l.set("last_one", v)} options={[["", "ラストワン：すべて"], ["true", "ラストワン賞あり"]]} />
      </Toolbar>
      {!l.data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>日時</th><th>ユーザー</th><th>ガチャ</th><th className="text-right">回数</th><th className="text-right">消費</th><th>最高</th><th /></tr></thead>
            <tbody>
              {l.data.items.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap text-xs text-moon/60">{fmtDateTime(d.created_at)}</td>
                  <td className="text-xs"><Link className="hover:text-gold-light" href={`/admin/users/${d.user_id}`}>{d.email}</Link></td>
                  <td className="text-xs">{d.gacha_title} {d.has_last_one && <Badge tone="warn">ラストワン</Badge>}</td>
                  <td className="text-right tabular-nums">{d.count}</td>
                  <td className="text-right tabular-nums">{d.tickets_spent}</td>
                  <td><RarityBadge rarity={d.best_rarity} /></td>
                  <td className="text-right"><button className="text-xs text-gold-light hover:underline" onClick={() => setSel(d.id)}>詳細</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {l.data && <Pagination page={l.page} total={l.data.total} perPage={l.perPage} onChange={l.setPage} />}
      {sel && <DrawDetail id={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

export default function AdminDraws() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
