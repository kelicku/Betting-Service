"use client";

import Link from "next/link";
import useSWR from "swr";
import BarChart from "@/components/admin/BarChart";
import { Stat } from "@/components/admin/kit";
import { PageTitle, RarityBadge, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { RARITIES, fmtNum } from "@/lib/format";
import type { Rarity } from "@/lib/types";

type Stats = {
  users_total: number;
  users_today: number;
  users_suspended: number;
  draws_today: number;
  pulls_today: number;
  tickets_issued_today: number;
  tickets_spent_today: number;
  tickets_outstanding: number;
  points_outstanding?: number;
  shop_orders_pending?: number;
  exchanges_pending: number;
  exchanges_in_progress: number;
  conversions_today: number;
  contacts_open: number;
  gachas_live: number;
  rarity_distribution: Partial<Record<Rarity, number>>;
  series: { date: string; signups: number; draws: number; pulls: number; tickets_issued: number; tickets_spent: number }[];
};

export default function AdminDashboard() {
  const { data } = useSWR<Stats>("/api/admin/stats", fetcher, { refreshInterval: 30000 });
  if (!data) return <Spinner />;
  const totalRarity = Object.values(data.rarity_distribution).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <div>
      <PageTitle en="DASHBOARD" title="ダッシュボード" sub="本日（日本時間）の運営状況" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="会員数" value={fmtNum(data.users_total)} sub={`本日 +${data.users_today}・停止中 ${data.users_suspended}`} />
        <Stat label="本日の抽選" value={fmtNum(data.pulls_today)} sub={`${data.draws_today}リクエスト`} />
        <Stat label="本日のチケット" value={`+${fmtNum(data.tickets_issued_today)}`} sub={`使用 −${fmtNum(data.tickets_spent_today)}`} />
        <Stat label="流通中チケット" value={fmtNum(data.tickets_outstanding)} sub="全会員の残高合計" />
        <Stat label="流通中ポイント" value={fmtNum(data.points_outstanding ?? 0)} sub="ポイント交換に使える残高の合計" />
        <Stat label="ポイント交換（対応待ち）" value={fmtNum(data.shop_orders_pending ?? 0)} sub="ギフトコード・発送の対応待ち" />
        <Link href="/admin/exchanges?status=pending">
          <Stat label="未対応の発送申請" value={data.exchanges_pending} sub={`対応中 ${data.exchanges_in_progress}件`} accent={data.exchanges_pending > 0} />
        </Link>
        <Stat label="本日の広告・アンケート成果" value={data.conversions_today} sub="テスト成果を除く" />
        <Link href="/admin/settings?tab=contacts">
          <Stat label="未対応のお問い合わせ" value={data.contacts_open} accent={data.contacts_open > 0} />
        </Link>
        <Stat label="公開中のガチャ" value={data.gachas_live} />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <BarChart title="日別の抽選口数（14日間）" data={data.series} series={[{ key: "pulls", label: "抽選口数" }]} />
        <BarChart
          title="日別のチケット発行・使用（14日間）"
          data={data.series}
          series={[
            { key: "tickets_issued", label: "発行" },
            { key: "tickets_spent", label: "使用" },
          ]}
        />
        <BarChart title="日別の新規登録（14日間）" data={data.series} series={[{ key: "signups", label: "新規登録" }]} />
        <div className="glass p-5">
          <p className="mb-4 font-serif font-bold text-gold-light">景品のレアリティ別払い出し（14日間）</p>
          <ul className="space-y-3">
            {RARITIES.map((r) => {
              const n = data.rarity_distribution[r] ?? 0;
              const pct = totalRarity ? (n / totalRarity) * 100 : 0;
              return (
                <li key={r} className="flex items-center gap-3 text-sm">
                  <RarityBadge rarity={r} />
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-veil/10">
                    <div className="h-full rounded-full bg-[#9B7BEA]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-28 text-right tabular-nums text-moon/75">
                    {fmtNum(n)}（{pct.toFixed(1)}%）
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
