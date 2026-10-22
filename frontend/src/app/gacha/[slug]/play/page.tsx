"use client";

/**
 * ガチャ実行画面。
 * 1. 詳細画面で発行した冪等キーで抽選 API を呼ぶ（結果はこの時点でサーバーに確定・保存される）
 * 2. 結果を受け取ってから演出を開始する
 * 通信エラー時は同じキーで再送し、それでも失敗した場合は冪等キーから結果を照会する。
 */

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { MagicCircleSVG } from "@/ceremony/Ceremony2D";
import GachaCeremony from "@/ceremony/GachaCeremony";
import RankVideo from "@/ceremony/RankVideo";
import { Alert, Button, Panel } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { refreshMe, useMe, useRanks } from "@/lib/hooks";
import { useMotionPref } from "@/lib/motion-pref";
import { clearPending, markPendingDone, readPending } from "@/lib/pending";
import type { Draw, GachaDetail } from "@/lib/types";

type State =
  | { kind: "loading"; note?: string }
  | { kind: "ready"; draw: Draw }
  | { kind: "error"; message: string; code?: string; retryable: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function PlayInner() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { me } = useMe();
  const { byRarity, loaded: ranksLoaded } = useRanks();
  const { level } = useMotionPref();
  const [videoDone, setVideoDone] = useState(false);
  // 演出の設定の読み込みが遅いときは、3 秒で標準の演出に切り替える
  const [ranksTimedOut, setRanksTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRanksTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);
  const key = search.get("k") ?? "";
  const count = Number(search.get("n") ?? "1") as 1 | 10 | 100;
  const [state, setState] = useState<State>({ kind: "loading" });
  const started = useRef(false);

  const run = useCallback(async () => {
    setState({ kind: "loading" });
    const pending = readPending();
    if (pending?.key === key && pending.drawId) {
      // 既に結果を表示済み（再読み込み）→ 結果画面へ
      router.replace(`/draws/${pending.drawId}`);
      return;
    }
    let gachaId = pending?.key === key ? pending.gachaId : undefined;
    try {
      if (!gachaId) gachaId = (await api<GachaDetail>(`/gachas/${slug}`)).id;
    } catch (e) {
      setState({ kind: "error", message: (e as ApiError).message, retryable: true });
      return;
    }
    let lastErr: ApiError | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const draw = await api<Draw>(`/gachas/${gachaId}/draw`, { body: { count, idempotency_key: key } });
        markPendingDone(draw.id);
        if (draw.balance_after != null)
          refreshMe({ balance: draw.balance_after, ...(draw.point_balance_after != null ? { point_balance: draw.point_balance_after } : {}) });
        setState({ kind: "ready", draw });
        return;
      } catch (e) {
        lastErr = e as ApiError;
        // 業務エラー（チケット不足・完売など）は再送しない
        if (lastErr.status !== 0 && lastErr.status < 500 && lastErr.status !== 429) break;
        setState({ kind: "loading", note: "通信を再試行しています…" });
        await sleep(800 * (attempt + 1));
      }
    }
    if (lastErr && (lastErr.status === 0 || lastErr.status >= 500)) {
      // 送信は届いて抽選が確定している可能性がある → 冪等キーで照会
      try {
        const draw = await api<Draw>(`/draws/by-key/${key}`);
        markPendingDone(draw.id);
        refreshMe();
        setState({ kind: "ready", draw });
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setState({ kind: "error", message: "通信エラーのため抽選できませんでした。チケットは消費されていません。", retryable: true });
          return;
        }
      }
      setState({
        kind: "error",
        message: "通信が不安定なため、抽選結果を確認できませんでした。電波の良い場所で「再試行」を押してください（同じ抽選として扱われるため、ポイントが二重に消費されることはありません）。",
        retryable: true,
      });
      return;
    }
    clearPending();
    setState({ kind: "error", message: lastErr?.message ?? "抽選できませんでした。", code: lastErr?.code, retryable: false });
  }, [count, key, router, slug]);

  useEffect(() => {
    if (!key || ![1, 10, 100].includes(count)) {
      router.replace(`/gacha/${slug}`);
      return;
    }
    if (started.current) return;
    started.current = true;
    run();
  }, [key, count, run, router, slug]);

  if (state.kind === "ready") {
    const cost = state.draw.tickets_spent;
    // 当選ランクの演出動画：ラストワン賞は特賞（SSR）、それ以外は出たランクの中でいちばん高いランク
    const effectRarity = state.draw.has_last_one ? "SSR" : state.draw.best_rarity;
    const effect = byRarity[effectRarity];
    if (!ranksLoaded && !ranksTimedOut) return <div className="theme-night fixed inset-0 z-[70] bg-night-900" />;
    if (effect?.video_url && !videoDone && level !== "off") {
      return <RankVideo url={effect.video_url} logo={effect.logo_url} label={effect.label} onDone={() => setVideoDone(true)} />;
    }
    return (
      <GachaCeremony
        instant={videoDone}
        draw={state.draw}
        canAgain={me ? me.balance >= cost : false}
        onAgain={() => {
          clearPending();
          router.push(`/gacha/${slug}`);
        }}
        onResults={() => {
          clearPending();
          router.push(`/draws/${state.draw.id}`);
        }}
        onExit={() => {
          clearPending();
          router.push(`/gacha/${slug}`);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-night-900 px-4">
      {state.kind === "loading" ? (
        <div className="flex flex-col items-center gap-6" role="status">
          <motion.div className="h-48 w-48" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 0.9, scale: 1 }} transition={{ duration: 0.6 }}>
            <MagicCircleSVG color="#d8b976" className="h-full w-full" spin={6} />
          </motion.div>
          <p className="font-serif text-gold-light/80">{state.note ?? "星々に願いを届けています…"}</p>
        </div>
      ) : (
        <Panel strong className="w-full max-w-md space-y-5 text-center">
          <h1 className="font-serif text-xl font-bold text-gold-light">抽選できませんでした</h1>
          <Alert kind="error">{state.message}</Alert>
          <div className="flex flex-wrap justify-center gap-3">
            {state.retryable && <Button onClick={run}>再試行</Button>}
            {state.code === "insufficient_tickets" && <Button href="/earn">チケットを獲得する</Button>}
            {state.code === "phone_not_verified" && <Button href="/verify-phone">電話番号を確認する</Button>}
            <Button variant="ghost" href={`/gacha/${slug}`} onClick={() => !state.retryable && clearPending()}>
              ガチャに戻る
            </Button>
          </div>
          <Link href="/draws" className="block text-xs text-moon/50 underline-offset-4 hover:underline">
            抽選履歴を見る
          </Link>
        </Panel>
      )}
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense>
      <PlayInner />
    </Suspense>
  );
}
