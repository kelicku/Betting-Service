# 基本設計書

## 1. システム構成

```
ブラウザ ──HTTPS──▶ Next.js（SSR / 静的配信 / /api/* を中継）──▶ FastAPI ──▶ PostgreSQL
                                                                  ├──▶ Redis（レート制限）
                                                                  ├──▶ SMTP（メール送信）
                                                                  ├──▶ S3 互換ストレージ（景品画像）
                                                                  └──▶ Sentry（エラー監視）
広告・アンケート事業者 ──サーバー間通知──▶ FastAPI /api/postbacks/{provider}
```

- API はフロントエンドと **同一オリジン**（`/api/*`）で提供し、認証 Cookie をファーストパーティとして扱う。
- 公開ページ（トップ・ガチャ一覧・ガチャ詳細）はサーバーで描画し、15〜30 秒ごとに再生成（ISR）。
- 3D 演出（Three.js）はガチャ実行画面でのみ動的に読み込む（他の画面の JS には含まれない）。

## 2. 画面構成

| 区分 | 画面 | パス |
|---|---|---|
| 一般公開 | トップ | `/` |
| | 会員登録 / メール認証 | `/register` / `/verify-email` |
| | ログイン / パスワード再設定 | `/login` / `/forgot-password` → `/reset-password` |
| | ガチャ一覧 / ガチャ詳細（提供割合・残り口数・ラストワン賞） | `/gacha` / `/gacha/[slug]` |
| | お問い合わせ / 利用規約 / プライバシーポリシー | `/contact` / `/terms` / `/privacy` |
| 会員 | マイページ（ログインボーナス・所持景品の集計） | `/mypage` |
| | チケット管理（残高・獲得履歴・使用履歴） | `/tickets` |
| | チケット獲得（広告・アンケート・ミッション・キャンペーン） | `/earn` |
| | ガチャ実行画面（演出） | `/gacha/[slug]/play` |
| | 抽選結果 / 抽選履歴 | `/draws/[id]` / `/draws` |
| | 獲得景品一覧 | `/prizes` |
| | 景品交換申請 / 交換履歴・詳細 | `/exchanges/new` / `/exchanges` / `/exchanges/[id]` |
| | プロフィール設定（パスワード・ログイン端末・演出設定） | `/settings` |
| | お知らせ | `/notifications` |
| 管理 | ダッシュボード | `/admin` |
| | ユーザー管理（検索・詳細・停止・権限・チケット調整） | `/admin/users` |
| | チケット管理（全取引履歴・種類別集計） | `/admin/tickets` |
| | ガチャ管理（作成・編集・景品構成・当選確率・公開状態） | `/admin/gachas` |
| | 景品管理（画像アップロード） / 在庫管理 | `/admin/prizes` / `/admin/inventory` |
| | ラストワン賞管理 / 抽選履歴（改ざん検知） | `/admin/last-one` / `/admin/draws` |
| | 広告・アンケート管理（案件・成果履歴・ミッション・通知ログ） | `/admin/offers` |
| | 交換申請管理 | `/admin/exchanges` |
| | 操作履歴 / システム設定（お知らせ配信・お問い合わせ） | `/admin/audit` / `/admin/settings` |

すべての画面は PC・タブレット・スマートフォンに対応。スマートフォンでは下部ナビ中央にガチャボタン、
ガチャ詳細では所持チケットと 1回／10回／100回ボタンを親指の届く位置に固定表示する。

## 3. データベース設計

PostgreSQL 16。マイグレーションは `backend/alembic/versions/`。主なテーブル:

