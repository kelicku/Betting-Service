import type { Metadata } from "next";
import { PageTitle, Panel } from "@/components/ui";

export const metadata: Metadata = { title: "特定商取引法に基づく表記" };

// ※【】内は公開前に運営者の情報へ置き換えること。有償サービスがない場合でも、表示内容は専門家に確認する
const ROWS: [string, string][] = [
  ["事業者の名称", "【事業者名】"],
  ["運営責任者", "【責任者氏名】"],
  ["所在地", "【所在地】（請求があった場合は遅滞なく開示します）"],
  ["連絡先", "お問い合わせフォームよりご連絡ください（電話番号は請求があった場合に遅滞なく開示します）"],
  ["販売価格", "本サービスに有償の商品・サービスはありません（チケット・ポイントは無償で付与されます）"],
  ["商品代金以外の必要料金", "インターネット接続に必要な通信料はお客様のご負担となります"],
  ["景品の引渡時期", "交換申請の承認後、準備が整い次第発送します"],
  ["返品・交換", "景品の性質上、お客様都合による返品・交換はお受けできません。初期不良の場合はお問い合わせください"],
];

export default function TokushohoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageTitle en="LEGAL" title="特定商取引法に基づく表記" />
      <Panel>
        <dl className="divide-y divide-veil/5">
          {ROWS.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr]">
              <dt className="font-serif text-sm font-bold text-gold-light">{k}</dt>
              <dd className="text-sm leading-relaxed text-moon/80">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
