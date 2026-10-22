"use client";

/** 新規登録特典の帯（登録画面・ガチャ詳細で、ログインしていない方に表示）。特典が 0 のときは表示しない。 */

import { OutlineText } from "@/components/SiteChrome";
import { cx } from "@/components/ui";
import { type SignupBonus, useSignupBonus } from "@/lib/hooks";

export function SignupBonusBanner({ className, lead = "＼ 新規会員登録（無料）で ／" }: { className?: string; lead?: string }) {
  const bonus: SignupBonus | null = useSignupBonus();
  if (!bonus || (bonus.points <= 0 && bonus.tickets <= 0)) return null;
  const n = (v: number) => v.toLocaleString("ja-JP");
  return (
    <div className={cx("bonus-banner relative overflow-hidden rounded-2xl px-4 py-3 text-center font-round font-black text-white", className)}>
      <span className="waku-sparkle left-4 top-3 h-5 w-5" aria-hidden />
      <span className="waku-sparkle bottom-3 right-5 h-6 w-6 [animation-delay:1.2s]" aria-hidden />
      <p className="text-[0.9rem] tracking-wider">{lead}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline justify-center gap-x-2 leading-none">
        {bonus.points > 0 && (
          <OutlineText stroke={6}>
            <span className="text-[2.6rem] text-[#fff6a8]">{n(bonus.points)}</span>
            <span className="ml-0.5 text-[1.5rem]">pt</span>
          </OutlineText>
        )}
        {bonus.points > 0 && bonus.tickets > 0 && <span className="text-[1.3rem]">＋</span>}
        {bonus.tickets > 0 && (
          <OutlineText stroke={6}>
            <span className="text-[1.2rem]">チケット</span>
            <span className={cx(bonus.points > 0 ? "text-[1.9rem]" : "text-[2.6rem]", "text-[#fff6a8]")}>{n(bonus.tickets)}</span>
            <span className="ml-0.5 text-[1.2rem]">枚</span>
          </OutlineText>
        )}
      </p>
      <p className="mt-1 text-[1rem]">プレゼント！</p>
    </div>
  );
}
