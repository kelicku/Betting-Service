# 開発環境構築手順

## 方法 A：すべて Docker で動かす（推奨）

前提：Docker / Docker Compose v2

```bash
docker compose up -d --build --wait
docker compose exec backend python -m app.cli seed
```

- サイト http://localhost:3300 ／ API http://localhost:8300/api/docs ／ メール http://localhost:8030
- 停止：`docker compose down`（データも消す場合は `docker compose down -v`）
- 画像を S3 互換ストレージ（MinIO）に保存して試す場合：`docker compose --profile storage up -d minio` を起動し、
  `backend/.env.docker` に `STORAGE_BACKEND=s3`、`S3_ENDPOINT_URL=http://minio:9000`、`S3_ACCESS_KEY=minioadmin`、
  `S3_SECRET_KEY=minioadmin`、`S3_PUBLIC_BASE_URL=http://localhost:9300/hoshifuru` を設定（バケットは MinIO コンソールで作成し公開読み取りに設定）

## 方法 B：アプリはローカルで動かす（ホットリロード）

前提：Python 3.12、Node.js 18.18 以上（20 推奨）

```bash
# データベース・Redis・メール受信箱だけ Docker で起動
docker compose up -d db redis mailpit

# バックエンド
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/alembic upgrade head
.venv/bin/python -m app.cli seed
.venv/bin/uvicorn app.main:app --reload --port 8300

# フロントエンド（別ターミナル）
cd frontend
npm install
npm run dev          # http://localhost:3300（/api/* は localhost:8300 に中継）
```

バックエンドの既定値（`app/core/config.py`）は方法 B のポート（DB 5470・Redis 6390・SMTP 1030）に合わせてあり、
`.env` なしで起動できます。

## テスト

```bash
# バックエンド：テスト用 DB（gacha_test）を毎回作り直し、マイグレーションを適用してから実行
cd backend && .venv/bin/pytest
.venv/bin/ruff check app tests

# フロントエンド
cd frontend
npm run lint && npm run typecheck && npm test
npx playwright install chromium     # 初回のみ
npx playwright test                 # 起動中の環境（既定 http://localhost:3300）に対して実行
```

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `.venv/bin/alembic revision --autogenerate -m "説明"` | モデル変更からマイグレーションを生成 |
| `.venv/bin/alembic check` | モデルとマイグレーションの差分がないか確認（CI でも実行） |
| `python -m app.cli create-admin EMAIL` | 管理者を作成（`ADMIN_PASSWORD` 環境変数または対話入力） |
| `python -m app.cli verify-draws` | 全抽選結果の HMAC を照合 |
| `node scripts/gen-art.mjs` | 景品・バナーの SVG イラストを再生成 |
| `curl localhost:8300/api/openapi.json > docs/openapi.json` | API 定義を更新 |

## 開発用の代替処理

| 外部サービス | 開発時の代替 | 本番で必要な作業 |
|---|---|---|
| メール送信 | Mailpit（SMTP を受けて Web 画面で確認） | SMTP 互換サービスの認証情報を設定 |
| オブジェクトストレージ | ローカルディスク（`backend/var/uploads`、`/api/media` で配信） | S3 互換ストレージと CDN の設定 |
| 広告・アンケート事業者 | 模擬事業者 `mock`（「成果通知をシミュレートする」ボタン）。付与は `is_test` として本番成果と区別。`ENV=production` では自動的に無効 | 事業者との契約、署名鍵の設定、アダプター実装 |
| エラー監視 | ログ出力のみ | `SENTRY_DSN` を設定 |
| 郵便番号検索 | zipcloud（無料 API）をブラウザから呼び出し（失敗しても手入力可） | 必要に応じて利用規約を確認・差し替え |
