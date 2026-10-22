import HomeHero, { type PublicStats } from "@/components/home/HomeHero";
import { type FeaturedPrize, HowToPlay, PickupGachas, PopularExchange, PrizeLineup, PromoCards } from "@/components/home/HomeSections";
import { serverGet } from "@/lib/server";
import type { GachaSummary } from "@/lib/types";

// ビルド時はバックエンドに接続できないため、事前生成せずリクエストごとに描画する（API の取得結果は短時間キャッシュ）
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [gachas, featured, stats] = await Promise.all([
    serverGet<GachaSummary[]>("/gachas"),
    serverGet<FeaturedPrize[]>("/featured-prizes"),
    serverGet<PublicStats>("/stats/public", 60),
  ]);
  const open = (gachas ?? []).filter((g) => g.is_open);

  return (
    <div className="home-page bg-[#fff8f1] text-[#1d2350]">
      <HomeHero />
      <div className="waku-lower relative">
        <PromoCards signupTickets={stats?.signup_bonus ?? 0} signupPoints={stats?.signup_bonus_points ?? 0} />
        <PickupGachas gachas={open} />
        <PrizeLineup prizes={featured ?? []} />
        <HowToPlay />
        <PopularExchange />
      </div>
    </div>
  );
}
