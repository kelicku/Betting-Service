"""運用コマンド。

  python -m app.cli seed                 開発用の初期データを投入（冪等）
  python -m app.cli showcase             参考デザインに合わせたデモ表示データを登録（seed の後に実行・冪等）
  python -m app.cli create-admin EMAIL   管理者アカウントを作成（パスワードは対話入力または ADMIN_PASSWORD）
  python -m app.cli purge-pii            保持期間を過ぎた配送先情報を消去（cron で日次実行を推奨）
  python -m app.cli verify-draws         抽選結果の改ざん検知（HMAC 照合）
  python -m app.cli check-mail TO        メール送信の設定を確認（テストメールを送り、失敗したら原因を表示）
"""

import asyncio
import getpass
import os
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Announcement, Draw, Gacha, GachaItem, Mission, Offer, Prize, User
from app.models.enums import Role
from app.services import draw_engine, settings_store, tickets
from app.services import exchange as exchange_svc

PRIZES = [
    # (key, name, rarity, description, requires_shipping, value)
    ("stardust", "星屑の小瓶", "N", "夜空からこぼれ落ちた星屑を閉じ込めた小さなガラス瓶。", True, 300),
    ("moonleaf", "月光の栞", "N", "満月の夜にだけ淡く光る、金箔押しの栞。", True, 200),
    ("candle", "祈りのキャンドル", "N", "灯すとラベンダーと星の香りが広がる。", True, 400),
    ("feather", "天馬の羽根ペン", "N", "書いた文字がほのかにきらめく羽根ペン。", True, 500),
    ("aurora", "オーロラの水晶", "R", "内側でオーロラが揺らめく、手のひらサイズの水晶。", True, 1500),
    ("compass", "星図のコンパス", "R", "持ち主の願いの方角を指し示す真鍮のコンパス。", True, 1800),
    ("music", "銀河のオルゴール", "R", "星座をめぐる旋律を奏でる、透かし彫りのオルゴール。", True, 2500),
    ("amethyst", "紫晶の王冠", "SR", "アメジストを散りばめた、宮殿の夜会のためのティアラ。", True, 5000),
    ("hourglass", "時の砂時計", "SR", "流れ落ちる砂が星になる、魔法の砂時計。", True, 6000),
    ("crown", "星降る宝冠", "SSR", "宝物殿の最奥に眠る、千の星を戴く宝冠。", True, 9000),
    ("dragon", "暁竜の宝玉", "SSR", "夜明けの竜が守り続けた、黄金に輝く宝玉。", True, 9500),
    ("lastone_orb", "星帝の天球儀", "SSR", "ラストワン賞限定。天の運行を映す黄金の天球儀。", True, 10000),
    ("lastone_key", "宝物殿の鍵", "SSR", "ラストワン賞限定。宝物殿の扉を開くと伝わる黄金の鍵。", True, 8000),
]


