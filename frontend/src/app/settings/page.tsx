"use client";

import { useState } from "react";
import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { useToast } from "@/components/Toast";
import { Button, Field, PageTitle, Panel, cx } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { refreshMe } from "@/lib/hooks";
import { type MotionLevel, useMotionPref } from "@/lib/motion-pref";
import type { Me } from "@/lib/types";

type Sess = { id: string; created_at: string; last_seen_at: string; ip: string | null; user_agent: string | null; current: boolean };

function device(ua: string | null) {
  if (!ua) return "不明な端末";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "その他";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "ブラウザ";
  return `${os}・${br}`;
}

function Content({ me }: { me: Me }) {
  const toast = useToast();
  const [name, setName] = useState(me.display_name);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const { data: sessions, mutate } = useSWR<Sess[]>("/api/auth/sessions", fetcher);
  const { level, auto, setLevel } = useMotionPref();

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/auth/me", { method: "PATCH", body: { display_name: name } });
      await refreshMe();
      toast("プロフィールを更新しました。");
    } catch (err) {
      toast((err as ApiError).message, "error");
    }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ message: string }>("/auth/change-password", { body: pw });
      setPw({ current_password: "", new_password: "" });
      toast(r.message);
      mutate();
    } catch (err) {
      toast((err as ApiError).message, "error");
    }
  };
  const revokeOthers = async () => {
    await api("/auth/sessions/revoke-others", { method: "POST" });
    toast("他の端末からログアウトしました。");
    mutate();
  };

  const levels: { v: MotionLevel | "auto"; t: string; d: string }[] = [
    { v: "auto", t: "自動", d: "端末の性能と OS の設定に合わせて切り替えます" },
    { v: "full", t: "すべての演出", d: "3D の魔法陣・宝箱など、すべての演出を表示します" },
    { v: "lite", t: "軽量", d: "3D を使わない軽い演出にします（電池・通信量の節約）" },
    { v: "off", t: "最小限", d: "アニメーションを減らし、結果をすぐに表示します" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <PageTitle en="SETTINGS" title="プロフィール設定" />
      <Panel>
        <h2 className="mb-4 font-serif font-bold text-gold-light">プロフィール</h2>
        <form onSubmit={saveName} className="space-y-4">
          <Field label="メールアドレス">
            <input className="field opacity-60" value={me.email} disabled />
          </Field>
          <Field label="ニックネーム">
            <input className="field" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit">保存する</Button>
        </form>
      </Panel>

      <Panel>
        <h2 className="mb-1 font-serif font-bold text-gold-light">演出の設定</h2>
        <p className="mb-4 text-xs text-moon/50">現在の演出：{levels.find((l) => l.v === level)?.t}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {levels.map((l) => {
            const on = l.v === "auto" ? auto : !auto && level === l.v;
            return (
              <button
                key={l.v}
                onClick={() => setLevel(l.v)}
                aria-pressed={on}
                className={cx("rounded-xl border p-4 text-left transition", on ? "border-gold/60 bg-gold/10 shadow-glow" : "border-veil/10 hover:border-veil/25")}
              >
                <p className={cx("font-bold", on && "text-gold-light")}>{l.t}</p>
                <p className="mt-1 text-xs text-moon/55">{l.d}</p>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-4 font-serif font-bold text-gold-light">パスワードの変更</h2>
        <form onSubmit={changePw} className="space-y-4">
          <Field label="現在のパスワード">
            <input className="field" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
          </Field>
          <Field label="新しいパスワード" hint="英字と数字を含む8文字以上。変更すると他の端末からはログアウトされます。">
            <input className="field" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          </Field>
          <Button type="submit" variant="ghost">パスワードを変更する</Button>
        </form>
      </Panel>

      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif font-bold text-gold-light">ログイン中の端末</h2>
          <Button size="sm" variant="subtle" onClick={revokeOthers}>他の端末をすべてログアウト</Button>
        </div>
        <ul className="divide-y divide-veil/5 text-sm">
          {sessions?.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p>
                  {device(s.user_agent)} {s.current && <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] text-gold-light">この端末</span>}
                </p>
                <p className="text-xs text-moon/45">最終利用：{fmtDateTime(s.last_seen_at)}・IP {s.ip ?? "—"}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

export default function SettingsPage() {
  return <RequireAuth>{(me) => <Content me={me} />}</RequireAuth>;
}
