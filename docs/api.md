# API 仕様書

わくわくガチャのバックエンド API の一覧です。詳細なリクエスト／レスポンス定義は以下を参照してください。

- 対話型ドキュメント（Swagger UI）：`http://localhost:8300/api/docs`
- ReDoc：`http://localhost:8300/api/redoc`
- OpenAPI 定義ファイル：[`openapi.json`](openapi.json)（`curl localhost:8300/api/openapi.json` で再生成）

## 共通仕様

| 項目 | 内容 |
|---|---|
| ベース URL | `/api`（フロントエンドと同一オリジン。Next.js が `/api/*` をバックエンドへ中継） |
| 認証 | HttpOnly Cookie `hf_session`（ランダムトークン。DB にはハッシュのみ保存、14日で失効） |
| CSRF 対策 | 状態を変更するリクエスト（POST/PUT/PATCH/DELETE）では、Cookie `hf_csrf` と同じ値を `X-CSRF-Token` ヘッダーに設定する（ダブルサブミット）。加えて `Origin` ヘッダーを検証。`/api/postbacks/*` は署名検証のため対象外 |
| 冪等性 | 抽選 `POST /api/gachas/{id}/draw`、交換申請 `POST /api/exchanges`、管理者のチケット調整は `idempotency_key` を必須とし、同じキーの再送には保存済みの結果を返す |
| エラー形式 | `{"error": {"code": "insufficient_tickets", "message": "チケットが不足しています…", ...}}`（`message` はそのまま画面に表示できる日本語） |
| レート制限 | 超過時は `429` と `retry_after`（秒）。Redis で全プロセス共有（未設定時はプロセス内メモリ） |
| 日時 | ISO 8601（UTC）。画面表示は日本時間 |

### 主なエラーコード

| HTTP | code | 意味 |
|---|---|---|
| 401 | `unauthorized` | 未ログイン |
| 403 | `forbidden` / `email_not_verified` / `csrf` | 権限不足・メール未確認・CSRF 検証失敗 |
| 402 | `insufficient_tickets` | チケット不足（`required` / `balance` を含む） |
| 409 | `sold_out` / `not_enough_remaining` / `gacha_closed` / `already_requested` / `invalid_transition` | 完売・残り口数不足（`remaining` を含む）・期間外・二重申請・不正な状態遷移 |
| 422 | `validation_error` | 入力値の誤り（`fields` を含む） |
| 423 | `account_locked` | ログイン失敗が続いたための一時ロック |
| 429 | `rate_limited` | アクセス集中 |
| 503 | `maintenance` | メンテナンス中 |

## 抽選 API の詳細

```
POST /api/gachas/{gacha_id}/draw
{ "count": 1 | 10 | 100, "idempotency_key": "<クライアントが生成した32桁の16進数>" }
```

1. サーバーがチケット残高行・ガチャ行・景品行をロックし、公開状態・期間・残り口数・在庫・チケットを検証する
2. まとめ引きで条件を満たせない場合は **全体を実行しない**（チケットは消費されない）
3. CSPRNG で抽選し、チケット消費・在庫減算・抽選結果・所持景品・ラストワン賞を **1 トランザクションで保存** してからレスポンスを返す
4. レスポンスの `results[]` には、ラストワン賞を獲得した場合に `is_last_one: true` の要素が末尾に 1 件追加される
5. 通信断などで結果を受け取れなかった場合は、同じ `idempotency_key` で再送するか `GET /api/draws/by-key/{idempotency_key}` で照会する（`replayed: true` が返り、二重消費はない）

## 成果通知（ポストバック）の仕様

```
GET|POST /api/postbacks/{provider}
  click_id       … 案件遷移時に発行した ID（遷移先 URL の {click_id}）
  conversion_id  … 事業者側の成果 ID（重複判定に使用）
  status         … approved | rejected | pending
  payout         … 任意
  ts             … UNIX 秒（±600 秒以内）
  sig            … HMAC-SHA256(secret, sig を除くパラメータをキー昇順で k=v を & 連結した文字列) の 16 進表記
```