async def seed() -> None:
    from app.core.config import settings

    if settings.is_production:
        sys.exit("seed: 本番環境では実行できません（テストアカウントと開発用の案件が作成されるため）")
    async with SessionLocal() as db:
        if await db.scalar(select(Gacha.id).limit(1)):
            print("seed: already seeded, skipping")
            return
        now = datetime.now(UTC)

        admin = await db.scalar(select(User).where(User.email == "admin@hoshifuru.example"))
        if admin is None:
            admin = User(email="admin@hoshifuru.example", password_hash=hash_password(os.environ.get("SEED_ADMIN_PASSWORD", "admin12345")),
                         display_name="宝物殿の管理人", role=Role.admin, email_verified_at=now)
            db.add(admin)
        staff = User(email="staff@hoshifuru.example", password_hash=hash_password("staff12345"), display_name="運営スタッフ",
                     role=Role.staff, email_verified_at=now)
        demo = User(email="demo@hoshifuru.example", password_hash=hash_password("demo12345"), display_name="星詠みの旅人",
                    email_verified_at=now)
        db.add_all([staff, demo])
        await db.flush()
        for u in (admin, staff, demo):
            await tickets.ensure_wallet(db, u.id)
        await tickets.credit(db, demo.id, 300, "admin_grant", "デモ用ポイント", dedupe_key="seed:demo")

        prizes: dict[str, Prize] = {}
        for key, name, rarity, desc, ship, value in PRIZES:
            p = Prize(name=name, rarity=rarity, description=desc, image_url=f"/art/prizes/{key}.svg",
                      requires_shipping=ship, reference_value_yen=value)
            db.add(p)
            prizes[key] = p
        await db.flush()

        # ① 確率抽選方式（常設・在庫無制限）
        g1 = Gacha(slug="starlight", title="星明かりの宝物庫", subtitle="いつでも引ける常設ガチャ",
                   description="宝物殿の入口に佇む、星明かりの宝物庫。\n確率抽選方式のため、いつでも同じ提供割合で抽選されます。",
                   ticket_cost=1, mode="probability", status="published", theme_color="#7654C8", sort_order=2,
                   banner_image_url="/art/banners/starlight.svg")
        # ② ボックス方式（在庫限り・ラストワン賞つき）
        g2 = Gacha(slug="moonlit-palace", title="月影の宮殿くじ", subtitle="全120口・ラストワン賞「星帝の天球儀」",
                   description="月影の宮殿に用意された、限られた数の宝物。\nボックス方式のため、引かれた景品は在庫から減っていきます。\n最後の1口を引いた方には、ラストワン賞「星帝の天球儀」を贈呈します。",
                   ticket_cost=3, mode="box", status="published", theme_color="#D8B976", sort_order=1,
                   last_one_prize_id=prizes["lastone_orb"].id,
                   last_one_description="最後の1口を引いた方だけが手にできる、黄金の天球儀。",
                   banner_image_url="/art/banners/moonlit.svg", ends_at=now + timedelta(days=30))
        # ③ 確率方式＋総口数上限（期間限定・ラストワン賞つき）
        g3 = Gacha(slug="aurora-festival", title="オーロラ祭の秘宝", subtitle="期間限定・総500口",
                   description="夜空にオーロラが架かる祭りの夜だけ開かれる宝物殿。\n確率抽選方式・総口数500口。最後の1口にはラストワン賞「宝物殿の鍵」。",
                   ticket_cost=2, mode="probability", status="published", theme_color="#84D8F1", sort_order=3,
                   max_pulls=500, last_one_prize_id=prizes["lastone_key"].id,
                   last_one_description="宝物殿の扉を開く、黄金の鍵。",
                   banner_image_url="/art/banners/aurora.svg", starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=14))
        db.add_all([g1, g2, g3])
        await db.flush()

        def item(g, key, weight=0, stock=None, order=0):
            return GachaItem(gacha_id=g.id, prize_id=prizes[key].id, weight=weight, stock_total=stock, stock_remaining=stock, sort_order=order)

        db.add_all([
            # 提供割合: N 79% / R 17% / SR 3.5% / SSR 0.5%
            item(g1, "stardust", 2200, order=1), item(g1, "moonleaf", 2000, order=2), item(g1, "candle", 1900, order=3), item(g1, "feather", 1800, order=4),
            item(g1, "aurora", 700, order=5), item(g1, "compass", 600, order=6), item(g1, "music", 400, order=7),
            item(g1, "amethyst", 200, order=8), item(g1, "hourglass", 150, order=9),
            item(g1, "crown", 30, order=10), item(g1, "dragon", 20, order=11),
            # ボックス 120 口
            item(g2, "stardust", stock=30, order=1), item(g2, "moonleaf", stock=30, order=2), item(g2, "candle", stock=25, order=3),
            item(g2, "aurora", stock=15, order=4), item(g2, "music", stock=10, order=5),
            item(g2, "amethyst", stock=6, order=6), item(g2, "hourglass", stock=3, order=7), item(g2, "crown", stock=1, order=8),
            # オーロラ祭
            item(g3, "stardust", 3000, order=1), item(g3, "feather", 2500, order=2), item(g3, "aurora", 2600, order=3),
            item(g3, "compass", 1200, order=4), item(g3, "hourglass", 500, order=5), item(g3, "dragon", 200, order=6),
        ])

        db.add_all([
            Offer(provider="mock", kind="ad", title="【テスト】動画広告を視聴する", description="30秒の動画広告を最後まで視聴してください。",
                  conditions="動画を最後まで再生すると成果となります。", url_template="https://example.com/ad?click={click_id}",
                  reward_tickets=2, estimated_minutes=1, per_user_limit=5, is_test=True, sort_order=1),
            Offer(provider="mock", kind="ad", title="【テスト】アプリをインストールして起動", description="対象アプリをインストールし、初回起動してください。",
                  conditions="インストール後24時間以内の初回起動が対象です。", url_template="https://example.com/app?click={click_id}",
                  reward_tickets=15, estimated_minutes=5, per_user_limit=1, is_test=True, sort_order=2),
            Offer(provider="mock", kind="survey", title="【テスト】ライフスタイルに関するアンケート", description="全10問・約3分のアンケートです。",
                  conditions="すべての設問に回答すると成果となります。", url_template="https://example.com/survey?click={click_id}",
                  reward_tickets=5, estimated_minutes=3, per_user_limit=1, is_test=True, sort_order=3),
            Offer(provider="mock", kind="survey", title="【テスト】星座と占いの意識調査", description="全20問・約8分のアンケートです。",
                  conditions="回答内容に不備がある場合は対象外となります。", url_template="https://example.com/survey2?click={click_id}",
                  reward_tickets=10, estimated_minutes=8, per_user_limit=1, is_test=True, sort_order=4),
        ])
        db.add_all([
            Mission(code="first-step", kind="achievement", title="はじめての一歩", description="メールアドレスの確認を完了する",
                    reward_tickets=3, condition_type="email_verified"),
            Mission(code="draw-10", kind="achievement", title="星を数える者", description="累計10回ガチャを引く",
                    reward_tickets=5, condition_type="total_draws", condition_value=10),
            Mission(code="draw-100", kind="achievement", title="宝物殿の常連", description="累計100回ガチャを引く",
                    reward_tickets=20, condition_type="total_draws", condition_value=100),
            Mission(code="login-7", kind="achievement", title="七つの夜", description="ログインボーナスを7日分受け取る",
                    reward_tickets=7, condition_type="login_days", condition_value=7),
            Mission(code="autumn-2026", kind="campaign", title="秋の星祭りキャンペーン", description="期間中に参加ボタンを押すだけでポイントをプレゼント",
                    reward_tickets=5, condition_type="none", ends_at=now + timedelta(days=30)),
        ])
        db.add_all([
            Announcement(title="わくわくガチャ、開殿いたしました", category="important", is_published=True, published_at=now - timedelta(hours=2),
                         body="ようこそ、わくわくガチャへ。\n新規登録とメールアドレスの確認で、ポイントをお贈りしています。"),
            Announcement(title="「月影の宮殿くじ」開催中", category="campaign", is_published=True, published_at=now - timedelta(hours=1),
                         body="全120口のボックスくじを開催中です。最後の1口を引いた方にはラストワン賞「星帝の天球儀」を贈呈します。"),
        ])
        await db.commit()
        print("seed: done (admin@hoshifuru.example / admin12345, staff@hoshifuru.example / staff12345, demo@hoshifuru.example / demo12345)")


