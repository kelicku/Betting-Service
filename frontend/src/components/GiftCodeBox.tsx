"use client";

import { useToast } from "./Toast";

/** お渡ししたギフトコードの表示（コピーボタン付き）。 */
export function GiftCodeBox({ code, expires }: { code: string; expires?: string | null }) {
  const toast = useToast();
  return (
    <div className="rounded-2xl border-2 border-dashed border-gold/40 bg-gold/[0.06] p-4 text-center">
      <p className="text-xs font-bold text-moon/60">ギフトコード</p>
      <p className="mt-1 select-all break-all font-mono text-xl font-bold tracking-wider text-moon">{code}</p>
      {expires && <p className="mt-1 text-xs text-moon/55">有効期限：{expires}</p>}
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(code).then(() => toast("ギフトコードをコピーしました"), () => toast("コピーできませんでした", "error"))}
        className="mt-3 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-gold-light shadow-[0_2px_8px_-4px_rgba(232,30,100,0.5)] hover:bg-gold/10"
      >
        コピーする
      </button>
    </div>
  );
}
