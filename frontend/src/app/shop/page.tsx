"use client";

/**
 * ポイント交換：ガチャで貯めたポイントで、デジタルギフト（デジコなど）や景品と交換する。
 * デジタルギフトはコードの在庫があればすぐに画面でお渡しし、なければ用意ができ次第お知らせする。
 */

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { GiftCodeBox } from "@/components/GiftCodeBox";
import { useToast } from "@/components/Toast";
import { Alert, Button, Empty, Field, Modal, PageTitle, Panel, Points, Spinner, cx } from "@/components/ui";
import { ApiError, api, fetcher, newIdempotencyKey } from "@/lib/api";
import { refreshMe, useMe } from "@/lib/hooks";
import type { ShopItem, ShopOrder } from "@/lib/types";

const PREFS = "北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県".split(" ");
type Shipping = { name: string; postal_code: string; prefecture: string; address1: string; address2: string; phone: string; note: string };
const EMPTY: Shipping = { name: "", postal_code: "", prefecture: "", address1: "", address2: "", phone: "", note: "" };

function ItemCard({ it, onPick, balance }: { it: ShopItem; onPick: () => void; balance: number | null }) {
  const short = balance != null && balance < it.point_cost;
  const disabled = it.sold_out || it.limit_reached;
  return (
    <div className="glass flex flex-col overflow-hidden p-0 transition hover:-translate-y-1">
      <div className="relative flex h-36 items-center justify-center bg-[linear-gradient(135deg,#fff5fa,#f2f6ff)]">
        {it.image_url && <Image src={it.image_url} alt="" width={240} height={150} className="h-28 w-auto object-contain" />}
        {it.instant && <span className="absolute left-2 top-2 rounded-full bg-[#1fb36b] px-2.5 py-0.5 text-[11px] font-bold text-white">すぐ受け取れる</span>}
        {it.kind === "shipping" && <span className="absolute left-2 top-2 rounded-full bg-aurora px-2.5 py-0.5 text-[11px] font-bold text-white">発送</span>}
        {it.sold_out && <span className="absolute inset-0 flex items-center justify-center bg-white/70 font-round text-lg font-black text-moon/70">在庫切れ</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {it.brand && <p className="text-xs font-bold text-moon/50">{it.brand}</p>}
        <h3 className="font-round text-base font-bold leading-snug">{it.name}</h3>
        <p className="mt-2 font-round text-xl font-black text-gold-light">
          {it.point_cost.toLocaleString("ja-JP")}
          <span className="ml-0.5 text-sm">pt</span>
        </p>
        {it.stock_remaining != null && !it.sold_out && <p className="text-xs text-moon/50">残り {it.stock_remaining.toLocaleString("ja-JP")} 個</p>}
        <div className="mt-auto pt-3">
          <Button size="sm" className="w-full !px-1 text-xs tracking-normal sm:!px-3.5 sm:text-sm sm:tracking-wide" disabled={disabled} onClick={onPick} variant={short ? "ghost" : "gold"}>
            {it.limit_reached ? "上限に達しました" : it.sold_out ? "在庫切れ" : short ? "ポイント不足" : "ポイント交換する"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  const { me } = useMe();
  const toast = useToast();
  const { data: items } = useSWR<ShopItem[]>("/api/shop/items", fetcher);
  const [pick, setPick] = useState<ShopItem | null>(null);
  const [ship, setShip] = useState<Shipping>(EMPTY);
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<ShopOrder | null>(null);
  const key = useRef(newIdempotencyKey());
  const { data: saved } = useSWR<{ address: Shipping | null }>(me ? "/api/shipping-address" : null, fetcher);

  const open = (it: ShopItem) => {
    if (!me) {
      window.location.href = "/login?next=/shop";
      return;
    }
    key.current = newIdempotencyKey();
    setErr(null);
    if (it.kind === "shipping" && saved?.address) setShip({ ...EMPTY, ...saved.address });
    setPick(it);
  };

  const submit = async () => {
    if (!pick) return;
    if (pick.kind === "shipping" && (!ship.name || !ship.postal_code || !ship.prefecture || !ship.address1 || !ship.phone)) {
      setErr("お届け先の必須項目を入力してください。");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const o = await api<ShopOrder>("/shop/orders", {
        body: { item_id: pick.id, idempotency_key: key.current, shipping: pick.kind === "shipping" ? ship : null, save_address: save },
      });
      setPick(null);
      setDone(o);
      await Promise.all([mutate("/api/shop/items"), refreshMe()]);
    } catch (e) {
      const ae = e as ApiError;
      if (ae.code === "phone_not_verified") {
        window.location.href = "/verify-phone?next=/shop";
        return;
      }
      setErr(ae.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof Shipping) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setShip((s) => ({ ...s, [k]: e.target.value }));
  const balance = me ? me.point_balance : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <PageTitle en="POINT EXCHANGE" title="ポイント交換" sub="ガチャで貯めたポイントを、デジタルギフトや景品と交換できます。" right={me && <Button variant="ghost" href="/shop/orders">ポイント交換の履歴</Button>} />
      <Panel strong className="mb-6 flex flex-wrap items-center justify-between gap-4">
        {me ? (
          <div>
            <p className="text-sm text-moon/60">使えるポイント</p>
            <Points n={me.point_balance} className="mt-1 text-3xl text-gold-light" />
          </div>
        ) : (
          <p className="text-sm text-moon/70">
            ポイントはガチャで当たります。<Link href="/login?next=/shop" className="font-bold text-gold-light underline">ログイン</Link>するとポイント交換できます。
          </p>
        )}
        <div className="text-sm text-moon/60">
          ポイントが足りないときは <Link href="/gacha" className="font-bold text-gold-light underline">ガチャを引く</Link>
        </div>
      </Panel>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty title="現在ポイント交換できる景品はありません" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {items.map((it) => (
            <ItemCard key={it.id} it={it} balance={balance} onPick={() => open(it)} />
          ))}
        </div>
      )}
      <p className="mt-6 text-xs leading-relaxed text-moon/50">
        ※ デジタルギフトのコードは、お渡し後の取消・再発行はできません。受付中（コードの準備中・発送前）の申請は、ポイント交換の履歴から取り消せます（ポイントは返還されます）。
      </p>

      <Modal open={!!pick} onClose={() => !busy && setPick(null)} title="ポイント交換の確認">
        {pick && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {pick.image_url && <Image src={pick.image_url} alt="" width={96} height={60} className="h-14 w-auto object-contain" />}
              <div>
                <p className="font-round font-bold">{pick.name}</p>
                <p className="text-sm text-moon/60">
                  {pick.point_cost.toLocaleString("ja-JP")}pt を使います（ポイント交換後の残高：{((balance ?? 0) - pick.point_cost).toLocaleString("ja-JP")}pt）
                </p>
              </div>
            </div>
            {pick.kind === "digital_code" ? (
              <Alert kind="info">{pick.instant ? "ポイント交換のあとすぐに、この画面とメールでギフトコードをお渡しします。" : "ギフトコードのご用意ができ次第、お知らせとメールでお渡しします。"}</Alert>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="お名前"><input className="field" value={ship.name} onChange={set("name")} autoComplete="name" /></Field>
                <Field label="電話番号"><input className="field" value={ship.phone} onChange={set("phone")} autoComplete="tel" inputMode="tel" /></Field>
                <Field label="郵便番号"><input className="field" value={ship.postal_code} onChange={set("postal_code")} autoComplete="postal-code" inputMode="numeric" placeholder="123-4567" /></Field>
                <Field label="都道府県">
                  <select className="field" value={ship.prefecture} onChange={set("prefecture")} autoComplete="address-level1">
                    <option value="">選択してください</option>
                    {PREFS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="市区町村・番地"><input className="field" value={ship.address1} onChange={set("address1")} autoComplete="address-line1" /></Field>
                <Field label="建物名・部屋番号（任意）"><input className="field" value={ship.address2} onChange={set("address2")} autoComplete="address-line2" /></Field>
                <label className="flex items-center gap-2 text-sm text-moon/70 sm:col-span-2">
                  <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-[#ff3b7f]" />
                  このお届け先を保存する
                </label>
              </div>
            )}
            {me?.sms_required && <Alert kind="info">初めてのポイント交換のため、次の画面で電話番号の確認（SMS 認証）をお願いします。</Alert>}
            {err && <Alert kind="error">{err}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPick(null)} disabled={busy}>やめる</Button>
              <Button onClick={submit} loading={busy}>ポイント交換する</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!done} onClose={() => setDone(null)} title={done?.status === "fulfilled" ? "ポイント交換が完了しました" : "ポイント交換を受け付けました"}>
        {done && (
          <div className={cx("space-y-4")}>
            <p className="font-round font-bold">{done.item_name}</p>
            {done.gift_code ? (
              <GiftCodeBox code={done.gift_code} expires={done.gift_code_expires_on} />
            ) : (
              <Alert kind="success">
                {done.kind === "shipping" ? "発送の準備ができ次第お届けします。" : "ギフトコードのご用意ができ次第、お知らせとメールでお渡しします。"}
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" href="/shop/orders">ポイント交換の履歴を見る</Button>
              <Button onClick={() => { setDone(null); toast("引き続きお楽しみください"); }}>閉じる</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
