"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import CouponBox from "@/components/CouponBox";
import { RequireAuth } from "@/components/Guard";
import { useToast } from "@/components/Toast";
import { TreasureChest } from "@/components/TreasureChest";
import { Alert, Button, Panel, PageTitle, Points, RarityBadge, Tickets, cx } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { RARITIES, fmtDateTime } from "@/lib/format";
import { refreshMe } from "@/lib/hooks";
import type { DrawSummary, Me, Page } from "@/lib/types";

function DailyBonus() {
  const { data, mutate } = useSWR<{ claimed_today: boolean; streak: number; next_reward: number }>("/api/rewards/daily", fetcher);
  const toast = useToast();
  const [burst, setBurst] = useState(0);
  const [busy, setBusy] = useState(false);
  const claim = async () => {
    setBusy(true);
    try {
      const r = await api<{ amount: number; streak: number; balance: number }>("/rewards/daily", { method: "POST" });
      setBurst((b) => b + 1); // ふたが開いて金貨が飛び出す
      toast(`ログインボーナス：チケット${r.amount}枚を受け取りました（${r.streak}日連続）`);
      refreshMe({ balance: r.balance });
      mutate();
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setBusy(false);
    }
  };
  if (!data) return null;
  const claimed = data.claimed_today;
  // 今週の何日目まで受け取ったか（7 日ごとにリセット）
  const filledDays = data.streak > 0 ? ((data.streak - 1) % 7) + 1 : 0;
  return (
    <Panel strong className="overflow-hidden p-0">
      <div className="bonus-stage relative isolate flex flex-col items-center overflow-hidden px-5 pb-4 pt-5 text-center">
        <p className="font-display text-[11px] tracking-[0.35em] text-[#ffe08a]/80">DAILY BONUS</p>
        <h2 className="mt-1 font-round text-lg font-black text-white">毎日のログインボーナス</h2>
        <TreasureChest open={claimed} dim={claimed && burst === 0} burstKey={burst} className="mt-1" />
        <p className="-mt-1 font-round text-sm font-bold text-[#ffe9a8]">
          {claimed ? "本日のお宝は受け取り済み。また明日！" : `今日のお宝：チケット${data.next_reward}枚`}
        </p>
      </div>
      <div className="px-5 pb-5 pt-4">
        <div className="flex items-center gap-1.5" aria-label={`連続${data.streak}日`}>
          {Array.from({ length: 7 }).map((_, i) => {
            const filled = i < filledDays;
            const today = !claimed && i === filledDays % 7;
            return (
              <span
                key={i}
                className={cx(
                  "sh-gem [--c:6px] flex h-9 flex-1 items-center justify-center font-round text-xs font-bold transition",
                  filled ? "bg-[linear-gradient(180deg,#ffe58a,#f0a91e)] text-[#7a4a00]" : today ? "bg-[#fff2c4] text-[#c98a10] shadow-[inset_0_0_0_2px_#f6c445]" : "bg-veil/5 text-moon/40",
                )}
              >
                {i === 6 ? "★" : i + 1}
              </span>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-moon/55">7日連続でボーナスが増えます（現在 {data.streak}日連続）</p>
        <Button className="mt-4 w-full" disabled={claimed} loading={busy} onClick={claim}>
          {claimed ? "本日は受け取り済みです" : `宝箱を開けてチケット${data.next_reward}枚を受け取る`}
        </Button>
      </div>
    </Panel>
  );
}

function Content({ me }: { me: Me }) {
  const { data: draws } = useSWR<Page<DrawSummary>>("/api/draws?per_page=5", fetcher);
  const { data: summary } = useSWR<{ by_rarity: Record<string, number>; by_status: Record<string, number> }>("/api/prizes/summary", fetcher);
  const toast = useToast();
  const resend = async () => {
    try {
      await api("/auth/resend-verification", { method: "POST" });
      toast("確認メールを再送しました。");
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageTitle en="MY PAGE" title="マイページ" sub={`${me.display_name} さん、おかえりなさい。`} />
      {!me.email_verified && (
        <div className="mb-6">
          <Alert kind="warn">
            メールアドレスの確認が完了していません。確認が完了すると新規登録特典のチケットを受け取れ、ガチャを引けるようになります。
            <button onClick={resend} className="ml-2 font-bold underline underline-offset-2">確認メールを再送する</button>
          </Alert>
        </div>
      )}
      {me.sms_required && (
        <div className="mb-6">
          <Alert kind="warn">
            初めてポイント交換・景品の発送申請をするときに、電話番号の確認（SMS 認証）が必要です。
            <Link href="/verify-phone" className="ml-2 font-bold underline underline-offset-2">電話番号を確認する</Link>
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel strong className="lg:col-span-2">
          {/* チケット（ガチャ用）とポイント（交換用）は別々の残高 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gold/15 bg-white/70 p-4">
              <p className="text-sm font-bold text-moon/60">ガチャチケット</p>
              <Tickets n={me.balance} className="mt-1 text-4xl text-gold-light" />
              <p className="mt-1 text-xs text-moon/50">ガチャを引くときに使います</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" href="/gacha">ガチャを引く</Button>
                <Button size="sm" variant="ghost" href="/earn">チケットを獲得する</Button>
              </div>
            </div>
            <div className="rounded-2xl border border-[#f6c445]/50 bg-white/70 p-4">
              <p className="text-sm font-bold text-moon/60">ポイント</p>
              <Points n={me.point_balance} className="mt-1 text-4xl text-[#e08a00]" />
              <p className="mt-1 text-xs text-moon/50">ガチャで当たり、ギフトと交換できます</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="purple" href="/shop">ポイント交換</Button>
                <Button size="sm" variant="ghost" href="/points">ポイントの履歴</Button>
              </div>
            </div>
          </div>
          <div className="ornament-line my-6" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RARITIES.map((r) => (
              <Link key={r} href={`/prizes?rarity=${r}`} className="rounded-xl border border-veil/5 bg-veil/[0.03] p-3 text-center transition hover:border-gold/30">
                <RarityBadge rarity={r} />
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">{summary?.by_rarity[r] ?? 0}</p>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-moon/60">
            <span>所持中 {summary?.by_status.owned ?? 0}点</span>
            <span>発送申請中 {summary?.by_status.exchange_pending ?? 0}点</span>
            <span>発送完了 {summary?.by_status.exchanged ?? 0}点</span>
          </div>
        </Panel>
        <div className="space-y-6">
          <DailyBonus />
          <CouponBox />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel className="min-w-0 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-gold-light">最近の抽選</h2>
            <Link href="/draws" className="text-sm text-moon/60 hover:text-gold-light">抽選履歴を見る →</Link>
          </div>
          {draws?.items.length ? (
            <ul className="divide-y divide-veil/5">
              {draws.items.map((d) => (
                <li key={d.id}>
                  <Link href={`/draws/${d.id}`} className="flex min-w-0 items-center gap-3 py-3 hover:text-gold-light">
                    <RarityBadge rarity={d.best_rarity} />
                    <span className="min-w-0 flex-1 truncate">{d.gacha_title}（{d.count}回）</span>
                    {(d.points_won ?? 0) > 0 && <span className="shrink-0 text-xs font-bold text-[#e08a00]">+{(d.points_won ?? 0).toLocaleString("ja-JP")}pt</span>}
                    {d.has_last_one && <span className="shrink-0 text-xs text-gold-light">ラストワン賞</span>}
                    <span className="hidden shrink-0 text-xs text-moon/45 sm:inline">{fmtDateTime(d.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-moon/50">まだガチャを引いていません。</p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-3 font-serif text-lg font-bold text-gold-light">メニュー</h2>
          <nav className="grid gap-1 text-sm">
            {[
              ["/shop", "ポイント交換"],
              ["/shop/orders", "ポイント交換の履歴"],
              ["/invite", "友達紹介（チケットがもらえる）"],
              ["/tickets", "チケットの履歴"],
              ["/points", "ポイントの履歴"],
              ["/prizes", "獲得した景品"],
              ["/exchanges", "景品の発送申請"],
              ["/draws", "抽選履歴"],
              ["/notifications", "通知"],
              ["/verify-phone", me.phone_verified ? "電話番号（確認済み）" : "電話番号の確認"],
              ["/settings", "プロフィール設定"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-moon/80 hover:bg-veil/5 hover:text-gold-light">
                {label} <span aria-hidden>›</span>
              </Link>
            ))}
          </nav>
        </Panel>
      </div>
    </div>
  );
}

export default function MyPage() {
  return <RequireAuth>{(me) => <Content me={me} />}</RequireAuth>;
}
