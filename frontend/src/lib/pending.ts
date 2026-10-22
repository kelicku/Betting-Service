/**
 * 抽選リクエストの冪等キーを、送信前に sessionStorage へ保存しておく。
 * 通信断・再読み込みが起きても同じキーで再送するため、チケットが二重に消費されず、
 * 確定済みの結果をそのまま取り出せる。
 */
import { newIdempotencyKey } from "./api";

export interface PendingDraw {
  slug: string;
  gachaId: number;
  count: 1 | 10 | 100;
  key: string;
  createdAt: number;
  drawId?: string;
}

const KEY = "hf_pending_draw";

export function createPending(slug: string, gachaId: number, count: 1 | 10 | 100): PendingDraw {
  const p: PendingDraw = { slug, gachaId, count, key: newIdempotencyKey(), createdAt: Date.now() };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ストレージ不可でもキーは URL に載せて引き継ぐ */
  }
  return p;
}

export function readPending(): PendingDraw | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingDraw) : null;
  } catch {
    return null;
  }
}

export function markPendingDone(drawId: string) {
  const p = readPending();
  if (!p) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...p, drawId }));
  } catch {
    /* ignore */
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
