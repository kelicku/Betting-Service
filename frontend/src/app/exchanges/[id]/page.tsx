"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { PrizeCard } from "@/components/PrizeCard";
import { useToast } from "@/components/Toast";
import { Alert, Button, PageTitle, Panel, Spinner, StatusPill, cx } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { Exchange } from "@/lib/types";

const FLOW = [
  ["pending", "申請受付"],
  ["approved", "承認"],
  ["preparing", "発送準備"],
  ["shipped", "発送済み"],
  ["completed", "完了"],
] as const;

function Content() {
  const { id } = useParams<{ id: string }>();
  const { data: ex, mutate, error } = useSWR<Exchange>(`/api/exchanges/${id}`, fetcher);
  const toast = useToast();
  if (error) return <p className="py-24 text-center text-moon/60">{error.message}</p>;
  if (!ex) return <Spinner />;
  const idx = FLOW.findIndex(([s]) => s === ex.status);
  const cancel = async () => {
    if (!confirm("この発送申請を取り消しますか？")) return;
    try {
      await api(`/exchanges/${ex.id}/cancel`, { method: "POST" });
      toast("発送申請を取り消しました。");
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageTitle en="EXCHANGE" title={`発送申請 #${ex.id}`} sub={`申請日時：${fmtDateTime(ex.created_at)}`} right={<StatusPill status={ex.status} label={ex.status_label} />} />
      {ex.status === "rejected" || ex.status === "cancelled" ? (
        <div className="mb-6">
          <Alert kind={ex.status === "rejected" ? "error" : "info"}>
            {ex.status === "rejected" ? `この申請は却下されました。${ex.admin_note ? `理由：${ex.admin_note}` : ""}景品は所持中に戻っています。` : "この申請は取り消されました。景品は所持中に戻っています。"}
          </Alert>
        </div>
      ) : (
        <Panel className="mb-6">
          <ol className="flex items-center justify-between gap-1">
            {FLOW.map(([s, label], i) => (
              <li key={s} className="flex flex-1 flex-col items-center gap-2 text-center">
                <div className="flex w-full items-center">
                  <span className={cx("h-px flex-1", i === 0 ? "opacity-0" : i <= idx ? "bg-gold" : "bg-veil/15")} />
                  <span
                    className={cx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs",
                      i < idx && "border-gold bg-gold/30 text-gold-light",
                      i === idx && "border-gold bg-gold text-night shadow-glow",
                      i > idx && "border-veil/20 text-moon/40",
                    )}
                  >
                    {i < idx ? "✓" : i + 1}
                  </span>
                  <span className={cx("h-px flex-1", i === FLOW.length - 1 ? "opacity-0" : i < idx ? "bg-gold" : "bg-veil/15")} />
                </div>
                <span className={cx("text-[11px] sm:text-xs", i <= idx ? "text-gold-light" : "text-moon/40")}>{label}</span>
              </li>
            ))}
          </ol>
          {ex.tracking_number && (
            <p className="mt-5 rounded-xl bg-veil/[0.04] p-3 text-sm">
              配送業者：{ex.carrier ?? "—"}　お問い合わせ番号：<span className="font-mono text-gold-light">{ex.tracking_number}</span>
            </p>
          )}
        </Panel>
      )}
      <Panel>
        <h2 className="mb-4 font-serif font-bold text-gold-light">発送する景品</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {ex.items.map((it) => (
            <PrizeCard key={it.user_prize_id} prize={it.prize} size="sm" />
          ))}
        </div>
        {ex.recipient_masked && <p className="mt-4 text-sm text-moon/60">お届け先：{ex.recipient_masked} 様</p>}
        {ex.user_message && <p className="mt-1 text-sm text-moon/60">メッセージ：{ex.user_message}</p>}
        {ex.status === "pending" && (
          <div className="mt-6 text-right">
            <Button variant="subtle" size="sm" onClick={cancel}>申請を取り消す</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function ExchangeDetailPage() {
  return <RequireAuth>{() => <Content />}</RequireAuth>;
}
