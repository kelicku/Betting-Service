"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { RemainingBar } from "@/components/GachaCard";
import { PrizeCard } from "@/components/PrizeCard";
import { Countdown } from "@/components/Engage";
import { PrizePedestal } from "@/components/ThreeParts";
import { useToast } from "@/components/Toast";
import { Alert, Button, Modal, Ornament, Panel, RarityBadge, TicketIcon, Tickets, cx } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { RARITIES, RARITY, fmtDateTime, fmtNum, fmtPercent, timeLeft } from "@/lib/format";
import { SignupBonusBanner } from "@/components/SignupBonus";
import { useMe } from "@/lib/hooks";
import { createPending } from "@/lib/pending";
import type { GachaDetail } from "@/lib/types";

type Count = 1 | 10 | 100;
const LABEL: Record<Count, string> = { 1: "ガチャを引く", 10: "10回まとめて引く", 100: "100回まとめて引く" };

export default function GachaDetailView({ initial }: { initial: GachaDetail }) {
  const { data } = useSWR<GachaDetail>(`/api/gachas/${initial.slug}`, fetcher, { fallbackData: initial, refreshInterval: 15000 });
  const g = data ?? initial;
  const { me, loading: meLoading } = useMe();
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Count | null>(null);

  const counts: Count[] = [1, ...(g.allow_multi_10 ? [10 as const] : []), ...(g.allow_multi_100 ? [100 as const] : [])];
  const reason = (n: Count): string | null => {
    if (!g.is_open) return "開催期間外";
    if (g.remaining != null && g.remaining <= 0) return "完売";
    if (g.remaining != null && n > g.remaining) return `残り${g.remaining}口`;
    if (me && me.balance < g.ticket_cost * n) return "チケット不足";
    return null;
  };

  const start = (n: Count) => {
    if (!me) {
      // 未登録の方は、そのまま新規登録へ（登録済みの方は登録画面からログインへ進める）
      router.push(`/register?next=${encodeURIComponent(`/gacha/${g.slug}`)}`);
      return;
    }
    if (!me.email_verified) {
      toast("ガチャを引くにはメールアドレスの確認が必要です。マイページから確認メールを再送できます。", "error");
      return;
    }
    setConfirm(n);
  };

  const go = (n: Count) => {
    const p = createPending(g.slug, g.id, n);
    router.push(`/gacha/${g.slug}/play?k=${p.key}&n=${n}`);
  };

  // トップページのカードから「?draw=10」などで来た場合は、その回数の確認画面を開く
  const sp = useSearchParams();
  const autoOpened = useRef(false);
  useEffect(() => {
    const n = Number(sp.get("draw")) as Count;
    if (autoOpened.current || ![1, 10, 100].includes(n) || meLoading) return;
    if (!counts.includes(n) || reason(n)) return;
    autoOpened.current = true;
    start(n);
  });

  const left = timeLeft(g.ends_at);

  const DrawButtons = ({ compact }: { compact?: boolean }) => (
    <div className={cx("grid gap-2.5", compact ? "grid-cols-3" : "grid-cols-1")}>
      {counts.map((n) => {
        const r = reason(n);
        const disabledByTickets = r === "チケット不足";
        return (
          <Button
            key={n}
            size={compact ? "md" : n === 1 ? "xl" : "lg"}
            variant={n === 1 ? "gold" : n === 10 ? "purple" : "ghost"}
            disabled={!!r && !disabledByTickets}
            onClick={() => (disabledByTickets ? router.push("/earn") : start(n))}
            className={cx("w-full", compact && "flex-col !gap-0 px-1 text-xs leading-tight")}
            aria-label={`${LABEL[n]}（チケット${g.ticket_cost * n}枚）`}
          >
            {compact ? (
              <>
                <span className="font-bold">{n === 1 ? "1回" : `${n}回`}</span>
                <span className="flex items-center gap-0.5 text-[10px] opacity-80">
                  <TicketIcon className="h-3 w-3" />
                  {g.ticket_cost * n}
                </span>
              </>
            ) : (
              <>
                <span>{LABEL[n]}</span>
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-sm">
                  <TicketIcon className="h-4 w-4" />
                  {fmtNum(g.ticket_cost * n)}
                </span>
                {r && <span className="hidden text-xs opacity-80 sm:inline">（{disabledByTickets ? "チケットを獲得する" : r}）</span>}
              </>
            )}
          </Button>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 md:pb-8">
      <nav className="mb-4 text-xs text-moon/50" aria-label="パンくず">
        <Link href="/gacha" className="hover:text-gold-light">ガチャ一覧</Link> <span className="mx-1">/</span> {g.title}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative overflow-hidden rounded-3xl border border-gold/30 shadow-glow">
            {g.banner_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.banner_image_url} alt="" className="aspect-[2/1] w-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-night via-night/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
              <div className="mb-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-gold/40 bg-night/60 px-2.5 py-1 text-[11px] text-gold-light backdrop-blur">
                  {g.mode === "box" ? "ボックス（在庫数に基づく抽選）" : "確率抽選"}
                </span>
                {left && <span className="rounded-full bg-night/60 px-2.5 py-1 text-[11px] text-aurora backdrop-blur">{left}</span>}
              </div>
              <h1 className="font-serif text-2xl font-extrabold tracking-wide sm:text-4xl">
                <span className="gold-text">{g.title}</span>
              </h1>
              <p className="mt-1 text-sm text-moon/75">{g.subtitle}</p>
            </div>
          </motion.div>

          {g.description && <p className="whitespace-pre-line leading-loose text-moon/75">{g.description}</p>}

          {g.last_one_prize && (
            <Panel strong className="flex items-center gap-5 overflow-hidden">
              <PrizePedestal prize={g.last_one_prize} lastOne className="h-40 w-32 shrink-0 sm:h-48 sm:w-40" />
              <div>
                <p className="font-display text-[11px] tracking-[0.35em] text-gold/70">LAST ONE PRIZE</p>
                <h2 className="mt-1 font-serif text-xl font-bold text-gold-light">ラストワン賞「{g.last_one_prize.name}」</h2>
                <p className="mt-2 text-sm leading-relaxed text-moon/70">{g.last_one_description || "最後の1口を引いた方に贈呈されます。"}</p>
                {g.last_one_awarded ? (
                  <p className="mt-2 text-sm font-bold text-blush">ラストワン賞は獲得されました</p>
                ) : (
                  <p className="mt-2 text-xs text-moon/50">10回・100回まとめ引きの中で最後の1口を引いた場合も対象です。</p>
                )}
              </div>
            </Panel>
          )}

          <Panel>
            <h2 className="font-serif text-lg font-bold text-gold-light">ラインナップと提供割合</h2>
            <p className="mt-1 text-xs text-moon/50">
              {g.mode === "box"
                ? "ボックス方式：各景品の残り在庫数に応じて抽選されます。提供割合は現在の在庫に基づく次の1回の確率です。"
                : "確率抽選方式：設定された確率に基づき、サーバー側で抽選します。"}
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {RARITIES.map((r) => (
                <div key={r} className="rounded-xl border border-veil/5 bg-veil/[0.03] p-2.5 text-center">
                  <RarityBadge rarity={r} />
                  <p className={cx("mt-1 font-display text-lg font-bold tabular-nums", RARITY[r].text)}>{fmtPercent(g.rarity_rates[r] ?? 0)}</p>
                </div>
              ))}
            </div>
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {g.items.map((it) => (
                <li key={it.prize.id}>
                  <PrizeCard
                    prize={it.prize}
                    size="sm"
                    highlight={false}
                    footer={
                      <div className="flex items-center justify-between gap-1">
                        <span className="tabular-nums text-gold-light">{fmtPercent(it.probability)}</span>
                        {it.stock_remaining != null && (
                          <span className={cx("tabular-nums", it.stock_remaining === 0 && "text-rose-300")}>
                            残{it.stock_remaining}/{it.stock_total}
                          </span>
                        )}
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Panel strong className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-moon/60">1回あたり</span>
              <Tickets n={g.ticket_cost} className="text-xl text-gold-light" />
            </div>
            {g.remaining != null && g.total_pulls != null && <RemainingBar remaining={g.remaining} total={g.total_pulls} />}
            {g.ends_at && g.is_open && <Countdown endsAt={g.ends_at} />}
            <Ornament />
            {me ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-moon/60">所持チケット</span>
                <Tickets n={me.balance} className="text-lg text-gold-light" />
              </div>
            ) : (
              <div className="space-y-3">
                <SignupBonusBanner />
                <p className="text-center text-sm text-moon/70">ガチャを引くには、無料の会員登録が必要です。</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button href={`/register?next=${encodeURIComponent(`/gacha/${g.slug}`)}`}>無料で新規登録</Button>
                  <Button variant="ghost" href={`/login?next=${encodeURIComponent(`/gacha/${g.slug}`)}`}>ログイン</Button>
                </div>
              </div>
            )}
            {!g.is_open && <Alert kind="warn">このガチャは現在開催されていません。</Alert>}
            <DrawButtons />
            <dl className="space-y-1 text-xs text-moon/50">
              {g.starts_at && (
                <div className="flex justify-between">
                  <dt>開始</dt>
                  <dd>{fmtDateTime(g.starts_at)}</dd>
                </div>
              )}
              {g.ends_at && (
                <div className="flex justify-between">
                  <dt>終了</dt>
                  <dd>{fmtDateTime(g.ends_at)}</dd>
                </div>
              )}
            </dl>
            <p className="text-[11px] leading-relaxed text-moon/40">
              抽選結果はガチャを引いた時点でサーバーに保存されます。演出をスキップしたり通信が途切れたりしても、結果は変わりません。
              まとめ引きは、チケットや残り口数が足りない場合は実行されません。
            </p>
          </Panel>
        </aside>
      </div>

      {/* スマートフォン：片手で押せる位置に固定 */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-gold/20 bg-night/90 px-3 py-2.5 backdrop-blur-xl md:hidden">
        <div className="flex items-center gap-2">
          {me && (
            <div className="shrink-0 pr-1 text-center">
              <p className="text-[9px] text-moon/50">所持</p>
              <Tickets n={me.balance} className="text-sm text-gold-light" />
            </div>
          )}
          <div className="flex-1">
            <DrawButtons compact />
          </div>
        </div>
      </div>

      <Modal open={confirm != null} onClose={() => setConfirm(null)} title="ガチャを引きますか？">
        {confirm != null && me && (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-moon/75">
              「{g.title}」を<strong className="text-gold-light">{confirm}回</strong>引きます。
            </p>
            <div className="space-y-2 rounded-xl border border-veil/10 bg-night-800/60 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-moon/60">使用するチケット</span>
                <Tickets n={g.ticket_cost * confirm} className="text-gold-light" />
              </div>
              <div className="flex justify-between">
                <span className="text-moon/60">抽選後の残り</span>
                <Tickets n={me.balance - g.ticket_cost * confirm} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="subtle" onClick={() => setConfirm(null)}>
                やめる
              </Button>
              <Button onClick={() => go(confirm)} autoFocus>
                引く
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