| テーブル | 役割 | 整合性のための制約 |
|---|---|---|
| `users` | 会員・権限（user / staff / admin）・停止状態・ログイン失敗回数 | email 一意、role/status の CHECK |
| `user_sessions` | ログインセッション（トークンは SHA-256 ハッシュのみ保存） | token_hash 一意 |
| `email_tokens` | メール認証・パスワード再設定トークン（使い捨て・期限付き） | token_hash 一意 |
| `ticket_wallets` | チケット残高 | `balance >= 0` |
| `ticket_transactions` | **すべての** チケット増減の台帳（残高スナップショット付き） | `dedupe_key` 一意（重複付与・重複消費の防止） |
| `prizes` | 景品マスタ（レアリティ・交換可否・参考価格） | rarity CHECK |
| `gachas` | ガチャ（方式・チケット数・期間・総口数・ラストワン賞） | `pulls_done <= max_pulls` |
| `gacha_items` | ガチャ内の景品・重み（確率）・在庫 | `stock_remaining >= 0`、(gacha, prize) 一意 |
| `draws` / `draw_results` | 抽選リクエストと各回の結果（HMAC による改ざん検知値付き） | (user, idempotency_key) 一意 |
| `last_one_awards` | ラストワン賞の付与記録 | **gacha_id 一意**（重複付与の防止） |
| `user_prizes` | 所持景品（所持中 / 交換申請中 / 交換済み） | draw_result_id 一意 |
| `exchange_requests` / `exchange_items` / `exchange_status_logs` | 交換申請・対象景品・状態遷移履歴 | **有効な申請項目は景品ごとに 1 件**（部分一意インデックス） |
| `shipping_addresses` | 保存済み配送先（**暗号化**） | |
| `offers` / `offer_clicks` | 広告・アンケート案件と遷移記録（click_id） | |
| `conversions` | 成果履歴 | **(provider, external_conversion_id) 一意**（重複通知の防止） |
| `postback_logs` | 受信したすべての成果通知（不正なものを含む） | |
| `missions` / `mission_claims` | キャンペーン・条件達成ミッションと受取記録 | (mission, user) 一意 |
| `daily_login_claims` | ログインボーナス受取 | (user, 日本時間の日付) 一意 |
| `notifications` / `announcements` | 個人向け通知履歴 / 全体お知らせ | |
| `admin_audit_logs` | 管理者操作・個人情報閲覧の監査ログ | |
| `system_settings` / `contact_messages` | 管理画面から変更可能な設定 / お問い合わせ | |

検索・一覧で使う列（`ticket_transactions(user_id, created_at)`、`draws(user_id, created_at)`、`draws(gacha_id, created_at)`、
`user_prizes(user_id, status)`、`notifications(user_id, created_at)` など）にインデックスを設定している。

## 4. 認証方式

- パスワードは **Argon2id** でハッシュ化。存在しないメールアドレスでも同程度の計算を行い、登録有無の推測を防ぐ。
- セッションは 256 ビットのランダムトークンを HttpOnly・SameSite=Lax Cookie で保持し、DB にはハッシュのみ保存。
  パスワード変更・再設定、アカウント停止、権限変更時は既存セッションを失効させる。
- 新規登録・パスワード再設定の応答は、メールアドレスの登録有無に関わらず同一。
- メール認証完了時に新規登録特典を付与（`dedupe_key` で 1 回限り）。抽選・チケット獲得にはメール認証を必須とし、
  使い捨てアドレスによる特典の大量取得を抑止。
- ログイン 5 回失敗で 15 分ロック。IP 単位・メールアドレス単位のレート制限。
- 権限：`user`（会員）・`staff`（閲覧、交換申請対応、お知らせ・お問い合わせ対応）・`admin`（全権限）。
  権限チェックはすべて API 側で行い、画面側のガードは表示制御のみ。

## 5. 抽選エンジン（`backend/app/services/draw_engine.py`）

1 回の抽選リクエスト（1・10・100 回）は、以下を **1 つのトランザクション** で行う。

1. `ticket_wallets` の行を `SELECT … FOR UPDATE` でロック（同一ユーザーの同時抽選を直列化）
2. 冪等キーを確認。処理済みなら保存済みの結果を返す（二重消費しない）
3. `gachas`・`gacha_items` の行をロック（同一ガチャへの同時抽選を直列化）
4. 公開状態・期間・まとめ引きの可否・**残り口数**・**在庫**・**チケット残高** を検証。
   まとめ引きで 1 つでも満たせなければ **全体を実行しない**
5. `secrets.SystemRandom`（OS の暗号論的乱数）で抽選
   - 確率抽選方式：設定重みに比例（在庫制限付きの景品は在庫切れで対象外）
   - ボックス方式：各景品の **残り在庫数** に比例（＝全口が等確率）
