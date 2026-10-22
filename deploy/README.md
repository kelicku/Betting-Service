# 本番公開の手順（チェックリスト）

サーバー構成の選び方と費用は [docs/hosting-proposal.md](../docs/hosting-proposal.md)、環境変数の一覧は [docs/deploy.md](../docs/deploy.md) を参照。
このフォルダの `docker-compose.prod.yml` は、VPS 1 台で公開する場合の構成（HTTPS の自動化・毎日のバックアップ付き）。
クラウドのコンテナサービスを使う場合も、同じ環境変数（`backend.env.example`）と起動順をそのまま使う。

## 1. 事前に用意するもの（お客さま側）

- [ ] サーバー（または契約したクラウドのアカウント）と、公開するドメイン
- [ ] メール送信サービス（SES・SendGrid など）の SMTP 情報。送信元ドメインの SPF / DKIM / DMARC を設定
- [ ] Twilio（SMS 認証を使う場合）、広告・アンケート事業者（skyflag など）の署名鍵、デジコの契約（自動発行する場合）
- [ ] 特定商取引法に基づく表記・利用規約・プライバシーポリシーの事業者情報（`【 】` の箇所）と、専門家による確認

## 2. 設定

```bash
cd deploy
cp .env.example .env                 # DOMAIN と DB_PASSWORD
cp backend.env.example backend.env   # 【必須】の項目をすべて埋める
```

- [ ] `SECRET_KEY`・`PII_ENCRYPTION_KEY` を生成して設定し、**控えを安全な場所に保管**（暗号化鍵を失うと住所・ギフトコードが読めなくなる）
- [ ] `PUBLIC_BASE_URL` を `https://（ドメイン）` に
- [ ] DNS の A レコードをサーバーの IP に向ける（Caddy が証明書を自動取得する）
- [ ] `backend.env`・`.env` が Git に登録されていないこと（`.gitignore` 済み）

## 3. 起動と初期設定

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend python -m app.cli create-admin 管理者のメールアドレス   # パスワードを入力
```

- [ ] `https://（ドメイン）/api/health` が `{"status":"ok"}` を返す
- [ ] 管理画面にログインし、システム設定（新規登録特典・ログインボーナス・動画広告の上限・友達紹介の特典・SMS 認証）を確定値に
- [ ] 景品・ガチャ（すべてにラストワン賞）・交換景品を登録し、デジタルギフトのコードを登録
- [ ] 広告・アンケート案件を登録し、事業者に成果通知 URL `https://（ドメイン）/api/postbacks/（事業者名）` を登録
- [ ] **開発用のデータ（seed / showcase のテストアカウント・テスト用ギフトコード）は本番に入れない**（本番では両コマンドとも実行できない）

## 4. 公開前の確認

- [ ] 負荷試験（`tools/loadtest/run.py`。本番と同じ構成の確認用環境で。本番のデータベースには向けない）
- [ ] テストプレイ：登録 → メール確認 → SMS 認証 → チケット獲得 → ガチャ（1/10/100 回・ラストワン賞）→ ポイント交換 → 管理画面での対応
- [ ] 確率・在庫・ラストワン賞の表示が設定どおりか
- [ ] バックアップ（`deploy/backups/`）ができていること、**別の場所へのコピー**と、復元の手順を一度試す：
      `docker compose -f docker-compose.prod.yml exec -T db pg_restore -U gacha -d gacha --clean < backups/gacha-YYYYMMDD.dump`
- [ ] エラー監視（`SENTRY_DSN`）・死活監視（`/api/health` を外部から 1 分ごとに確認）

## 5. 更新（新しい版の反映）

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build    # 起動時にデータベースの移行が自動で実行される
```

更新の前には必ずバックアップを取ること。
