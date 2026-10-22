import type { Metadata } from "next";
import { PageTitle, Panel } from "@/components/ui";

export const metadata: Metadata = { title: "プライバシーポリシー" };

const SECTIONS: [string, string][] = [
  ["1. 取得する情報", "メールアドレス、ニックネーム、パスワード（復元できない形式で保存）、ログイン履歴（IPアドレス・ブラウザ情報）、チケット・ポイントの獲得・使用履歴、抽選履歴、電話番号の確認情報（番号は照合用の値と末尾4桁のみ）、景品交換時のお届け先（氏名・郵便番号・住所・電話番号）、お問い合わせ内容。"],
  ["2. 利用目的", "本サービスの提供・本人確認・不正利用の防止、景品の発送、お問い合わせへの対応、サービス改善のための統計分析、重要なお知らせの送付。"],
  ["3. お届け先情報の取り扱い", "景品交換時にご入力いただくお届け先は、暗号化して保存し、発送業務に必要な担当者のみが閲覧できます。閲覧は記録され、発送完了後、所定の保持期間を経過したのち削除します。"],
  ["4. 第三者提供", "法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供しません。景品の発送を委託する場合は、委託先を適切に監督します。"],
  ["5. 広告・アンケート事業者との連携", "広告視聴・アンケート回答の成果確認のため、事業者には個人を特定しない識別子（クリックID）のみを提供します。事業者のサイトでご入力いただく情報は、各事業者のプライバシーポリシーに従って取り扱われます。"],
  ["6. 安全管理措置", "通信の暗号化、パスワードの不可逆な保存、アクセス権限の管理、管理者操作の監査記録など、個人情報の漏えい・滅失を防ぐための措置を講じます。"],
  ["7. 開示・訂正・削除", "ご本人からの個人情報の開示・訂正・利用停止・削除のご請求には、本人確認のうえ、法令に従って対応します。お問い合わせフォームからご連絡ください。"],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageTitle en="PRIVACY" title="プライバシーポリシー" />
      <Panel className="space-y-6 leading-loose text-moon/80">
        {SECTIONS.map(([h, b]) => (
          <section key={h}>
            <h2 className="font-serif text-lg font-bold text-gold-light">{h}</h2>
            <p className="mt-1 text-sm">{b}</p>
          </section>
        ))}
        <p className="text-xs text-moon/40">制定日：2026年10月16日</p>
      </Panel>
    </div>
  );
}
