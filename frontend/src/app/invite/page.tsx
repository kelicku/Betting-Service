"use client";

/** 友達紹介：招待コードと招待リンクを共有し、お友達が登録を完了すると双方にチケットをお贈りする。 */

import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { useToast } from "@/components/Toast";
import { Button, PageTitle, Panel, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import type { InviteInfo } from "@/lib/types";

function Content() {
  const toast = useToast();
  const { data } = useSWR<InviteInfo>("/api/invite", fetcher);
  if (!data) return <Spinner />;
  const link = typeof window !== "undefined" ? `${window.location.origin}/register?ref=${data.invite_code}` : "";
  const copy = (text: string, label: string) =>
    navigator.clipboard?.writeText(text).then(() => toast(`${label}をコピーしました`), () => toast("コピーできませんでした", "error"));
  const shareText = `わくわくガチャで遊ぼう！この招待コードで登録するとチケットがもらえるよ：${data.invite_code}`;
  return (
    <div className="space-y-5">
      <Panel strong className="text-center">
        <p className="font-round text-lg font-bold">
          お友達が登録を完了すると、<span className="text-gold-light">お友達にチケット{data.invitee_tickets}枚</span>、
          <span className="text-gold-light">あなたにチケット{data.inviter_tickets}枚</span>をお贈りします！
        </p>
        <p className="mt-5 text-sm text-moon/60">あなたの招待コード</p>
        <p className="mt-1 select-all font-mono text-4xl font-black tracking-[0.2em] text-moon">{data.invite_code}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={() => copy(data.invite_code, "招待コード")}>コードをコピー</Button>
          <Button size="sm" variant="purple" onClick={() => copy(link, "招待リンク")}>招待リンクをコピー</Button>
          <Button size="sm" variant="ghost" href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`}>X で共有</Button>
          <Button size="sm" variant="ghost" href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(link)}`}>LINE で共有</Button>
        </div>
      </Panel>
      <div className="grid grid-cols-2 gap-4">
        <Panel className="text-center">
          <p className="text-sm text-moon/60">招待した人数</p>
          <p className="mt-1 font-round text-3xl font-black">{data.invited}</p>
        </Panel>
        <Panel className="text-center">
          <p className="text-sm text-moon/60">登録が完了した人数</p>
          <p className="mt-1 font-round text-3xl font-black text-gold-light">{data.completed}</p>
        </Panel>
      </div>
      <p className="text-xs leading-relaxed text-moon/50">
        ※ 特典は、お友達がメールアドレスの確認（必要な場合は電話番号の確認も）を完了した時点でお贈りします。ご自身の別アカウントの登録は対象外です。
        紹介した方への特典は 1 日 10 人分までです。
      </p>
    </div>
  );
}

export default function InvitePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageTitle en="INVITE FRIENDS" title="友達紹介" />
      <RequireAuth>{() => <Content />}</RequireAuth>
    </div>
  );
}
