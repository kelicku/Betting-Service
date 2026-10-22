import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { serverGet } from "@/lib/server";
import type { GachaDetail } from "@/lib/types";
import GachaDetailView from "./view";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const g = await serverGet<GachaDetail>(`/gachas/${encodeURIComponent(slug)}`, 10);
  return { title: g?.title ?? "ガチャ", description: g?.subtitle };
}

export default async function GachaPage({ params }: Params) {
  const { slug } = await params;
  const g = await serverGet<GachaDetail>(`/gachas/${encodeURIComponent(slug)}`, 5);
  if (!g) notFound();
  return <GachaDetailView initial={g} />;
}
