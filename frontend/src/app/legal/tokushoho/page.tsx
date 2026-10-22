import type { Metadata } from "next";
import { PageTitle, Panel } from "@/components/ui";

export const metadata: Metadata = { title: "特定商取引法に基づく表記" };

// ※【】内は公開前に運営者の情報へ置き換えること（docs/legal-review.md）。有償サービスがない場合でも、表示内容は専門家に確認する
const ROWS: [string, string][] = [
  ["事業者の名称", "【事業者名（法人名または個人事業主の氏名）】"],
  ["運営責任者", "【運営責任者の氏名】"],
  ["所在地", "【所在地】（個人事業主の場合、請求があったときに遅滞なく開示します）"],
  ["電話番号", "【電話番号】（お問い合わせはお問い合わせフォームをご利用ください。請求があったときに遅滞なく開示します）"],
  ["メールアドレス", "【メールアドレス】"],
  ["販売価格", "本サービスに有償の商品・サービスはありません。ガチャに使うチケット、景品との交換に使うポイントは、いずれも無償で付与されます。"],
  ["商品代金以外の必要料金", "インターネットの接続・通信料、SMS の受信料（ご契約の通信事業者による）はお客さまのご負担となります。"],
  ["景品・ギフトの引渡時期", "デジタルギフト：ギフトコードの在庫がある場合は交換と同時に、それ以外は準備が整い次第、画面とメールでお渡しします。発送する景品：交換の受付後、準備が整い次第発送します（目安：【〇〜〇営業日】）。"],
  ["引渡方法", "デジタルギフト：本サービスの画面とメールでギフトコードをお知らせします。発送する景品：ご指定の住所へ配送します。"],
  ["返品・交換・キャンセル", "景品の性質上、お客さまのご都合による返品・交換はお受けできません。受付中（ギフトコードの準備中・発送前）のポイント交換は取り消すことができ、ポイントを返還します。お渡し済みのギフトコードの取消・再発行はできません。初期不良・配送中の破損はお問い合わせください。"],
  ["動作環境", "最新版の Google Chrome・Safari・Microsoft Edge・Firefox（スマートフォン・パソコン）"],
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