6. 最後の 1 口を含む抽選なら、末尾にラストワン賞を追加
7. チケット消費（台帳記録）・在庫減算（`WHERE stock_remaining >= n` 付き）・結果・所持景品・ラストワン賞を保存し COMMIT
8. 結果の HMAC（`result_digest`）を保存。DB の直接改ざんは管理画面・`python -m app.cli verify-draws` で検出できる

ロック順序は常に `ticket_wallets → gachas → gacha_items` で、デッドロックが起きない。
CHECK 制約・一意制約は、アプリケーションのロジックに誤りがあった場合の最終防衛線として機能する。

**残り口数の定義**：ボックス方式＝有効な景品の残り在庫合計。確率方式＝`max_pulls - pulls_done`（未設定なら無制限）。
ただし確率方式でも、抽選対象のすべてが在庫制限付きなら在庫合計が上限になる。
ラストワン賞は「最後の 1 口」が定義できるガチャ（ボックス方式、または総口数を設定した確率方式）でのみ有効。

### クライアント側の再試行

1. ガチャ詳細で「引く」を押すと冪等キーを発行し、sessionStorage に保存してから実行画面へ遷移
2. 実行画面は同じキーで抽選 API を呼ぶ（再読み込みしても同じキー → 同じ結果）
3. 通信エラー・5xx は同じキーで最大 3 回再送。それでも失敗したら `GET /api/draws/by-key/{key}` で照会
4. 結果を受け取ってから演出を開始する

## 6. 演出

| 演出レベル | 既定となる条件 | 内容 |
|---|---|---|
| すべての演出（full） | WebGL 対応・4 コア以上 | Three.js：魔法陣（Canvas 生成テクスチャ）・粒子（GPU シェーダー）・ガラスの宝箱（物理ベース素材）・光芒・光の柱 |
| 軽量（lite） | WebGL 非対応・低性能端末 | SVG と CSS 変形による 2D 版（同じ 5 段階の流れ） |
| 最小限（off） | OS の「視差効果を減らす」設定 | 演出なしで結果を表示。背景の星も静止 |

ユーザーはプロフィール設定でいつでも切り替えられる。演出は GSAP のタイムラインで制御し、
「スキップ」でタイムラインを末尾まで進める。レアリティに応じて光の色（N：銀／R：青／SR：紫／SSR：金）と強さが変わる。

## 7. セキュリティ対策の対応表

| 要件 | 実装 |
|---|---|
| 安全な認証処理 | Argon2id、ハッシュ化セッショントークン、ログインロック、登録有無を推測させない応答 |
| 権限に応じたアクセス制限 | API の依存関係（`require_staff` / `require_admin`）で強制。自身の停止・降格は不可 |
| SQL インジェクション | SQLAlchemy のパラメータバインドのみ使用（文字列連結の SQL なし） |
| XSS | React の自動エスケープ（`dangerouslySetInnerHTML` 不使用）、`X-Content-Type-Options`、画像アップロードは再エンコード |
| CSRF | ダブルサブミット Cookie ＋ `X-CSRF-Token` ヘッダー ＋ Origin 検証、SameSite=Lax |
| API のアクセス制限 | エンドポイント別のレート制限（Redis 共有） |
| 不正なチケット付与の防止 | 付与はサーバー内部のサービスのみ。成果通知は署名検証。管理者付与は監査ログ |
| チケット二重消費の防止 | 冪等キー＋行ロック＋台帳の一意キー＋残高の CHECK 制約 |
| 抽選結果の改ざん防止 | サーバー側の CSPRNG で抽選・確定後に返却、HMAC による改ざん検知 |
| 景品在庫の整合性 | 行ロック＋条件付き UPDATE＋CHECK 制約 |
| ラストワン賞の重複付与防止 | ガチャ行のロック＋`last_one_awards.gacha_id` 一意制約 |
| 広告成果通知の署名検証 | HMAC-SHA256・タイムスタンプ（±10分）・任意で送信元 IP 制限・成果 ID の一意制約 |
| 管理者操作の監査ログ | すべての変更操作と配送先閲覧を `admin_audit_logs` に記録 |
| 個人情報の保護 | 配送先は Fernet（AES）で暗号化、一覧はマスク表示、閲覧を記録、保持期限後に消去 |
