"use client";

/** 管理：当選ランク（特賞・大当たり・中当たり・小当たり）の表示名・演出動画（MP4）・ロゴ。 */

import { useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/Toast";
import { Alert, Button, Field, PageTitle, Panel, RarityBadge, Spinner } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { useMe, type RankEffect } from "@/lib/hooks";
import { mutate as globalMutate } from "swr";

function RankRow({ r, isAdmin, onSaved }: { r: RankEffect; isAdmin: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(r);
  const [busy, setBusy] = useState<"" | "video" | "logo" | "save">("");
  const upload = async (file: File, field: "video_url" | "logo_url") => {
    if (field === "video_url" && file.size > 30 * 1024 * 1024) return toast("動画は30MB以下にしてください（10MB以下を推奨）", "error");
    const form = new FormData();
    form.append("file", file);
    setBusy(field === "video_url" ? "video" : "logo");
    try {
      const res = await api<{ url: string }>("/admin/uploads?folder=effects", { form });
      setV((x) => ({ ...x, [field]: res.url }));
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setBusy("");
    }
  };
  const save = async () => {
    setBusy("save");
    try {
      await api(`/admin/ranks/${r.rarity}`, { method: "PUT", body: { label: v.label, video_url: v.video_url, logo_url: v.logo_url } });
      toast(`「${v.label}」を保存しました`);
      onSaved();
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setBusy("");
    }
  };
  const changed = v.label !== r.label || v.video_url !== r.video_url || v.logo_url !== r.logo_url;
  return (
    <Panel className="grid gap-4 md:grid-cols-[13rem_1fr_8rem]">
      <div className="space-y-2">
        <RarityBadge rarity={r.rarity} size="md" />
        <Field label="表示名"><input className="field" maxLength={20} value={v.label} disabled={!isAdmin} onChange={(e) => setV({ ...v, label: e.target.value })} /></Field>
        <p className="text-xs text-moon/50">内部のランク：{r.rarity}{r.rarity === "SSR" && "（ラストワン賞もこの演出）"}</p>
      </div>
      <div className="space-y-2">
        <p className="label">演出動画（MP4・縦長）</p>
        {v.video_url ? (
          <video src={v.video_url} className="h-56 rounded-xl bg-black" controls playsInline preload="metadata" />
        ) : (
          <p className="rounded-xl bg-veil/[0.04] p-4 text-sm text-moon/60">未設定（標準の演出を表示します）</p>
        )}
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-full border-2 border-dashed border-gold/40 px-3 py-1.5 text-sm font-bold text-gold-light">
              {busy === "video" ? "アップロード中…" : "動画をアップロード"}
              <input type="file" accept="video/mp4" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "video_url")} />
            </label>
            {v.video_url && <Button size="sm" variant="subtle" onClick={() => setV({ ...v, video_url: null })}>動画を外す</Button>}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <p className="label">ロゴ</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {v.logo_url ? <img src={v.logo_url} alt="" className="h-20 w-full rounded-xl bg-veil/[0.04] object-contain" /> : <p className="rounded-xl bg-veil/[0.04] p-3 text-xs text-moon/60">未設定</p>}
        {isAdmin && (
          <label className="block cursor-pointer rounded-full border-2 border-dashed border-gold/40 px-3 py-1.5 text-center text-sm font-bold text-gold-light">
            {busy === "logo" ? "…" : "画像を選ぶ"}
            <input type="file" accept="image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "logo_url")} />
          </label>
        )}
        {isAdmin && v.logo_url && <button className="text-xs text-moon/50 underline" onClick={() => setV({ ...v, logo_url: null })}>ロゴを外す</button>}
      </div>
      {isAdmin && (
        <div className="md:col-span-3 flex justify-end">
          <Button onClick={save} loading={busy === "save"} disabled={!changed || !v.label.trim()}>保存する</Button>
        </div>
      )}
    </Panel>
  );
}

export default function AdminRanks() {
  const { data, mutate } = useSWR<{ items: RankEffect[] }>("/api/admin/ranks", fetcher);
  const { me } = useMe();
  const isAdmin = me?.role === "admin";
  return (
    <div>
      <PageTitle en="RANKS & EFFECTS" title="当選ランク・演出" sub="ランクごとの表示名、ガチャで当たったときに流す演出動画、ロゴを設定します。10 回・100 回引きでは、出たランクの中でいちばん高いランクの演出を 1 回だけ流します。" />
      <div className="mb-4">
        <Alert kind="info">
          推奨：MP4（H.264）・縦長（9:16、例 1080×1920）・10 秒以内・1 本 10MB 以下（上限 30MB）。ロゴは背景が透明の PNG。
          スマートフォンでは「タップして演出を見る」画面のあと、音付きで再生します。動画が未設定のランクは標準の演出を表示します。
        </Alert>
      </div>
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {data.items.map((r) => (
            <RankRow key={`${r.rarity}-${r.video_url}-${r.logo_url}-${r.label}`} r={r} isAdmin={isAdmin} onSaved={() => { mutate(); globalMutate("/api/ranks"); }} />
          ))}
        </div>
      )}
    </div>
  );
}
