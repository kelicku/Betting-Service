"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { RequireAuth } from "@/components/Guard";
import { PrizeCard } from "@/components/PrizeCard";
import { useToast } from "@/components/Toast";
import { Alert, Button, Field, PageTitle, Panel, Spinner } from "@/components/ui";
import { ApiError, api, fetcher, newIdempotencyKey } from "@/lib/api";
import type { Exchange, Page, Shipping, UserPrize } from "@/lib/types";

const PREFS = "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県".split(" ");
const EMPTY: Shipping = { name: "", postal_code: "", prefecture: "", address1: "", address2: "", phone: "", note: "" };

function Content() {
  const router = useRouter();
  const toast = useToast();
  const idsParam = useSearchParams().get("ids") ?? "";
  const ids = useMemo(() => idsParam.split(",").map(Number).filter(Boolean), [idsParam]);
  const { data } = useSWR<Page<UserPrize>>("/api/prizes?status=owned&per_page=200", fetcher);
  const { data: saved } = useSWR<{ address: Shipping | null }>("/api/shipping-address", fetcher);
  const [ship, setShip] = useState<Shipping>(EMPTY);
  const [save, setSave] = useState(true);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    if (saved?.address) setShip({ ...EMPTY, ...saved.address });
  }, [saved]);

  const items = (data?.items ?? []).filter((p) => ids.includes(p.id));
  const needsShipping = items.some((p) => p.requires_shipping);

  const validate = (): string | null => {
    if (!needsShipping) return null;
    if (!ship.name.trim()) return "氏名を入力してください。";
    if (!/^\d{3}-?\d{4}$/.test(ship.postal_code)) return "郵便番号は「123-4567」の形式で入力してください。";
    if (!ship.prefecture) return "都道府県を選択してください。";
    if (!ship.address1.trim()) return "住所を入力してください。";
    if (!/^0\d{1,4}-?\d{1,4}-?\d{3,4}$/.test(ship.phone)) return "電話番号を正しく入力してください。";
    return null;
  };

  const lookupZip = async () => {
    const z = ship.postal_code.replace("-", "");
    if (!/^\d{7}$/.test(z)) return;
    try {
      const r = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${z}`).then((x) => x.json());
      const a = r?.results?.[0];
      if (a) setShip((s) => ({ ...s, prefecture: a.address1, address1: `${a.address2}${a.address3}` }));
    } catch {
      /* 住所検索は補助機能。失敗しても手入力できる */
    }
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<Exchange>("/exchanges", {
        body: { user_prize_ids: items.map((i) => i.id), shipping: needsShipping ? ship : null, save_address: save, message: message || null, idempotency_key: key.current },
      });
      toast("景品交換の申請を受け付けました。");
      router.replace(`/exchanges/${res.id}`);
    } catch (e) {
      if ((e as ApiError).code === "phone_not_verified") {
        window.location.href = "/verify-phone?next=/exchanges/new";
        return;
      }
      setError((e as ApiError).message);
      setStep("form");
    } finally {
      setLoading(false);
    }
  };

  if (!data) return <Spinner />;
  if (items.length === 0)
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <Alert kind="warn">交換できる景品が選択されていません。獲得した景品一覧から選択してください。</Alert>
        <Button className="mt-4" href="/prizes">獲得した景品へ</Button>
      </div>
    );

  const set = (k: keyof Shipping) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setShip({ ...ship, [k]: e.target.value });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageTitle en="EXCHANGE" title="景品交換の申請" sub={step === "form" ? "お届け先を入力してください。" : "内容をご確認のうえ、申請してください。"} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Panel>
          <h2 className="mb-3 font-serif font-bold text-gold-light">交換する景品（{items.length}点）</h2>
          <div className="grid grid-cols-3 gap-2">
            {items.map((p) => (
              <PrizeCard key={p.id} prize={p.prize} size="xs" />
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-sm text-moon/70">
            {items.map((p) => (
              <li key={p.id}>・{p.prize.name}</li>
            ))}
          </ul>
        </Panel>
        <Panel>
          {error && <div className="mb-4"><Alert kind="error">{error}</Alert></div>}
          {step === "form" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const v = validate();
                if (v) return setError(v);
                setError(null);
                setStep("confirm");
              }}
            >
              {needsShipping ? (
                <>
                  <Field label="氏名">
                    <input className="field" autoComplete="name" value={ship.name} onChange={set("name")} maxLength={40} />
                  </Field>
                  <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                    <Field label="郵便番号" hint="例：150-0001">
                      <input className="field" inputMode="numeric" autoComplete="postal-code" value={ship.postal_code} onChange={set("postal_code")} onBlur={lookupZip} maxLength={8} />
                    </Field>
                    <Button type="button" variant="subtle" onClick={lookupZip}>住所検索</Button>
                  </div>
                  <Field label="都道府県">
                    <select className="field" value={ship.prefecture} onChange={set("prefecture")} autoComplete="address-level1">
                      <option value="">選択してください</option>
                      {PREFS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="市区町村・番地">
                    <input className="field" autoComplete="address-line1" value={ship.address1} onChange={set("address1")} maxLength={100} />
                  </Field>
                  <Field label="建物名・部屋番号（任意）">
                    <input className="field" autoComplete="address-line2" value={ship.address2} onChange={set("address2")} maxLength={100} />
                  </Field>
                  <Field label="電話番号" hint="配送業者からの連絡に使用します">
                    <input className="field" type="tel" autoComplete="tel" value={ship.phone} onChange={set("phone")} maxLength={15} />
                  </Field>
                  <Field label="配送に関する補足（任意）">
                    <textarea className="field" rows={2} value={ship.note} onChange={set("note")} maxLength={200} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm text-moon/70">
                    <input type="checkbox" className="h-4 w-4 accent-[#D8B976]" checked={save} onChange={(e) => setSave(e.target.checked)} />
                    次回のためにこのお届け先を保存する
                  </label>
                </>
              ) : (
                <Alert kind="info">選択した景品は配送不要のため、お届け先の入力は必要ありません。</Alert>
              )}
              <Field label="運営へのメッセージ（任意）">
                <textarea className="field" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
              </Field>
              <p className="text-xs leading-relaxed text-moon/45">
                ご入力いただいた個人情報は、景品の発送のみに利用し、暗号化して保管します。発送完了後、一定期間を経過すると削除されます。
              </p>
              <Button type="submit" size="lg" className="w-full">確認画面へ</Button>
            </form>
          ) : (
            <div className="space-y-5">
              {needsShipping && (
                <dl className="space-y-2 text-sm">
                  {[
                    ["氏名", ship.name],
                    ["郵便番号", ship.postal_code],
                    ["住所", `${ship.prefecture}${ship.address1} ${ship.address2}`],
                    ["電話番号", ship.phone],
                    ["補足", ship.note || "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[6rem_1fr] gap-2 border-b border-veil/5 pb-2">
                      <dt className="text-moon/55">{k}</dt>
                      <dd className="break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {message && <p className="text-sm text-moon/70">メッセージ：{message}</p>}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="subtle" onClick={() => setStep("form")}>修正する</Button>
                <Button onClick={submit} loading={loading}>景品交換を申請する</Button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function NewExchangePage() {
  return (
    <RequireAuth>
      {() => (
        <Suspense>
          <Content />
        </Suspense>
      )}
    </RequireAuth>
  );
}
