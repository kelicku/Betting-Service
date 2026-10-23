"use client";

import { useState } from "react";
import { Button, Field } from "../ui";

export type GachaFormValue = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  banner_image_url: string | null;
  theme_color: string;
  ticket_cost: number;
  mode: "probability" | "box";
  starts_at: string | null;
  ends_at: string | null;
  max_pulls: number | null;
  allow_multi_10: boolean;
  allow_multi_100: boolean;
  last_one_prize_id: number | null;
  last_one_description: string;
  sort_order: number;
  badge: string;
};

export const EMPTY_GACHA: GachaFormValue = {
  slug: "",
  title: "",
  subtitle: "",
  description: "",
  banner_image_url: null,
  theme_color: "#7654C8",
  ticket_cost: 1,
  mode: "probability",
  starts_at: null,
  ends_at: null,
  max_pulls: null,
  allow_multi_10: true,
  allow_multi_100: true,
  last_one_prize_id: null,
  last_one_description: "",
  sort_order: 0,
  badge: "",
};

// datetime-local（日本時間）⇔ ISO
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return j.toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(`${v}:00+09:00`).toISOString() : null);

export default function GachaForm({
  initial,
  prizes,
  locked,
  onSubmit,
  submitLabel,
}: {
  initial: GachaFormValue;
  prizes: { id: number; name: string; rarity: string }[];
  locked?: boolean;
  onSubmit: (v: GachaFormValue) => Promise<void>;
  submitLabel: string;
}) {
  const [v, setV] = useState<GachaFormValue>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof GachaFormValue>(k: K, val: GachaFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(v);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="タイトル">
        <input className="field" required value={v.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="スラッグ（URL）" hint="半角英小文字・数字・ハイフン">
        <input className="field" required pattern="[a-z0-9][a-z0-9\-]*" value={v.slug} onChange={(e) => set("slug", e.target.value)} />
      </Field>
      <Field label="サブタイトル">
        <input className="field" value={v.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
      </Field>
      <Field label="バナー画像 URL">
        <input className="field" value={v.banner_image_url ?? ""} onChange={(e) => set("banner_image_url", e.target.value || null)} />
      </Field>
      <div className="md:col-span-2">
        <Field label="説明">
          <textarea className="field" rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
      </div>
      <Field label="抽選方式" hint={locked ? "抽選開始後は変更できません" : "確率抽選：重みで抽選／ボックス：在庫数に応じて抽選"}>
        <select className="field" disabled={locked} value={v.mode} onChange={(e) => set("mode", e.target.value as GachaFormValue["mode"])}>
          <option value="probability">確率抽選方式</option>
          <option value="box">在庫数に基づく抽選方式（ボックス）</option>
        </select>
      </Field>
      <Field label="1回あたりのチケット枚数">
        <input className="field" type="number" min={1} required value={v.ticket_cost} onChange={(e) => set("ticket_cost", Number(e.target.value))} />
      </Field>
      <Field label="開始日時（日本時間・任意）">
        <input className="field" type="datetime-local" value={toLocal(v.starts_at)} onChange={(e) => set("starts_at", fromLocal(e.target.value))} />
      </Field>
      <Field label="終了日時（日本時間・任意）" hint="空欄にすると「終了まで〜日」は表示されず、完売（ラストワン賞）まで続きます。設定すると、その日時でガチャが終了します">
        <input className="field" type="datetime-local" value={toLocal(v.ends_at)} onChange={(e) => set("ends_at", fromLocal(e.target.value))} />
      </Field>
      {v.mode === "probability" && (
        <Field label="総口数（任意）" hint="設定すると残り口数が管理され、ラストワン賞が設定できます">
          <input className="field" type="number" min={1} value={v.max_pulls ?? ""} onChange={(e) => set("max_pulls", e.target.value ? Number(e.target.value) : null)} />
        </Field>
      )}
      <Field label="カードのラベル" hint="トップページのカードに表示（人気＝10回ボタン、ラストワン賞＝100回ボタン）">
        <select className="field" value={v.badge} onChange={(e) => set("badge", e.target.value)}>
          {["", "NEW", "人気", "限定", "ラストワン賞", "PICK UP"].map((b) => (
            <option key={b} value={b}>{b || "なし"}</option>
          ))}
        </select>
      </Field>
      <Field label="表示順">
        <input className="field" type="number" value={v.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} />
      </Field>
      <Field label="テーマカラー">
        <input className="field h-12 p-1" type="color" value={v.theme_color} onChange={(e) => set("theme_color", e.target.value.toUpperCase())} />
      </Field>
      <div className="flex flex-wrap items-center gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#D8B976]" checked={v.allow_multi_10} onChange={(e) => set("allow_multi_10", e.target.checked)} />10回まとめ引きを許可</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[#D8B976]" checked={v.allow_multi_100} onChange={(e) => set("allow_multi_100", e.target.checked)} />100回まとめ引きを許可</label>
      </div>
      <div className="rounded-xl border border-gold/20 p-4 md:col-span-2">
        <p className="mb-3 font-serif font-bold text-gold-light">ラストワン賞</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="景品" hint="ボックス方式、または総口数を設定した確率方式で有効">
            <select className="field" value={v.last_one_prize_id ?? ""} onChange={(e) => set("last_one_prize_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">設定しない</option>
              {prizes.map((p) => (
                <option key={p.id} value={p.id}>[{p.rarity}] {p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="説明">
            <input className="field" value={v.last_one_description} onChange={(e) => set("last_one_description", e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="md:col-span-2">
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
