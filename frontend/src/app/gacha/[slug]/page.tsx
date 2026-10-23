import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverGet } from "@/lib/server";
import { SITE } from "@/lib/site";
import type { GachaDetail } from "@/lib/types";
import GachaDetailView from "./view";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const g = await serverGet<GachaDetail>(`/gachas/${encodeURIComponent(slug)}`, 10);
  if (!g) return { title: "ガチャ" };
  const title = `${g.title}｜${SITE.name}`;
  const description = [g.subtitle, `1回 チケット${g.ticket_cost}枚`, g.last_one_prize ? `ラストワン賞「${g.last_one_prize.name}」` : null].filter(Boolean).join("・");
  // ガチャのバナー画像を共有カードに使う。WebP などは LINE で表示されない場合があるため、JPEG・PNG 以外はサイト共通の画像
  const image = g.banner_image_url && /\.(jpe?g|png)(\?|$)/i.test(g.banner_image_url) ? g.banner_image_url : "/og.jpg";
  return {
    title: g.title,
    description,
    openGraph: { title, description, images: [{ url: image }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function GachaPage({ params }: Params) {
  const { slug } = await params;
  const g = await serverGet<GachaDetail>(`/gachas/${encodeURIComponent(slug)}`, 5);
  if (!g) notFound();
  return <GachaDetailView initial={g} />;
}
