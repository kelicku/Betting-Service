import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle, Panel } from "@/components/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "よくある質問・はじめての方へ" };

const GUIDE = [
  ["会員登録", "メールアドレスとパスワードで無料登録できます。確認メールのリンクを開くと（SMS 認証が必要な場合はその完了後に）、新規登録特典をお贈りします。"],
  ["チケットを獲得", "毎日のログインボーナス、動画広告の視聴、アンケート回答、アプリの利用などの案件、ミッションの達成でガチャチケットを獲得できます。"],
  ["ガチャを引く", "チケットを使って「1回」「10回まとめて」「100回まとめて」から選んで引けます。抽選はサーバーで公正に行われます。"],
  ["ポイントを貯めて交換", "ガチャでポイントが当たると、ポイント残高に自動で加算されます。貯めたポイントは「ポイント交換」でデジタルギフトや景品と交換できます。"],
];

const FAQ: [string, string][] = [
  ["チケットとポイントの違いは？", "チケットはガチャを引くときに使います（広告視聴・アンケート・ログインボーナスなどで獲得）。ポイントはガチャで当たり、デジタルギフトや景品との交換に使います。2 つは別々の残高で、マイページで確認できます。"],
  ["チケットやポイントは購入できますか？", "購入できません。チケットはログインボーナス・広告視聴・アンケート回答・ミッション達成などで、無料で獲得できます。"],
  ["当選確率はどこで確認できますか？", "各ガチャの詳細ページに、景品ごとの提供割合と残り口数を表示しています。"],
  ["ガチャの演出中に通信が切れたらどうなりますか？", "抽選結果はガチャを引いた時点でサーバーに保存されます。演出を最後まで見られなかった場合も、「抽選履歴」から結果を確認できます。チケットが二重に消費されることはありません。"],
  ["10回・100回まとめて引くとき、チケットや残り口数が足りない場合は？", "まとめ引きは実行されず、チケットも消費されません。回数を減らしてお試しください。"],
  ["ラストワン賞とは何ですか？", "残り口数が決まっているガチャで、最後の1口を引いた方に贈られる特別な景品です。まとめ引きの中で最後の1口を引いた場合も対象です。"],
  ["デジタルギフトはいつ受け取れますか？", "ポイント交換を申請すると、ギフトコードの在庫がある場合はすぐに画面とメールでお渡しします。在庫の準備中の場合は、ご用意ができ次第お知らせします。"],
  ["動画広告は何回でも見られますか？", "チケットがもらえる動画広告の視聴は 1 日の回数に上限があります（日本時間 0:00 にリセット）。"],
  ["電話番号の確認（SMS 認証）は何のためですか？", "お一人で複数のアカウントを作るなどの不正を防ぐためです。電話番号そのものは保存せず、確認用の情報だけを保存します。"],
  ["友達紹介とは？", "マイページの「友達紹介」にある招待コード（またはリンク）からお友達が登録を完了すると、お友達とあなたの両方にチケットをお贈りします。"],
  ["景品はいつ届きますか？", "発送する景品は、申請の受付後、準備が整い次第お届けします。状況は「景品の発送申請」で確認でき、発送時にはお知らせとメールでご連絡します。"],
  ["広告やアンケートのチケットが反映されません。", "広告・アンケート事業者から成果が確認できた時点で付与されます。反映まで時間がかかる場合があります。しばらく経っても反映されない場合は、お問い合わせください。"],
  ["退会したい場合は？", "お問い合わせフォームからご連絡ください。"],
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageTitle en="GUIDE & FAQ" title="はじめての方へ・よくある質問" />
      <Panel className="mb-6">
        <h2 id="guide" className="scroll-mt-24 font-serif text-xl font-bold text-gold-light">{SITE.name}の楽しみ方</h2>
        <ol className="mt-4 space-y-4">
          {GUIDE.map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#fff2d0,#d9b56b)] font-serif font-bold text-[#3a2a12]">{i + 1}</span>
              <div>
                <p className="font-serif font-bold">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-moon/70">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel>
        <h2 className="font-serif text-xl font-bold text-gold-light">よくある質問</h2>
        <div className="mt-3 divide-y divide-veil/5">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex list-none items-center justify-between gap-4 font-serif font-bold">
                <span>Q. {q}</span>
                <span aria-hidden className="text-gold transition group-open:rotate-45">＋</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-moon/70">A. {a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-moon/60">
          解決しない場合は、<Link href="/contact" className="text-gold-light underline-offset-4 hover:underline">お問い合わせ</Link>ください。
        </p>
      </Panel>
    </div>
  );
}
