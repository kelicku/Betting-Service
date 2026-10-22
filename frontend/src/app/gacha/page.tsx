import type { Metadata } from "next";
import { RecentWinsTicker } from "@/components/Engage";
import GachaCard from "@/components/GachaCard";
import { PageTitle } from "@/components/ui";
import { serverGet } from "@/lib/server";
import type { GachaSummary } from "@/lib/types";

export const metadata: Metadata = { title: "ガチャ一覧" };
// ビルド時はバックエンドに接続できないため、事前生成せずリクエストごとに描画する（API の取得結果は短時間キャッシュ）
export const dynamic = "force-dynamic";

export default async function GachaListPage() {
  const gachas = (await serverGet<GachaSummary[]>("/gachas", 15)) ?? [];
  const open = gachas.filter((g) => g.is_open);
  const closed = gachas.filter((g) => !g.is_open);
  return (
    <>
    <RecentWinsTicker />
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageTitle en="GACHA" title="ガチャ一覧" sub="提供割合・残り口数は各ガチャの詳細ページでご確認いただけます。" />
      {open.length === 0 && <p className="py-16 text-center text-moon/60">現在開催中のガチャはありません。</p>}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {open.map((g, i) => (
          <GachaCard key={g.id} g={g} index={i} />
        ))}
      </div>
      {closed.length > 0 && (
        <>
          <h2 className="mb-4 mt-14 font-serif text-xl text-moon/70">開催期間外・終了したガチャ</h2>
          <div className="grid gap-6 opacity-70 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map((g, i) => (
              <GachaCard key={g.id} g={g} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
    </>
  );
}
