"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import GachaForm, { EMPTY_GACHA } from "@/components/admin/GachaForm";
import { Badge, GACHA_STATUS as STATUS, TableWrap } from "@/components/admin/kit";
import { useToast } from "@/components/Toast";
import { Button, Modal, PageTitle, Spinner } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { useMe } from "@/lib/hooks";

type AdminGacha = {
  id: number;
  slug: string;
  title: string;
  mode: "probability" | "box";
  status: "draft" | "published" | "archived";
  ticket_cost: number;
  pulls_done: number;
  remaining: number | null;
  is_open: boolean;
  has_last_one: boolean;
  last_one_award: unknown;
  ends_at: string | null;
};


export default function AdminGachas() {
  const { data, mutate } = useSWR<{ items: AdminGacha[] }>("/api/admin/gachas", fetcher);
  const { data: prizes } = useSWR<{ items: { id: number; name: string; rarity: string }[] }>("/api/admin/prizes?per_page=500", fetcher);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const { me } = useMe();
  return (
    <div>
      <PageTitle en="GACHA" title="ガチャ管理" right={me?.role === "admin" && <Button onClick={() => setOpen(true)}>新しいガチャを作成</Button>} />
      {!data ? (
        <Spinner />
      ) : (
        <TableWrap>
          <table className="table-base">
            <thead>
              <tr><th>ガチャ</th><th>状態</th><th>方式</th><th className="text-right">枚/回</th><th className="text-right">抽選済み</th><th className="text-right">残り口数</th><th>ラストワン</th><th>終了</th></tr>
            </thead>
            <tbody>
              {data.items.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link href={`/admin/gachas/${g.id}`} className="hover:text-gold-light">
                      <span className="block font-medium">{g.title}</span>
                      <span className="text-xs text-moon/45">/{g.slug}</span>
                    </Link>
                  </td>
                  <td>
                    <Badge tone={STATUS[g.status][1]}>{STATUS[g.status][0]}</Badge> {g.status === "published" && !g.is_open && <Badge tone="warn">期間外</Badge>}
                  </td>
                  <td className="text-xs">{g.mode === "box" ? "ボックス" : "確率"}</td>
                  <td className="text-right tabular-nums">{g.ticket_cost}</td>
                  <td className="text-right tabular-nums">{fmtNum(g.pulls_done)}</td>
                  <td className="text-right tabular-nums">{g.remaining == null ? "無制限" : fmtNum(g.remaining)}</td>
                  <td className="text-xs">{g.has_last_one ? (g.last_one_award ? <Badge tone="warn">付与済み</Badge> : <Badge tone="info">設定あり</Badge>) : <Badge tone="bad">未設定</Badge>}</td>
                  <td className="text-xs text-moon/55">{fmtDateTime(g.ends_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="新しいガチャを作成" wide>
        <GachaForm
          initial={EMPTY_GACHA}
          prizes={prizes?.items ?? []}
          submitLabel="下書きとして作成"
          onSubmit={async (v) => {
            try {
              const g = await api<AdminGacha>("/admin/gachas", { body: v });
              toast("ガチャを作成しました。続けて景品と確率を設定してください。");
              mutate();
              router.push(`/admin/gachas/${g.id}`);
            } catch (e) {
              toast((e as ApiError).message, "error");
            }
          }}
        />
      </Modal>
    </div>
  );
}
