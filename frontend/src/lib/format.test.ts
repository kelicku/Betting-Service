import { describe, expect, it } from "vitest";
import { fmtPercent, timeLeft } from "./format";

describe("fmtPercent", () => {
  it("提供割合を読みやすく丸める", () => {
    expect(fmtPercent(0.79)).toBe("79%");
    expect(fmtPercent(0.035)).toBe("3.5%");
    expect(fmtPercent(0.005)).toBe("0.5%");
    expect(fmtPercent(0.00001)).toBe("<0.01%");
    expect(fmtPercent(0)).toBe("0%");
  });
});

describe("timeLeft", () => {
  it("終了済み・残り時間を表示する", () => {
    expect(timeLeft(null)).toBeNull();
    expect(timeLeft(new Date(Date.now() - 1000).toISOString())).toBe("終了");
    expect(timeLeft(new Date(Date.now() + 2 * 86400000 + 3 * 3600000 + 60000).toISOString())).toBe("残り2日3時間");
  });
});
