# わくわくガチャ — WEB ガチャプラットフォーム

会員登録したユーザーが、広告視聴・アンケート回答・ログインボーナス等で獲得した**チケット**でガチャ（1回・10回・100回）を引き、
当たった**ポイント**をデジタルギフト（デジコなど）や景品と交換できる WEB サービスです。
ラストワン賞、SMS 認証、友達紹介、動画リワード広告の 1 日上限、運営者向け管理画面を備えています。

抽選・チケット消費・ポイント付与・在庫更新・ラストワン賞判定は **すべてサーバー側の 1 トランザクション** で行い、
結果を保存してから演出を開始します（演出のスキップや通信断で結果は変わりません）。

| | |
|---|---|
| フロントエンド | Next.js 15 / React 19 / TypeScript / Tailwind CSS / Motion for React / GSAP / Three.js / React Three Fiber |
| バックエンド | Python 3.12 / FastAPI / SQLAlchemy 2（async）/ Alembic / PostgreSQL 16 / Redis |
| インフラ | Docker / Docker Compose / S3 互換ストレージ / SMTP / Sentry / GitHub Actions |

## すぐに動かす

```bash
docker compose up -d --build --wait
docker compose exec backend python -m app.cli seed       # 初期データ（景品・案件・テストアカウント）
docker compose exec backend python -m app.cli showcase   # 参考デザインに合わせた表示データ（ガチャ3種・景品ラインナップ・獲得ポイントの設定）
```

| URL | 内容 |
|---|---|
| http://localhost:3300 | サイト |
| http://localhost:3300/admin | 管理画面 |
| http://localhost:8300/api/docs | API ドキュメント（Swagger UI） |
| http://localhost:8030 | 開発用メール受信箱（Mailpit） |

| アカウント | メールアドレス | パスワード |
|---|---|---|
| 管理者 | admin@hoshifuru.example | admin12345 |
| 運営スタッフ | staff@hoshifuru.example | staff12345 |
| デモ会員（チケット30枚・12,340pt） | demo@hoshifuru.example | demo12345 |

※ テストアカウントは開発用です。本番では作成しないでください（[本番公開手順](docs/deploy.md)）。

## ドキュメント

| 文書 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 基本設計（画面構成・データベース・API・認証・抽選エンジン・セキュリティ） |
| [docs/api.md](docs/api.md) / [docs/openapi.json](docs/openapi.json) | API 仕様書 |
| [docs/setup.md](docs/setup.md) | 開発環境構築手順 |
| [docs/deploy.md](docs/deploy.md) | 本番公開手順・環境変数 |
| [docs/hosting-proposal.md](docs/hosting-proposal.md) | サーバー構成のご提案（同時接続 1,000〜2,000 人）・負荷試験の結果 |
| [docs/operations.md](docs/operations.md) | 運用・保守説明書（日次作業・障害対応・広告事業者の追加・法令確認） |
| [docs/test-report.md](docs/test-report.md) | テスト結果報告 |
| [docs/design/reference-analysis.md](docs/design/reference-analysis.md) | 参考画像（トップページ）の分析と寸法 |
| [docs/design/comparison-report-waku.md](docs/design/comparison-report-waku.md) | 現在のデザイン（わくわくガチャ）：寸法・比較結果・残っている差異・サイト全体の配色・表示速度 |
| [docs/design/comparison-report.md](docs/design/comparison-report.md) | 旧デザイン（星降る宝物殿）の比較結果 |

※ 残高は 2 つ：**チケット**（`ticket_*`。ガチャを引くときに使う）と**ポイント**（`point_*`。ガチャで当たり、交換に使う）。

## ディレクトリ構成

```
backend/
  app/
    api/            ルーター（auth・会員向け・成果通知・admin/）
    core/           設定・DB・セキュリティ・メール・ストレージ・レート制限
    models/         SQLAlchemy モデル（29 テーブル）
    services/       業務ロジック（draw_engine・tickets・exchange・offers・rewards・auth）
    providers/      広告・アンケート事業者の成果通知アダプター
    cli.py          運用コマンド（seed / create-admin / purge-pii / verify-draws）
  alembic/          マイグレーション
  tests/            自動テスト（pytest・実 PostgreSQL を使用）
frontend/
  src/app/          画面（一般公開・会員・管理者）
  src/ceremony/     ガチャ演出（3D シーン・軽量 2D 版・結果公開）
  src/components/   共通 UI・景品カード・背景の星空
  e2e/              ブラウザテスト（Playwright）
  scripts/gen-art.mjs  景品・バナーの SVG イラスト生成
  public/images/       参考画像から作成した画像素材（人物・背景・バナー・ガチャ・景品など）
tools/
  imagegen/            画像素材の生成スクリプト（OpenAI 画像編集 API。キーは .env の OPEN_API_KEY）
  compare/             参考画像とのスクリーンショット比較スクリプト
  loadtest/            負荷試験（同時会員・ラストワン競合）
references/            参考画像（現在：Colorful Fantasy Gacha Game Landing Page.png）
docker-compose.yml
.github/workflows/ci.yml
```

## テスト

```bash
cd backend && .venv/bin/pytest            # 102 件（同時アクセス・二重消費・ラストワン賞・署名検証・ポイント交換・SMS・友達紹介を含む）
cd frontend && npm test                    # 単体テスト
cd frontend && npx playwright test         # E2E（起動中の環境に対して実行）
```

## 公開前に必要な確認

チケットの有償販売の有無、景品の金銭的価値、広告報酬の仕組みによって、適用される法令や必要な表示が変わります。
本番公開前に、景品表示法・資金決済法・刑法（賭博罪）・個人情報保護法・特定商取引法・広告事業者の利用規約について、
専門家による確認を受けてください（詳細は [運用・保守説明書](docs/operations.md#法令確認チェックリスト)）。