SHOWCASE_PRIZES = {
    # key: (name, subtitle, rarity, image, featured_order, description, requires_shipping)
    # 画像は汎用のイラスト（各社のロゴ・商品画像は許諾を得てから管理画面で差し替える）
    "console": ("Nintendo Switch", "（有機ELモデル）", "SSR", "/images/waku/prize-console.webp", 1, "人気の家庭用ゲーム機。", True),
    "phone": ("iPhone 15", "（128GB）", "SSR", "/images/waku/prize-phone.webp", 2, "最新のスマートフォン。", True),
    "amazon": ("Amazonギフトカード", "5,000円分", "SR", "/images/waku/card-navy.webp", 3, "ギフトコードをメールでお届けします。", False),
    "apple": ("Apple Gift Card", "5,000円分", "SR", "/images/waku/card-blue.webp", 4, "ギフトコードをメールでお届けします。", False),
    "googleplay": ("Google Playギフトコード", "5,000円分", "SR", "/images/waku/card-green.webp", 5, "ギフトコードをメールでお届けします。", False),
    "digico": ("デジコ", "5,000円分", "SR", "/images/waku/card-coin.webp", 6, "ギフトコードをメールでお届けします。", False),
}

# ポイント景品（当選するとポイント残高に加算される）：pt 数、レアリティ、画像
POINT_PRIZES = {100: "N", 500: "R", 1000: "SR", 10000: "SSR"}

