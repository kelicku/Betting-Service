import { beforeEach, describe, expect, it } from "vitest";
import { clearPending, createPending, markPendingDone, readPending } from "./pending";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

describe("pending draw", () => {
  beforeEach(() => {
    (globalThis as unknown as { sessionStorage: MemStorage }).sessionStorage = new MemStorage();
  });
  it("冪等キーを保存し、結果IDを記録・消去できる", () => {
    const p = createPending("starlight", 1, 10);
    expect(p.key).toMatch(/^[0-9a-f]{32}$/);
    expect(readPending()?.key).toBe(p.key);
    markPendingDone("draw-1");
    expect(readPending()?.drawId).toBe("draw-1");
    clearPending();
    expect(readPending()).toBeNull();
  });
  it("毎回異なるキーを発行する", () => {
    expect(createPending("a", 1, 1).key).not.toBe(createPending("a", 1, 1).key);
  });
});
