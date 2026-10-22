"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import GachaForm, { type GachaFormValue } from "@/components/admin/GachaForm";
import { Badge, GACHA_STATUS as STATUS, Stat, TableWrap } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Alert, Button, Field, Modal, PageTitle, Panel, RarityBadge, Spinner, Tabs } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime, fmtNum, fmtPercent } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import type { Rarity } from "@/lib/types";

type Item = { id: number; prize_id: number; weight: number; stock_total: number | null; stock_remaining: number | null; sort_order: number; is_active: boolean; probability: number; prize: { id: number; name: string; rarity: Rarity; image_url: string | null } };
type G = GachaFormValue & { id: number; status: string; pulls_done: number; remaining: number | null; has_last_one: boolean; is_open: boolean; last_one_award: { user_id: number; draw_id: string; awarded_at: string } | null; items: Item[] };
type Row = { prize_id: number; weight: number; stock_total: number | null; sort_order: number; is_active: boolean };

export default function AdminGachaDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: g, mutate } = useSWR<G>(`/api/admin/gachas/${id}`, fetcher);
  const { data: prizes } = useSWR<{ items: { id: number; name: string; rarity: Rarity }[] }>("/api/admin/prizes?per_page=500", fetcher);
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  const toast = useToast();
  const [tab, setTab] = useState<"items" | "info">("items");
  const [rows, setRows] = useState<Row[]>([]);
  const [addPrize, setAddPrize] = useState("");
  const [stockItem, setStockItem] = useState<Item | null>(null);
  const [stock, setStock] = useState({ delta: "10", reason: "" });

  useEffect(() => {
    if (g) setRows(g.items.map((i) => ({ prize_id: i.prize_id, weight: i.weight, stock_total: i.stock_total, sort_order: i.sort_order, is_active: i.is_active })));
  }, [g]);

  const prizeMap = useMemo(() => new Map((prizes?.items ?? []).map((p) => [p.id, p])), [prizes]);
  // 編集中の確率をその場で再計算
  const preview = useMemo(() => {
    if (!g) return new Map<number, number>();
    const w = rows.map((r) => {
      if (!r.is_active) return 0;
      if (g.mode === "box") {
        const cur = g.items.find((i) => i.prize_id === r.prize_id);
        return cur && g.pulls_done > 0 ? (cur.stock_remaining ?? 0) : (r.stock_total ?? 0);
      }
      return r.weight;
    });
    const total = w.reduce((a, b) => a + b, 0);
    return new Map(rows.map((r, i) => [r.prize_id, total ? w[i] / total : 0]));
  }, [rows, g]);
  const rarityTotals = useMemo(() => {
    const t: Record<string, number> = { SSR: 0, SR: 0, R: 0, N: 0 };
    rows.forEach((r) => {
      const p = prizeMap.get(r.prize_id);
      if (p) t[p.rarity] += preview.get(r.prize_id) ?? 0;
    });
    return t;
  }, [rows, prizeMap, preview]);

  if (!g) return <Spinner />;
  const started = g.pulls_done > 0;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <nav className="mb-3 text-xs text-moon/50"><Link href="/admin/gachas" className="hover:text-gold-light">ガチャ管理</Link> / {g.title}</nav>
      <PageTitle
        en={`GACHA #${g.id}`}
        title={g.title}
        sub={`/${g.slug}`}
        right={
          isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS[g.status][1]}>{STATUS[g.status][0]}</Badge>
              {g.status !== "published" && <Button size="sm" onClick={() => act(() => api(`/admin/gachas/${g.id}/status`, { body: { status: "published" } }), "公開しました")}>公開する</Button>}
              {g.status === "published" && <Button size="sm" variant="subtle" onClick={() => confirm("非公開（下書き）に戻しますか？") && act(() => api(`/admin/gachas/${g.id}/status`, { body: { status: "draft" } }), "非公開にしました")}>非公開にする</Button>}
              {g.status !== "archived" && <Button size="sm" variant="subtle" onClick={() => confirm("このガチャを終了しますか？") && act(() => api(`/admin/gachas/${g.id}/status`, { body: { status: "archived" } }), "終了しました")}>終了する</Button>}
              <Button size="sm" variant="ghost" href={`/gacha/${g.slug}`}>公開ページ</Button>
            </div>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="抽選済み口数" value={fmtNum(g.pulls_done)} />
        <Stat label="残り口数" value={g.remaining == null ? "無制限" : fmtNum(g.remaining)} />
        <Stat label="1回あたり" value={`${g.ticket_cost}枚`} sub={g.mode === "box" ? "ボックス方式" : "確率抽選方式"} />
        <Stat
          label="ラストワン賞"
          value={g.has_last_one ? (g.last_one_award ? "付与済み" : "未付与") : "なし"}
          sub={g.last_one_award ? <Link className="underline" href={`/admin/users/${g.last_one_award.user_id}`}>ユーザー #{g.last_one_award.user_id}・{fmtDateTime(g.last_one_award.awarded_at)}</Link> : undefined}
        />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: "items", label: "景品・確率・在庫" }, { value: "info", label: "基本設定・ラストワン賞" }]} />
      {tab === "info" ? (
        <Panel>
          <GachaForm
            initial={g}
            prizes={prizes?.items ?? []}
            locked={started}
            submitLabel="保存する"
            onSubmit={async (v) => act(() => api(`/admin/gachas/${g.id}`, { method: "PUT", body: v }), "保存しました")}
          />
        </Panel>
      ) : (
        <>
          {started && <div className="mb-4"><Alert kind="info">抽選開始後のため、在庫総数は「在庫調整」から増減してください。当選確率（重み）と有効／無効は変更できます。変更は操作履歴に記録されます。</Alert></div>}
          <div className="mb-4 grid grid-cols-4 gap-2">
            {(["SSR", "SR", "R", "N"] as Rarity[]).map((r) => (
              <div key={r} className="glass px-3 py-2 text-center">
                <RarityBadge rarity={r} />
                <p className="mt-1 font-display text-lg font-bold tabular-nums">{fmtPercent(rarityTotals[r])}</p>
              </div>
            ))}
          </div>
          <TableWrap>
            <table className="table-base">
              <thead>
                <tr>
                  <th>景品</th>
                  {g.mode === "probability" && <th className="text-right">重み</th>}
                  <th className="text-right">在庫総数</th>
                  <th className="text-right">残り在庫</th>
                  <th className="text-right">提供割合</th>
                  <th>有効</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const p = prizeMap.get(r.prize_id);
                  const cur = g.items.find((x) => x.prize_id === r.prize_id);
                  return (
                    <tr key={r.prize_id} className={r.is_active ? "" : "opacity-50"}>
                      <td className="text-sm">
                        {p && <RarityBadge rarity={p.rarity} />} <span className="ml-1">{p?.name ?? `#${r.prize_id}`}</span>
                      </td>
                      {g.mode === "probability" && (
                        <td className="text-right">
                          <input className="field w-24 py-1.5 text-right text-sm" type="number" min={0} disabled={!isAdmin} value={r.weight} onChange={(e) => setRow(i, { weight: Number(e.target.value) })} aria-label="重み" />
                        </td>
                      )}
                      <td className="text-right">
                        <input
                          className="field w-24 py-1.5 text-right text-sm"
                          type="number"
                          min={0}
                          placeholder={g.mode === "box" ? "必須" : "無制限"}
                          disabled={!isAdmin || (started && !!cur)}
                          value={r.stock_total ?? ""}
                          onChange={(e) => setRow(i, { stock_total: e.target.value === "" ? null : Number(e.target.value) })}
                          aria-label="在庫総数"
                        />
                      </td>
                      <td className="text-right tabular-nums">{cur?.stock_remaining ?? (cur ? "∞" : "—")}</td>
                      <td className="text-right tabular-nums text-gold-light">{fmtPercent(preview.get(r.prize_id) ?? 0)}</td>
                      <td><input type="checkbox" className="h-4 w-4 accent-[#D8B976]" disabled={!isAdmin} checked={r.is_active} onChange={(e) => setRow(i, { is_active: e.target.checked })} aria-label="有効" /></td>
                      <td className="whitespace-nowrap text-right">
                        {isAdmin && cur?.stock_total != null && <Button size="sm" variant="subtle" onClick={() => setStockItem(cur)}>在庫調整</Button>}
                        {isAdmin && !cur && <button className="ml-2 text-xs text-rose-300" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>削除</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          {isAdmin && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Field label="景品を追加">
                <select className="field w-72" value={addPrize} onChange={(e) => setAddPrize(e.target.value)}>
                  <option value="">選択してください</option>
                  {(prizes?.items ?? []).filter((p) => !rows.some((r) => r.prize_id === p.id)).map((p) => (
                    <option key={p.id} value={p.id}>[{p.rarity}] {p.name}</option>
                  ))}
                </select>
              </Field>
              <Button variant="subtle" disabled={!addPrize} onClick={() => (setRows((rs) => [...rs, { prize_id: Number(addPrize), weight: 0, stock_total: g.mode === "box" ? 1 : null, sort_order: rs.length + 1, is_active: true }]), setAddPrize(""))}>
                追加
              </Button>
              <Button className="ml-auto" onClick={() => act(() => api(`/admin/gachas/${g.id}/items`, { method: "PUT", body: { items: rows } }), "景品構成と確率を保存しました")}>
                景品構成を保存
              </Button>
            </div>
          )}
        </>
      )}
      <Modal open={!!stockItem} onClose={() => setStockItem(null)} title="在庫調整">
        {stockItem && (
          <div className="space-y-4">
            <p className="text-sm text-moon/65">
              {stockItem.prize.name}：残り {stockItem.stock_remaining} / 総数 {stockItem.stock_total}
            </p>
            <Field label="増減数（マイナスで減少）">
              <input className="field" type="number" value={stock.delta} onChange={(e) => setStock({ ...stock, delta: e.target.value })} />
            </Field>
            <Field label="理由">
              <input className="field" value={stock.reason} onChange={(e) => setStock({ ...stock, reason: e.target.value })} placeholder="例：追加入荷" />
            </Field>
            <Button
              className="w-full"
              disabled={!Number(stock.delta) || stock.reason.trim().length < 2}
              onClick={() =>
                act(() => api(`/admin/gachas/${g.id}/stock`, { body: { item_id: stockItem.id, delta: Number(stock.delta), reason: stock.reason } }), "在庫を調整しました").then(() => {
                  setStockItem(null);
                  setStock({ delta: "10", reason: "" });
                })
              }
            >
              調整する
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