- 署名不正・時刻ずれ：`403`（付与なし・ログ記録）
- 正常・重複・照合失敗（不明な click_id 等）：`200 OK`（事業者側の再送を止めるため。付与は正常かつ初回のみ）
- 事業者ごとに署名方式が異なる場合は `backend/app/providers/` にアダプターを追加する（[運用・保守説明書](operations.md#広告アンケート事業者の追加) 参照）

## 最近の当選 API

`GET /api/recent-wins` — SR 以上（またはラストワン賞）が出た直近 20 件の抽選。ニックネームは先頭 1 文字以外を伏せ字（例：星●●）にし、
メールアドレス・会員 ID は含めない。アクセス集中に備えてサーバー内で 10 秒間キャッシュする。トップページ・ガチャ一覧のティッカーで使用。

## メッセージ配信 API

```
GET  /api/admin/messages/recipients?target_type=users|all|verified&user_ids=1,2   送信前の対象人数（メール送信数を含む）
POST /api/admin/messages   { target_type, user_ids, title, body, link（/ から始まるサイト内パス）, send_email }
GET  /api/admin/messages   配信履歴
```

スタッフは `target_type=users`（50 名まで）のみ、管理者は全種別を送信できる。

## デモ用ワンクリックログイン

`POST /api/auth/demo-login` — `DEMO_LOGIN_ENABLED=true` かつ本番以外の環境でのみ有効（無効時は 404）。
お試しアカウントを作成してログインし、`MeOut` を返す。`GET /api/config` の `demo_login` で表示可否を判定する。

## エンドポイント一覧

### 認証

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/auth/csrf` | CSRF トークン Cookie を発行 |
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/verify-email` | Verify Email |
| POST | `/api/auth/resend-verification` | Resend Verification |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| POST | `/api/auth/forgot-password` | Forgot Password |
| POST | `/api/auth/reset-password` | Reset Password |
| GET | `/api/auth/me` | Me |
| PATCH | `/api/auth/me` | Update Profile |
| POST | `/api/auth/change-password` | Change Password |
| GET | `/api/auth/sessions` | Sessions |
| POST | `/api/auth/sessions/revoke-others` | Revoke Others |

### ガチャ

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/gachas` | List Gachas |
| GET | `/api/gachas/{slug}` | Get Gacha |
| POST | `/api/gachas/{gacha_id}/draw` | ガチャを引く（サーバー側で抽選し結果を確定・保存） |

### 抽選履歴

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/draws` | My Draws |
| GET | `/api/draws/{draw_id}` | 抽選結果の再取得（通信断時の復旧に使用） |
| GET | `/api/draws/by-key/{idempotency_key}` | 冪等キーから抽選結果を取得 |

### チケット

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/tickets/wallet` | Wallet |
| GET | `/api/tickets/transactions` | Transactions |

### チケット獲得

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/rewards/daily` | Daily Status |
| POST | `/api/rewards/daily` | Claim Daily |
| GET | `/api/missions` | Missions |
| POST | `/api/missions/{mission_id}/claim` | Claim Mission |
| GET | `/api/offers` | List Offers |
| POST | `/api/offers/{offer_id}/start` | Start Offer |
| POST | `/api/offers/clicks/{click_id}/simulate` | 【開発用】模擬事業者の成果通知を発生させる |

### 景品

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/prizes` | My Prizes |
| GET | `/api/prizes/summary` | Prize Summary |

### 景品交換

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/shipping-address` | Saved Address |
| POST | `/api/exchanges` | Create Exchange |
| GET | `/api/exchanges` | My Exchanges |
| GET | `/api/exchanges/{req_id}` | Get Exchange |
| POST | `/api/exchanges/{req_id}/cancel` | Cancel Exchange |

### お知らせ

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/notifications` | Notifications |
| POST | `/api/notifications/read-all` | Read All |
| GET | `/api/announcements` | Announcements |

### トップページ表示用（ログイン不要）

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/banners` | 掲載期間内のキャンペーンバナー（表示順） |
| GET | `/api/featured-prizes` | 注目の景品（景品の「注目」設定・表示順。掲載ガチャへのリンク付き） |
| GET | `/api/stats/public` | 実績（会員数＝メール確認済みの有効会員〈デモ除く〉、累計ポイント獲得数、登場アイテム数）と新規登録特典のポイント数（`signup_bonus`） |
| GET | `/api/site-links` | SNS の URL（管理画面の設定。https のみ） |
| POST | `/api/newsletter` | メールマガジン登録（`{"email", "consent": true}`。1 時間 5 回まで） |

管理：`GET/POST /api/admin/banners`、`PUT/DELETE /api/admin/banners/{id}`（バナー管理、管理者のみ・操作ログ記録）、`GET /api/admin/newsletter`（登録者一覧）。

### ポイント（チケットとは別の残高）

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/points/wallet` | ポイント残高・累計獲得・累計交換 |
| GET | `/api/points/transactions` | ポイント履歴（`direction=all|earn|spend`） |

ポイントはガチャのポイント景品（`point_value` > 0）に当選すると自動で加算される。抽選の応答には `points_won`（この抽選で当たったポイント）と `point_balance_after` が含まれる。`/api/auth/me` は `balance`（チケット）と `point_balance`（ポイント）を別々に返す。

### ポイント交換

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/shop/items` | 交換できる景品（`instant`：ギフトコード在庫あり、`sold_out`、`limit_reached`） |
| POST | `/api/shop/orders` | 交換を申請（`{item_id, idempotency_key, shipping?, save_address?}`。メール確認＋必要なら SMS 認証が必要。1 分 20 回まで） |
| GET | `/api/shop/orders` | 自分の交換履歴（お渡し済みのギフトコードを含む） |
| POST | `/api/shop/orders/{id}/cancel` | 受付中の申請を取消（ポイントは返還） |

デジタルギフトは、ギフトコード在庫があれば申請と同時に「お渡し済み」になり、応答の `gift_code` にコードが入る。在庫がなければ「受付」になり、運営がコードを入力するか、コードを登録した時点で自動でお渡しする。
エラー：`insufficient_points`（402）・`sold_out`（409）・`shop_limit`（409）・`shipping_required`（400）。

### SMS 認証（電話番号の確認）

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/phone` | 確認状況（`verified`・`last4`・`required`） |
| POST | `/api/phone/send-code` | 確認コードを送信（`{phone}`。日本の携帯番号 070/080/090 または +国番号。1 アカウント 10 分 3 回・1 日 10 回、同じ番号へ 1 日 5 回） |
| POST | `/api/phone/verify` | コードを確認（`{code}`。有効期限 10 分・入力 5 回まで） |

システム設定 `sms_verification_required` を有効にすると、ガチャ・チケット獲得・ポイント交換で未確認の会員は `phone_not_verified`（403）になる。運営スタッフ・お試しアカウントは対象外。
電話番号は保存せず、照合用の HMAC と末尾 4 桁だけを保存する（同じ番号での複数アカウントは `phone_in_use`）。

### 友達紹介

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/invite` | 自分の招待コード・紹介人数・完了人数・特典枚数 |

`POST /api/auth/register` に `invite_code`（任意）を渡すと紹介者が記録され、紹介された人が登録を完了（メール確認、SMS 認証が必須ならその完了）した時点で双方にチケットを付与する（紹介者への付与は 1 日 10 人まで）。

### 動画リワード広告

案件の種類 `video` は、1 日の視聴回数の上限（システム設定 `video_daily_limit`、既定 5 回、日本時間 0:00 にリセット、すべての動画案件の合計）で制御する。
`GET /api/offers` の動画案件には `daily_used`・`daily_limit` が入る。上限に達すると開始時に `video_daily_limit`（409）、成果通知が届いても `daily_limit` として付与しない。

### お問い合わせ

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/api/contact` | Contact |

### 成果通知（サーバー間）

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/api/postbacks/{provider_name}` | Postback |
| GET | `/api/postbacks/{provider_name}` | Postback |

### 管理

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/admin/stats` | Stats |
| GET | `/api/admin/users` | List Users |
| GET | `/api/admin/users/{user_id}` | User Detail |
| POST | `/api/admin/users/{user_id}/suspend` | Suspend |
| POST | `/api/admin/users/{user_id}/unsuspend` | Unsuspend |
| POST | `/api/admin/users/{user_id}/role` | Set Role |
| POST | `/api/admin/users/{user_id}/tickets` | Adjust Tickets |
| GET | `/api/admin/tickets/transactions` | All Transactions |
| GET | `/api/admin/tickets/summary` | Tickets Summary |
| GET | `/api/admin/audit-logs` | Audit Logs |
| GET | `/api/admin/settings` | Get Settings |
| PUT | `/api/admin/settings` | Put Settings |
| GET | `/api/admin/announcements` | List Announcements |
| POST | `/api/admin/announcements` | Create Announcement |
| PUT | `/api/admin/announcements/{ann_id}` | Update Announcement |
| DELETE | `/api/admin/announcements/{ann_id}` | Delete Announcement |
| GET | `/api/admin/contacts` | List Contacts |
| POST | `/api/admin/contacts/{cid}/status` | Contact Status |
| POST | `/api/admin/uploads` | Upload |
| GET | `/api/admin/prizes` | List Prizes |
| POST | `/api/admin/prizes` | Create Prize |
| PUT | `/api/admin/prizes/{prize_id}` | Update Prize |
| GET | `/api/admin/gachas` | List Gachas |
| POST | `/api/admin/gachas` | Create Gacha |
| GET | `/api/admin/gachas/{gacha_id}` | Get Gacha |
| PUT | `/api/admin/gachas/{gacha_id}` | Update Gacha |
| PUT | `/api/admin/gachas/{gacha_id}/items` | Set Items |
| POST | `/api/admin/gachas/{gacha_id}/stock` | Adjust Stock |
| POST | `/api/admin/gachas/{gacha_id}/status` | Set Status |
| GET | `/api/admin/draws` | List Draws |
| GET | `/api/admin/draws/{draw_id}` | Draw Detail |
| GET | `/api/admin/last-one-awards` | Last One Awards |
| GET | `/api/admin/offers` | List Offers |
| POST | `/api/admin/offers` | Create Offer |
| PUT | `/api/admin/offers/{offer_id}` | Update Offer |
| GET | `/api/admin/conversions` | List Conversions |
| GET | `/api/admin/postback-logs` | Postback Logs |
| GET | `/api/admin/missions` | List Missions |
| POST | `/api/admin/missions` | Create Mission |
| PUT | `/api/admin/missions/{mission_id}` | Update Mission |
| GET | `/api/admin/exchanges` | List Exchanges |
| GET | `/api/admin/exchanges/{req_id}` | Exchange Detail |
| POST | `/api/admin/exchanges/{req_id}/status` | Exchange Transition |
| POST | `/api/admin/exchanges/purge-pii` | Purge Pii |
| GET | `/api/admin/inventory` | Inventory |

### 管理（フェーズ 2 で追加）

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/api/admin/users/{id}/points` | ポイントの付与・減算（管理者のみ・操作履歴に記録） |
| GET / POST | `/api/admin/shop/items` | 交換景品の一覧（コード在庫数・対応待ち件数付き）・追加 |
| PUT / DELETE | `/api/admin/shop/items/{id}` | 編集・削除（申請がある景品は非公開に） |
| POST | `/api/admin/shop/items/{id}/codes` | ギフトコードの一括登録（1 行 1 件、最大 5,000 件。重複除外・受付中の申請へ自動でお渡し） |
| GET | `/api/admin/shop/items/{id}/codes` | コード在庫の件数（コード自体は返さない） |
| GET | `/api/admin/shop/orders` | 交換申請の一覧（`status`・`kind` で絞り込み） |
| GET | `/api/admin/shop/orders/{id}` | 詳細（配送先の閲覧は操作履歴に記録。ギフトコードは表示しない） |
| POST | `/api/admin/shop/orders/{id}/transition` | `fulfilled`（コードを入力してお渡し）・`shipped`（追跡番号）・`cancelled`（取消・ポイント返還） |
| GET | `/api/admin/referrals` | 紹介人数の多い会員（不正の確認用） |

### 運用

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/health` | Health |
| GET | `/api/config` | Public Config |

管理 API（`/api/admin/*`）は `staff` 以上の権限が必要です。チケット付与・ユーザー停止・権限変更・ガチャ／景品／案件の作成変更・システム設定・操作履歴の閲覧は `admin` のみ実行できます。変更操作はすべて `admin_audit_logs` に記録されます。
