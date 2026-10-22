import type { Rarity } from "./types";

const dtf = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const df = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });

export const fmtDateTime = (s: string | null | undefined) => (s ? dtf.format(new Date(s)) : "—");
export const fmtDate = (s: string | null | undefined) => (s ? df.format(new Date(s)) : "—");
export const fmtNum = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("ja-JP"));

export function fmtPercent(p: number): string {
  const v = p * 100;
  if (v === 0) return "0%";
  if (v < 0.01) return "<0.01%";
  if (v < 1) return `${v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`;
  return `${v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export const RARITY: Record<Rarity, { label: string; color: string; glow: string; ring: string; text: string; order: number }> = {
  N: { label: "小当たり", color: "#C9CED9", glow: "rgba(220,226,240,0.55)", ring: "from-slate-200/70 via-slate-400/40 to-slate-200/70", text: "text-slate-200", order: 0 },
  R: { label: "中当たり", color: "#84D8F1", glow: "rgba(132,216,241,0.7)", ring: "from-aurora via-sky-400/60 to-aurora", text: "text-aurora", order: 1 },
  SR: { label: "大当たり", color: "#B48CFF", glow: "rgba(180,140,255,0.8)", ring: "from-amethyst-300 via-fuchsia-400/70 to-amethyst-300", text: "text-amethyst-200", order: 2 },
  SSR: { label: "特賞", color: "#F3DFB3", glow: "rgba(243,223,179,0.95)", ring: "from-gold-light via-gold to-gold-light", text: "text-gold-light", order: 3 },
};

export const RARITIES: Rarity[] = ["SSR", "SR", "R", "N"];

export function timeLeft(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "終了";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `残り${d}日${h}時間`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `残り${h}時間${m}分`;
}

export const TX_KIND: Record<string, string> = {
  signup_bonus: "新規登録特典",
  daily_login: "ログインボーナス",
  ad: "広告視聴",
  survey: "アンケート",
  campaign: "キャンペーン",
  achievement: "条件達成",
  admin_grant: "運営より付与",
  admin_adjust: "運営による調整",
  gacha_draw: "ガチャ",
  refund: "返還",
  referral: "友達紹介",
  gacha_win: "ガチャで当選",
  shop_exchange: "ポイント交換",
};