SHOWCASE_GACHAS = [
    # slug, title, badge, チケット枚数/回（お客さまの方針：1 回 1 枚）, image, items[(prize_key, stock)], last_one_key, subtitle
    # prize_key：景品キー、または "pt:100" のようなポイント景品
    ("premium", "プレミアムガチャ", "豪華景品が当たる！", 1, "/images/waku/gacha-premium.webp",
     [("console", 2), ("phone", 2), ("amazon", 16), ("pt:10000", 10), ("pt:1000", 120), ("pt:500", 350), ("pt:100", 500)], "console", "ゲーム好き必見！"),
    ("digital-gift", "デジタルギフトガチャ", "人気No.1", 1, "/images/waku/gacha-digital.webp",
     [("amazon", 10), ("apple", 10), ("googleplay", 10), ("digico", 20), ("pt:1000", 50), ("pt:500", 150), ("pt:100", 250)], "pt:10000", "人気のデジタルギフトが当たる"),
    ("special", "スペシャルガチャ", "ラストワン賞あり！", 1, "/images/waku/gacha-special.webp",
     [("phone", 1), ("amazon", 9), ("digico", 20), ("pt:10000", 5), ("pt:1000", 45), ("pt:500", 120)], "svg:lastone_orb", "最後の1口には特別な景品"),
]
# 旧デザイン（星降る宝物殿）のデモ用ガチャ。新デザインでは公開を終了する
OLD_SHOWCASE_SLUGS = ("aurora-prayer", "starfall-accessory", "premium-figure", "legendary-chest", "starlight", "moonlit-palace", "aurora-festival")
# 獲得できるチケット・ポイント（クライアントの例：動画 1 回 3 枚、アプリ導入 50 枚）。数値は確定まで仮
REWARD_SETTINGS = {
    "signup_bonus_tickets": 10, "signup_bonus_points": 1000, "daily_login_tickets": 1, "daily_login_streak7_bonus": 3,
    "video_daily_limit": 5, "referral_inviter_tickets": 10, "referral_invitee_tickets": 5,
}
# ポイント交換の景品（10pt = 1 円で仮置き）：name, brand, kind, pt, 額面, image, 在庫, 1人上限
SHOP_ITEMS = [
    ("デジコ 500円分", "デジコ", "digital_code", 5000, 500, "/images/waku/card-coin.webp", None, None),
    ("デジコ 1,000円分", "デジコ", "digital_code", 10000, 1000, "/images/waku/card-coin.webp", None, None),
    ("Amazonギフトカード 1,000円分", "Amazon", "digital_code", 10000, 1000, "/images/waku/card-navy.webp", None, None),
    ("Apple Gift Card 1,000円分", "Apple", "digital_code", 10000, 1000, "/images/waku/card-blue.webp", None, None),
    ("Google Play ギフトコード 1,000円分", "Google Play", "digital_code", 10000, 1000, "/images/waku/card-green.webp", None, None),
    ("Nintendo Switch（有機ELモデル）", "", "shipping", 400000, 37980, "/images/waku/prize-console.webp", 3, 1),
]
DEMO_TICKETS = 30
DEMO_POINTS = 12340


