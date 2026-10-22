# 本番公開手順

## 1. 構成例

| 役割 | 推奨 |
|---|---|
| フロントエンド | `frontend/Dockerfile` のコンテナ（Next.js standalone、ポート 3000） |
| バックエンド | `backend/Dockerfile` のコンテナ（起動時に `alembic upgrade head` を実行、ポート 8000） |
| データベース | マネージド PostgreSQL 16（自動バックアップ・ポイントインタイムリカバリを有効化） |
| Redis | マネージド Redis（レート制限をプロセス間で共有） |
| 画像 | S3 互換ストレージ＋CDN |
| メール | SMTP 互換サービス（Amazon SES、SendGrid 等。SPF / DKIM / DMARC を設定） |
| 入口 | ロードバランサーで TLS 終端し、フロントエンドへ転送 |

ブラウザからはフロントエンドのみが見え、`/api/*` はフロントエンドがバックエンドへ中継する。
**`/api/postbacks/*` も同じ経路で届く** ため、事業者には `https://<公開ドメイン>/api/postbacks/<事業者名>` を登録する。

> フロントエンドの中継先（`BACKEND_INTERNAL_URL`）は **ビルド時** に埋め込まれる。
> イメージをビルドする際に `--build-arg BACKEND_INTERNAL_URL=http://<バックエンドの内部アドレス>:8000` を指定すること。

## 2. 環境変数（バックエンド）

`backend/.env.example` をもとに設定する。`ENV=production` では、以下が未設定・不適切だと **起動を拒否** する。

| 変数 | 必須 | 説明 |
|---|---|---|
| `ENV` | ○ | `production` |
| `PUBLIC_BASE_URL` | ○ | 公開 URL（メール内のリンク・CSRF の Origin 検証に使用） |
| `DATABASE_URL` | ○ | `postgresql+asyncpg://…` |
| `SECRET_KEY` | ○ | 32 文字以上のランダム値。セッション以外に抽選結果の HMAC にも使うため、**変更すると既存の抽選結果の改ざん検知が不一致になる** |
| `PII_ENCRYPTION_KEY` | ○ | 配送先の暗号化鍵（Fernet）。**紛失すると保存済みの配送先を復号できない**。シークレット管理サービスで保管 |
| `COOKIE_SECURE` | ○ | `true` |
| `REDIS_URL` | 推奨 | 複数インスタンス運用時は必須 |
| `SMTP_*` / `MAIL_FROM` | ○ | メール送信 |
| `STORAGE_BACKEND=s3` / `S3_*` | ○ | 画像の保存先 |
| `SENTRY_DSN` | 推奨 | エラー監視 |
| `ENABLE_MOCK_OFFERS` | | 本番では `false`（`ENV=production` なら設定に関わらず無効） |
| `DEMO_LOGIN_ENABLED` / `DEMO_LOGIN_TICKETS` / `DEMO_LOGIN_POINTS` | | デモ用ワンクリックログイン（お試しアカウントを自動作成）と付与するチケット・ポイント。`ENV=production` では設定に関わらず無効 |
| `SMS_BACKEND` | 本番は `twilio` | SMS の送信方法。`console`（送らずにログへ出す・開発用）／`twilio` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | SMS 認証を使う場合 | Twilio の認証情報（秘密情報として管理） |
| `TWILIO_FROM_NUMBER` または `TWILIO_MESSAGING_SERVICE_SID` | SMS 認証を使う場合 | 送信元の番号、または Messaging Service |
| `SMS_CODE_TTL_MINUTES` | | 確認コードの有効期限（既定 10 分） |
| `DIGICO_API_BASE_URL` / `DIGICO_API_KEY` | デジコの自動発行を使う場合 | 契約後に設定（未設定の間はギフトコード在庫・手動発行で運用。`app/services/gift_issuer.py` に API 呼び出しを実装） |
| `DATABASE_POOL_SIZE` / `DATABASE_MAX_OVERFLOW` / `DATABASE_POOL_TIMEOUT` | | DB 接続数（既定 10 / 5 / 30 秒）。「台数 × ワーカー数 × (POOL_SIZE + MAX_OVERFLOW)」が DB の最大接続数を下回るように（[サーバー構成のご提案](hosting-proposal.md)） |
| `POSTBACK_SECRET_<事業者名>` | 事業者ごと | 成果通知の署名鍵 |
| `POSTBACK_IPS_<事業者名>` | 任意 | 成果通知の送信元 IP 制限（カンマ区切り） |
| `WEB_CONCURRENCY` | 任意 | uvicorn のワーカー数（既定 2） |
| `ALLOWED_ORIGINS` | 任意 | `PUBLIC_BASE_URL` 以外に操作を受け付けるアクセス元（カンマ区切り）。デモ用の一時 URL や移行中の旧ドメイン。ここにないアドレスからの操作は「このアドレス（…）からの操作は受け付けていません」で拒否される |
| `FORWARDED_ALLOW_IPS` | 任意 | `X-Forwarded-For` を信頼する送信元（既定はプライベートネットワーク）。フロントエンド・LB のアドレス範囲に合わせる |

> バックエンドは **インターネットに直接公開しない**（フロントエンド経由のみ）。直接公開すると、レート制限やアクセス元 IP の記録が正しく機能しない。

鍵の生成：

```bash
python -c "import secrets;print(secrets.token_urlsafe(48))"                                   # SECRET_KEY
python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"      # PII_ENCRYPTION_KEY
```

## 3. 公開手順

1. 上記の環境変数・シークレットを登録する
2. イメージをビルドして登録（CI の `images` ジョブが main ブランチで ghcr.io に push する）
3. データベースを作成し、バックエンドを起動（起動時にマイグレーションが自動適用される）。
   複数台で同時に起動する場合は、先に 1 台だけで `alembic upgrade head` を実行してから残りを起動する
4. 管理者を作成：`docker compose exec backend python -m app.cli create-admin admin@example.com`
   （**seed コマンドは本番で実行しない**。テストアカウントと開発用の案件が作成されるため）
5. 管理画面で景品・ガチャ・案件・ミッションを登録し、`/admin/settings` で特典枚数などを確認
6. 動作確認：
   - `GET /api/health` が `{"status":"ok"}`
   - 会員登録 → 確認メール受信 → 特典付与
   - テスト用ガチャ（下書き）を公開して 1 回抽選 → 管理画面の抽選履歴で「改ざん検知：正常」
   - 事業者のテスト通知で成果が付与されること、署名を変えた通知が 403 になること
7. 定期実行を設定（[運用・保守説明書](operations.md#定期実行)）

## 4. データベースの移行・更新

- スキーマ変更は Alembic のマイグレーションとしてコミットし、デプロイ時に自動適用する
- 列の削除・名前変更など後方互換性のない変更は、「新しい列の追加 → アプリの切り替え → 古い列の削除」の 2 段階に分けてデプロイする
- 大きなテーブルへのインデックス追加は `CREATE INDEX CONCURRENTLY` を使うマイグレーションを手書きする
- ロールバック：`alembic downgrade -1`（データが失われる変更は事前にバックアップを取得）
