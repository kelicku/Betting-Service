"use client";

import { useState } from "react";
import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { useToast } from "@/components/Toast";
import { Alert, Button, Empty, Modal, PageTitle, Panel, Spinner, Tabs, TicketIcon, cx } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { refreshMe } from "@/lib/hooks";
import type { Me, Mission, Offer } from "@/lib/types";

function OfferCard({ o, onStart }: { o: Offer; onStart: (o: Offer) => void }) {
  const video = o.kind === "video";
  // 動画リワード広告は 1 日の視聴上限（すべての動画の合計、日本時間 0:00 にリセット）。それ以外は案件ごとの獲得上限
  const done = video ? (o.daily_used ?? 0) >= (o.daily_limit ?? 0) : o.earned_count >= o.per_user_limit;
  return (
    <div className="glass flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-veil/10 px-2 py-0.5 text-[11px] text-moon/60">{video ? "動画" : o.kind === "ad" ? "広告" : "アンケート"}</span>
            {o.estimated_minutes != null && <span className="text-[11px] text-moon/45">約{o.estimated_minutes}分</span>}
            {o.is_test && <span className="rounded-full bg-aurora/15 px-2 py-0.5 text-[11px] text-aurora">開発用テスト案件</span>}
          </div>
          <h3 className="font-serif font-bold leading-snug">{o.title}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-center rounded-xl border border-gold/40 bg-gold/10 px-3 py-1.5">
          <span className="flex items-center gap-1 font-display text-xl font-bold text-gold-light">
            <TicketIcon className="h-4 w-4" />
            {o.reward_tickets}
          </span>
          <span className="text-[10px] text-gold/70">獲得チケット</span>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-moon/65">{o.description}</p>
      {o.conditions && (
        <p className="mt-2 rounded-lg bg-veil/[0.03] px-3 py-2 text-xs leading-relaxed text-moon/55">
          <span className="text-gold-light/80">成果条件：</span>
          {o.conditions}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-moon/45">
        {video ? (
          <span className={cx(done && "font-bold text-gold-light")}>
            今日の視聴 {o.daily_used ?? 0}/{o.daily_limit ?? 0}回{done && "（0:00 にリセット）"}
          </span>
        ) : (
          <span>
            獲得 {o.earned_count}/{o.per_user_limit}回{o.ends_at && `・${fmtDate(o.ends_at)}まで`}
          </span>
        )}
        <Button size="sm" variant={done ? "subtle" : "gold"} disabled={done} onClick={() => onStart(o)}>
          {done ? (video ? "今日の上限に達しました" : "獲得済み") : video ? "動画を見る" : "挑戦する"}
        </Button>
      </div>
    </div>
  );
}

function Content({ me }: { me: Me }) {
  const [tab, setTab] = useState<"all" | "video" | "ad" | "survey" | "mission">("all");
  const { data: offers, mutate: mutOffers } = useSWR<Offer[]>("/api/offers", fetcher);
  const { data: missions, mutate: mutMissions } = useSWR<Mission[]>("/api/missions", fetcher);
  const { data: cfg } = useSWR<{ mock_offers: boolean }>("/api/config", fetcher);
  const toast = useToast();
  const [active, setActive] = useState<{ offer: Offer; url: string; clickId: string } | null>(null);

  const start = async (o: Offer) => {
    if (!me.email_verified) return toast("チケットを獲得するにはメールアドレスの確認が必要です。", "error");
    try {
      const r = await api<{ url: string; click_id: string }>(`/offers/${o.id}/start`, { method: "POST" });
      setActive({ offer: o, url: r.url, clickId: r.click_id });
    } catch (e) {
      toast((e as ApiError).message, "error");
      if ((e as ApiError).code === "video_daily_limit") mutOffers();
    }
  };

  const simulate = async () => {
    if (!active) return;
    try {
      const r = await api<{ outcome: string; balance: number }>(`/offers/clicks/${active.clickId}/simulate`, { method: "POST" });
      if (r.outcome === "credited") toast(`成果が確認されました。チケット${active.offer.reward_tickets}枚を獲得！`);
      else toast(`成果は付与されませんでした（${r.outcome}）`, "error");
      refreshMe({ balance: r.balance });
      setActive(null);
      mutOffers();
      mutMissions();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  const claim = async (m: Mission) => {
    try {
      const r = await api<{ amount: number; balance: number }>(`/missions/${m.id}/claim`, { method: "POST" });
      toast(`「${m.title}」達成！チケット${r.amount}枚を獲得しました`);
      refreshMe({ balance: r.balance });
      mutMissions();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };

  const list = (offers ?? []).filter((o) => tab === "all" || o.kind === tab);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageTitle en="EARN TICKETS" title="チケットを獲得する" sub="広告視聴・アンケート回答・ミッション達成でチケットがもらえます。" />
      {!me.email_verified && (
        <div className="mb-6">
          <Alert kind="warn">チケットを獲得するには、メールアドレスの確認が必要です。</Alert>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "all", label: "すべての案件", count: offers?.length },
          { value: "video", label: "動画", count: offers?.filter((o) => o.kind === "video").length },
          { value: "ad", label: "広告", count: offers?.filter((o) => o.kind === "ad").length },
          { value: "survey", label: "アンケート", count: offers?.filter((o) => o.kind === "survey").length },
          { value: "mission", label: "ミッション・キャンペーン", count: missions?.filter((m) => m.claimable).length },
        ]}
      />
      {tab === "mission" ? (
        !missions ? (
          <Spinner />
        ) : missions.length === 0 ? (
          <Empty title="現在参加できるミッションはありません" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {missions.map((m) => (
              <Panel key={m.id} className={cx(m.claimable && "border-gold/50 shadow-glow")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full border border-veil/10 px-2 py-0.5 text-[11px] text-moon/60">{m.kind === "campaign" ? "キャンペーン" : "条件達成"}</span>
                    <h3 className="mt-2 font-serif font-bold">{m.title}</h3>
                    <p className="mt-1 text-sm text-moon/60">{m.description}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 font-display text-xl font-bold text-gold-light">
                    <TicketIcon className="h-4 w-4" />
                    {m.reward_tickets}
                  </span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-veil/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-amethyst to-gold" style={{ width: `${(m.progress / m.target) * 100}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-moon/50">
                  <span>
                    進捗 {m.progress}/{m.target}
                    {m.ends_at && `・${fmtDate(m.ends_at)}まで`}
                  </span>
                  <Button size="sm" disabled={!m.claimable} variant={m.claimed ? "subtle" : "gold"} onClick={() => claim(m)}>
                    {m.claimed ? "受け取り済み" : m.claimable ? (m.kind === "campaign" ? "参加して受け取る" : "受け取る") : "未達成"}
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        )
      ) : !offers ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Empty title="現在ご利用いただける案件はありません">新しい案件が追加されるまでお待ちください。</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.map((o) => (
            <OfferCard key={o.id} o={o} onStart={start} />
          ))}
        </div>
      )}
      <p className="mt-8 text-xs leading-relaxed text-moon/40">
        ※ チケットは、広告事業者・アンケート事業者から成果が正式に通知され、確認できた場合にのみ付与されます。成果の反映には時間がかかる場合があります。
        同一案件の重複参加、不正な手段による参加は付与の対象外です。
      </p>

      <Modal open={!!active} onClose={() => setActive(null)} title={active?.offer.title}>
        {active && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-moon/70">案件ページで条件を達成すると、成果の確認後にチケット{active.offer.reward_tickets}枚が自動で付与されます。</p>
            <Button className="w-full" onClick={() => window.open(active.url, "_blank", "noopener,noreferrer")}>
              案件ページを開く
            </Button>
            {cfg?.mock_offers && active.offer.is_test && (
              <div className="rounded-xl border border-dashed border-aurora/40 p-4">
                <p className="text-xs leading-relaxed text-aurora-300">
                  【開発環境のみ】実際の広告事業者が未接続のため、模擬事業者からの署名付き成果通知を発生させて動作を確認できます。付与されたチケットは「テスト」として記録されます。
                </p>
                <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={simulate}>
                  成果通知をシミュレートする
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function EarnPage() {
  return <RequireAuth>{(me) => <Content me={me} />}</RequireAuth>;
}