async def showcase() -> None:
    """参考デザイン（わくわくガチャ）とクライアントの仕様（チケットとポイントの 2 つの残高）に合わせた
    デモ用の表示データを登録する。何度実行しても重複しない。本番では実行できない。"""
    from app.core.config import settings
    from app.models import ShopItem
    from app.models.enums import PointKind
    from app.services import points, sms
    from app.services import shop as shop_svc

    if settings.is_production:
        sys.exit("showcase: 本番環境では実行できません")
    async with SessionLocal() as db:
        now = datetime.now(UTC)
        admin = await db.scalar(select(User).where(User.role == Role.admin).order_by(User.id))
        if admin is None:
            raise SystemExit("showcase: 先に seed を実行してください（管理者がいません）")

        # 旧デザインの注目の景品は外す
        for p in (await db.execute(select(Prize).where(Prize.is_featured.is_(True)))).scalars():
            p.is_featured = False
        prizes: dict[str, Prize] = {}
        for key, (name, sub, rarity, image, order, desc, ship) in SHOWCASE_PRIZES.items():
            p = await db.scalar(select(Prize).where(Prize.image_url == image))
            if p is None:
                p = Prize(name=name, rarity=rarity, image_url=image)
                db.add(p)
            p.name, p.subtitle, p.rarity, p.description, p.requires_shipping = name, sub, rarity, desc, ship
            p.is_featured, p.featured_order = True, order
            prizes[key] = p
        for value, rarity in POINT_PRIZES.items():
            image = f"/art/points/{value}.svg"
            p = await db.scalar(select(Prize).where(Prize.image_url == image))
            if p is None:
                p = Prize(name=f"{value:,}ポイント", rarity=rarity, image_url=image)
                db.add(p)
            p.name, p.rarity, p.point_value, p.requires_shipping, p.is_exchangeable = f"{value:,}ポイント", rarity, value, False, False
            p.description = "当選するとポイント残高に自動で加算されます。貯めたポイントは景品やデジタルギフトと交換できます。"
            prizes[f"pt:{value}"] = p
        await db.flush()

        async def prize_for(key: str) -> Prize:
            if key in prizes:
                return prizes[key]
            p = await db.scalar(select(Prize).where(Prize.image_url == f"/art/prizes/{key[4:]}.svg"))
            if p is None:
                raise SystemExit(f"showcase: 先に seed を実行してください（{key} がありません）")
            return p

        for slug in OLD_SHOWCASE_SLUGS:
            old = await db.scalar(select(Gacha).where(Gacha.slug == slug))
            if old:
                old.status = "archived"
        for i, (slug, title, badge, cost, image, items, lo_key, sub) in enumerate(SHOWCASE_GACHAS):
            g = await db.scalar(select(Gacha).where(Gacha.slug == slug))
            if g is None:
                g = Gacha(slug=slug, title=title, ticket_cost=cost, mode="box", status="published")
                db.add(g)
                await db.flush()
            existing = {it.prize_id: it for it in (await db.execute(select(GachaItem).where(GachaItem.gacha_id == g.id))).scalars()}
            wanted = {}
            for j, (k, stock) in enumerate(items):
                pr = await prize_for(k)
                wanted[pr.id] = (stock, j)
            # 以前の「つなぎ」の景品（ポイント景品に置き換えたもの）は在庫 0・非公開にする（抽選履歴は残す）
            for pid, it in existing.items():
                if pid not in wanted:
                    it.is_active = False
                    it.stock_remaining = 0 if it.stock_remaining is not None else None
            for pid, (stock, j) in wanted.items():
                it = existing.get(pid)
                if it is None:
                    db.add(GachaItem(gacha_id=g.id, prize_id=pid, stock_total=stock, stock_remaining=stock, sort_order=j))
                else:
                    it.is_active, it.sort_order = True, j
            g.title, g.badge, g.banner_image_url, g.subtitle, g.sort_order, g.ticket_cost = title, badge, image, sub, i, cost
            g.description = f"{sub}。1回 チケット{cost}枚。在庫数に基づく抽選方式（全{sum(s for _, s in items):,}口）。ポイントが当たると、ポイント残高に自動で加算されます。"
            g.ends_at = g.ends_at or now + timedelta(days=45)
            # すべてのガチャにラストワン賞を設定する（管理画面の「ラストワン賞」から差し替え可能）
            lo = await prize_for(lo_key)
            g.last_one_prize_id = lo.id
            g.last_one_description = "最後の1口を引いた方だけがもらえる特別な景品。"

        await settings_store.set_many(db, REWARD_SETTINGS, actor_id=admin.id)
        # 一時的に 100 倍にしていた獲得チケットを元に戻す（以前の showcase の実行分）
        for model in (Offer, Mission):
            for o in (await db.execute(select(model).where(model.reward_tickets >= 100))).scalars():
                if o.reward_tickets % 100 == 0:
                    o.reward_tickets //= 100
        # 動画広告の案件は「動画リワード広告」（1 日の上限あり）にし、何度でも視聴できるようにする
        for o in (await db.execute(select(Offer).where(Offer.title.contains("動画")))).scalars():
            o.kind, o.reward_tickets, o.per_user_limit = "video", 3, 1000

        # ポイント交換の景品と、開発用のテストコード（デジコ 500円分のみ。本物のコードではない）
        for j, (name, brand, kind, cost, face, image, stock, limit) in enumerate(SHOP_ITEMS):
            item = await db.scalar(select(ShopItem).where(ShopItem.name == name))
            if item is None:
                item = ShopItem(name=name, brand=brand, kind=kind, point_cost=cost, stock_total=stock, stock_remaining=stock)
                db.add(item)
            item.brand, item.kind, item.point_cost, item.face_value_yen, item.image_url = brand, kind, cost, face, image
            item.per_user_limit, item.sort_order, item.is_active = limit, j, True
            item.description = ("ギフトコードをこの画面とメールでお届けします。" if kind == "digital_code" else "ご指定の住所へ発送します。")
        await db.flush()
        digico = await db.scalar(select(ShopItem).where(ShopItem.name == SHOP_ITEMS[0][0]))
        if not (await shop_svc.available_codes(db, [digico.id])).get(digico.id):
            await shop_svc.add_codes(db, digico.id, [f"TEST-DGC-{n:04d}-NOTREAL" for n in range(1, 21)], None, admin)

        # 旧デザイン（星降る宝物殿・チケット）の文言が残るお知らせは非公開にし、新しいお知らせを用意する
        old_words = ("星降る", "宝物殿", "月影", "星座の導き", "チケット")
        for a in (await db.execute(select(Announcement).where(Announcement.is_published.is_(True)))).scalars():
            if any(w in a.title or w in (a.body or "") for w in old_words):
                a.is_published = False
        news = [
            ("info", "わくわくガチャをオープンしました！", "遊んで貯めて、好きなギフトに交換！ガチャで人気のデジタルギフトや豪華景品が当たります。", 6),
            ("new_gacha", "「デジタルギフトガチャ」が登場しました", "人気のデジタルギフトが当たるガチャです。1回200ptで引けます。", 3),
            ("campaign", "新規会員登録で1,000ptプレゼント！", "メールアドレスの確認が完了すると、1,000ptをお贈りします。", 1),
            ("maintenance", "システムメンテナンスのお知らせ", "サービス向上のため、メンテナンスを実施する場合があります。日時は決まり次第お知らせします。", 0),
        ]
        for cat, title, body, days in news:
            a = await db.scalar(select(Announcement).where(Announcement.title == title))
            if a is None:
                db.add(Announcement(title=title, body=body, category=cat, is_published=True, published_at=now - timedelta(days=days)))

        # デモ会員：チケットとポイントの残高を参考デザインの表示（12,340pt）に合わせ、電話番号を確認済みにする（開発用）
        demo = await db.scalar(select(User).where(User.email == "demo@hoshifuru.example"))
        if demo:
            bal = await tickets.get_balance(db, demo.id)
            if bal > 1000:  # 以前の showcase で増やしたチケットを、チケットの単位に合わせて戻す
                await tickets.adjust(db, demo.id, DEMO_TICKETS - bal, "admin_adjust", "デモ用チケットの調整", actor_id=admin.id)
            elif bal < DEMO_TICKETS:
                await tickets.credit(db, demo.id, DEMO_TICKETS - bal, "admin_grant", "デモ用チケット", actor_id=admin.id)
            pbal = await points.get_balance(db, demo.id)
            if pbal < DEMO_POINTS:
                await points.credit(db, demo.id, DEMO_POINTS - pbal, PointKind.admin_grant, "デモ用ポイント", actor_id=admin.id)
            if demo.phone_verified_at is None:
                demo.phone_hash, demo.phone_last4, demo.phone_verified_at = sms.phone_hash("+819000000000"), "0000", now
        await db.commit()
        print("showcase: done")


async def create_admin(email: str) -> None:
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("パスワード: ")
    from app.services.auth import validate_password

    validate_password(password)
    async with SessionLocal() as db:
        u = await db.scalar(select(User).where(User.email == email.lower()))
        if u:
            u.role = Role.admin
            u.password_hash = hash_password(password)
        else:
            u = User(email=email.lower(), password_hash=hash_password(password), display_name="管理者", role=Role.admin,
                     email_verified_at=datetime.now(UTC))
            db.add(u)
            await db.flush()
            await tickets.ensure_wallet(db, u.id)
        await db.commit()
        print(f"admin ready: {email}")


async def purge_pii() -> None:
    async with SessionLocal() as db:
        print(f"purged: {await exchange_svc.purge_expired_pii(db)}")


async def verify_draws() -> None:
    bad = 0
    async with SessionLocal() as db:
        draws = (await db.execute(select(Draw).options(selectinload(Draw.results)))).scalars()
        n = 0
        for d in draws:
            n += 1
            if not draw_engine.verify_digest(d, d.results):
                bad += 1
                print(f"TAMPERED: draw {d.id}")
    print(f"checked {n} draws, {bad} mismatches")
    if bad:
        sys.exit(1)


async def check_mail(to: str) -> None:
    """メール送信の設定を確認する（テストメールを送り、失敗したら原因を表示する）。"""
    from app.core import mail
    from app.core.config import settings

    print(f"送信方法: {settings.mail_backend} / SMTP: {settings.smtp_host}:{settings.smtp_port} / 送信元: {settings.mail_from}")
    if settings.mail_backend != "smtp" or settings.smtp_host in ("mailpit", "localhost"):
        print("※ テスト用の受信箱（Mailpit）に送る設定です。実際のメールアドレスには届きません（backend/.env.mail.example を参照）")
    try:
        await mail.send_mail(to, f"【{settings.app_name}】メール送信のテスト", "このメールが届いていれば、メール送信の設定は正しく動いています。", raise_errors=True)
    except Exception as e:  # 認証失敗・接続できない等の原因をそのまま表示
        sys.exit(f"送信に失敗しました: {type(e).__name__}: {e}")
    print(f"送信しました: {to}（迷惑メールフォルダも確認してください）")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "seed":
        asyncio.run(seed())
    elif cmd == "create-admin" and len(sys.argv) > 2:
        asyncio.run(create_admin(sys.argv[2]))
    elif cmd == "check-mail" and len(sys.argv) > 2:
        asyncio.run(check_mail(sys.argv[2]))
    elif cmd == "showcase":
        asyncio.run(showcase())
    elif cmd == "purge-pii":
        asyncio.run(purge_pii())
    elif cmd == "verify-draws":
        asyncio.run(verify_draws())
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
