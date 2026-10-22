"""ポイント交換（貯めたポイントで景品・デジタルギフトと交換）。

- 申請時にポイントを消費し、在庫を減らす（景品の行をロックして直列化。在庫は CHECK 制約で 0 未満にならない）
- 同じ申請の二重送信は idempotency_key（利用者ごとに一意）で 1 件にまとめる
- デジタルギフト：ギフトコード在庫があれば即時にお渡し（SKIP LOCKED で同時申請でも 1 コード 1 申請）。
  なければ自動発行（gift_issuer）、それもなければ運営が手動でコードを入力する
- 物の景品：配送先を暗号化して保存し、運営が発送して追跡番号を登録する
- 取消（受付中のみ）：ポイントを返還し、在庫を戻す
- 行ロックの順番は常に「景品 → ポイント残高」（デッドロック防止）
"""

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import mail
from app.core.config import settings
from app.core.errors import AppError, NotFound
from app.core.security import decrypt_pii, encrypt_pii
from app.models import GiftCode, Notification, ShippingAddress, ShopItem, ShopOrder, User
from app.models.enums import SHOP_ORDER_TRANSITIONS, PointKind, ShopItemKind, ShopOrderStatus
from app.services import gift_issuer, points
from app.services.exchange import SHIPPING_FIELDS, load_shipping, mask_name

STATUS_LABELS = {
    ShopOrderStatus.pending: "受付",
    ShopOrderStatus.fulfilled: "お渡し済み",
    ShopOrderStatus.shipped: "発送済み",
    ShopOrderStatus.cancelled: "取消",
}


def now() -> datetime:
    return datetime.now(UTC)


def code_hash(code: str) -> str:
    return hmac.new(settings.secret_key.encode(), f"gift:{code.strip()}".encode(), hashlib.sha256).hexdigest()


async def available_codes(db: AsyncSession, item_ids: list[int]) -> dict[int, int]:
    if not item_ids:
        return {}
    rows = await db.execute(
        select(GiftCode.item_id, func.count()).where(GiftCode.item_id.in_(item_ids), GiftCode.order_id.is_(None)).group_by(GiftCode.item_id)
    )
    return {i: n for i, n in rows.all()}


async def user_order_count(db: AsyncSession, user_id: int, item_id: int) -> int:
    return await db.scalar(
        select(func.count()).select_from(ShopOrder).where(
            ShopOrder.user_id == user_id, ShopOrder.item_id == item_id, ShopOrder.status != ShopOrderStatus.cancelled
        )
    ) or 0


async def list_items(db: AsyncSession, user: User | None) -> list[dict]:
    items = (await db.execute(
        select(ShopItem).where(ShopItem.is_active.is_(True)).order_by(ShopItem.sort_order, ShopItem.point_cost, ShopItem.id)
    )).scalars().all()
    codes = await available_codes(db, [i.id for i in items if i.kind == ShopItemKind.digital_code])
    out = []
    for i in items:
        ordered = await user_order_count(db, user.id, i.id) if user else 0
        out.append({
            "id": i.id, "name": i.name, "brand": i.brand, "description": i.description, "image_url": i.image_url,
            "kind": i.kind, "point_cost": i.point_cost, "face_value_yen": i.face_value_yen,
            "stock_remaining": i.stock_remaining, "sold_out": i.stock_remaining == 0,
            "instant": i.kind == ShopItemKind.digital_code and codes.get(i.id, 0) > 0,
            "per_user_limit": i.per_user_limit, "ordered_count": ordered,
            "limit_reached": i.per_user_limit is not None and ordered >= i.per_user_limit,
        })
    return out


async def _assign_code(db: AsyncSession, item: ShopItem, order: ShopOrder) -> GiftCode | None:
    code = (await db.execute(
        select(GiftCode).where(GiftCode.item_id == item.id, GiftCode.order_id.is_(None))
        .order_by(GiftCode.id).limit(1).with_for_update(skip_locked=True)
    )).scalar_one_or_none()
    if code is None:
        issued = await gift_issuer.get_issuer(item).issue(item, order)
        if not issued:
            return None
        code = GiftCode(item_id=item.id, code_encrypted=encrypt_pii(issued), code_hash=code_hash(issued))
        db.add(code)
    code.order_id = order.id
    code.assigned_at = now()
    order.status = ShopOrderStatus.fulfilled
    order.fulfilled_at = now()
    await db.flush()
    return code


def _fulfilled_notice(order: ShopOrder) -> Notification:
    return Notification(user_id=order.user_id, kind="shop", title="ギフトコードをお渡ししました",
                        body=f"「{order.item_name}」のギフトコードをお渡ししました。ポイント交換の履歴からご確認ください。",
                        link="/shop/orders")


async def place_order(
    db: AsyncSession, user: User, item_id: int, idempotency_key: str, shipping: dict | None = None, save_address: bool = False
) -> ShopOrder:
    existing = await db.scalar(select(ShopOrder).where(ShopOrder.user_id == user.id, ShopOrder.idempotency_key == idempotency_key))
    if existing:
        return existing
    item = (await db.execute(select(ShopItem).where(ShopItem.id == item_id).with_for_update())).scalar_one_or_none()
    if item is None or not item.is_active:
        raise NotFound("この景品は現在交換できません。")
    if item.stock_remaining is not None and item.stock_remaining <= 0:
        raise AppError("sold_out", "この景品は在庫切れです。", 409)
    if item.per_user_limit is not None and await user_order_count(db, user.id, item.id) >= item.per_user_limit:
        raise AppError("shop_limit", f"この景品はお一人さま {item.per_user_limit} 回までです。", 409)

    encrypted = masked = None
    if item.kind == ShopItemKind.shipping:
        if not shipping:
            raise AppError("shipping_required", "配送先を入力してください。")
        clean = {k: (shipping.get(k) or "").strip() for k in SHIPPING_FIELDS}
        encrypted = encrypt_pii(json.dumps(clean, ensure_ascii=False))
        masked = mask_name(clean["name"])
        if save_address:
            row = await db.get(ShippingAddress, user.id)
            if row:
                row.encrypted = encrypted
            else:
                db.add(ShippingAddress(user_id=user.id, encrypted=encrypted))

    order = ShopOrder(
        id=uuid.uuid4(), user_id=user.id, item_id=item.id, item_name=item.name, kind=item.kind,
        point_cost=item.point_cost, status=ShopOrderStatus.pending, idempotency_key=idempotency_key,
        shipping_encrypted=encrypted, recipient_masked=masked,
    )
    db.add(order)
    try:
        await db.flush()
    except IntegrityError:
        # 同じ申請が同時に届いた（一意制約）。先に保存された申請を返す
        await db.rollback()
        dup = await db.scalar(select(ShopOrder).where(ShopOrder.user_id == user.id, ShopOrder.idempotency_key == idempotency_key))
        if dup:
            return dup
        raise
    await points.debit(db, user.id, item.point_cost, PointKind.shop_exchange, f"ポイント交換：{item.name}",
                       dedupe_key=f"shop:{order.id}", ref_type="shop_order", ref_id=str(order.id))
    if item.stock_remaining is not None:
        item.stock_remaining -= 1

    fulfilled = False
    if item.kind == ShopItemKind.digital_code:
        fulfilled = await _assign_code(db, item, order) is not None
    if fulfilled:
        db.add(_fulfilled_notice(order))
    else:
        db.add(Notification(user_id=user.id, kind="shop", title="ポイント交換を受け付けました",
                            body=f"「{item.name}」の交換を受け付けました。" + ("発送までしばらくお待ちください。" if item.kind == ShopItemKind.shipping else "ギフトコードのご用意ができ次第お知らせします。"),
                            link="/shop/orders"))
    await db.commit()
    if fulfilled:
        await mail.send_mail(user.email, f"【{settings.app_name}】ギフトコードをお渡ししました",
                             f"{user.display_name} さま\n\n「{item.name}」のギフトコードをお渡ししました。\n"
                             f"{settings.public_base_url}/shop/orders からご確認ください。\n")
    return order


async def load_order(db: AsyncSession, order_id: uuid.UUID, user_id: int | None = None) -> ShopOrder:
    q = select(ShopOrder).options(selectinload(ShopOrder.gift_code), selectinload(ShopOrder.item)).where(ShopOrder.id == order_id)
    if user_id is not None:
        q = q.where(ShopOrder.user_id == user_id)
    order = (await db.execute(q)).scalar_one_or_none()
    if order is None:
        raise NotFound("交換申請が見つかりません。")
    return order


def order_out(o: ShopOrder, *, reveal_code: bool) -> dict:
    code = None
    if reveal_code and o.gift_code is not None:
        code = decrypt_pii(o.gift_code.code_encrypted)
    return {
        "id": str(o.id), "item_id": o.item_id, "item_name": o.item_name, "kind": o.kind, "point_cost": o.point_cost,
        "status": o.status, "status_label": STATUS_LABELS[o.status],
        "image_url": o.item.image_url if o.item else None,
        "gift_code": code, "gift_code_expires_on": o.gift_code.expires_on if o.gift_code else None,
        "recipient_masked": o.recipient_masked, "carrier": o.carrier, "tracking_number": o.tracking_number,
        "admin_note": o.admin_note if o.status == ShopOrderStatus.cancelled else None,
        "created_at": o.created_at, "fulfilled_at": o.fulfilled_at,
    }


async def _refund(db: AsyncSession, order: ShopOrder, reason: str) -> None:
    # ロックの順番は申請時と同じ「景品 → ポイント残高」にそろえる（逆順だと同時処理でデッドロックになる）
    item = (await db.execute(select(ShopItem).where(ShopItem.id == order.item_id).with_for_update())).scalar_one()
    await points.credit(db, order.user_id, order.point_cost, PointKind.refund, f"ポイント交換の取消：{order.item_name}（{reason}）",
                        dedupe_key=f"shop-refund:{order.id}", ref_type="shop_order", ref_id=str(order.id))
    if item.stock_remaining is not None:
        item.stock_remaining += 1


async def cancel_by_user(db: AsyncSession, user: User, order_id: uuid.UUID) -> ShopOrder:
    order = (await db.execute(select(ShopOrder).where(ShopOrder.id == order_id, ShopOrder.user_id == user.id).with_for_update())).scalar_one_or_none()
    if order is None:
        raise NotFound("交換申請が見つかりません。")
    if order.status != ShopOrderStatus.pending:
        raise AppError("not_cancellable", "この申請は取り消せません。")
    order.status = ShopOrderStatus.cancelled
    await _refund(db, order, "お客さまによる取消")
    await db.commit()
    return await load_order(db, order.id, user.id)


async def admin_transition(
    db: AsyncSession, order_id: uuid.UUID, to: str, admin: User, *, code: str | None = None, expires_on: str | None = None,
    carrier: str | None = None, tracking_number: str | None = None, note: str | None = None,
) -> ShopOrder:
    order = (await db.execute(select(ShopOrder).where(ShopOrder.id == order_id).with_for_update())).scalar_one_or_none()
    if order is None:
        raise NotFound("交換申請が見つかりません。")
    target = ShopOrderStatus(to)
    if target not in SHOP_ORDER_TRANSITIONS[ShopOrderStatus(order.status)]:
        raise AppError("invalid_transition", f"「{STATUS_LABELS[order.status]}」から「{STATUS_LABELS[target]}」には変更できません。")
    order.handled_by = admin.id
    user = await db.get(User, order.user_id)
    if target == ShopOrderStatus.fulfilled:
        if order.kind != ShopItemKind.digital_code or not code or not code.strip():
            raise AppError("code_required", "お渡しするギフトコードを入力してください。")
        gc = GiftCode(item_id=order.item_id, code_encrypted=encrypt_pii(code.strip()), code_hash=code_hash(code), order_id=order.id,
                      expires_on=expires_on, created_by=admin.id, assigned_at=now())
        db.add(gc)
        try:
            await db.flush()
        except IntegrityError as e:
            await db.rollback()
            raise AppError("duplicate_code", "このギフトコードは既に登録されています。") from e
        order.status = target
        order.fulfilled_at = now()
        db.add(_fulfilled_notice(order))
    elif target == ShopOrderStatus.shipped:
        if order.kind != ShopItemKind.shipping:
            raise AppError("invalid_transition", "デジタルギフトは「お渡し済み」にしてください。")
        order.status = target
        order.carrier = (carrier or "").strip() or None
        order.tracking_number = (tracking_number or "").strip() or None
        order.fulfilled_at = now()
        db.add(Notification(user_id=order.user_id, kind="shop", title="景品を発送しました",
                            body=f"「{order.item_name}」を発送しました。" + (f"（{order.carrier} {order.tracking_number}）" if order.tracking_number else ""),
                            link="/shop/orders"))
    else:  # 取消
        order.status = target
        order.admin_note = (note or "").strip()[:500] or None
        await _refund(db, order, "運営による取消")
        db.add(Notification(user_id=order.user_id, kind="shop", title="ポイント交換が取り消されました",
                            body=f"「{order.item_name}」の交換を取り消し、{order.point_cost:,}ptを返還しました。" + (f"（{order.admin_note}）" if order.admin_note else ""),
                            link="/shop/orders"))
    await db.commit()
    if user and target in (ShopOrderStatus.fulfilled, ShopOrderStatus.shipped):
        subject = "ギフトコードをお渡ししました" if target == ShopOrderStatus.fulfilled else "景品を発送しました"
        await mail.send_mail(user.email, f"【{settings.app_name}】{subject}",
                             f"{user.display_name} さま\n\n「{order.item_name}」について：{subject}。\n{settings.public_base_url}/shop/orders からご確認ください。\n")
    return await load_order(db, order.id)


async def add_codes(db: AsyncSession, item_id: int, codes: list[str], expires_on: str | None, admin: User) -> dict:
    """ギフトコードをまとめて登録する（重複・空行は除外）。"""
    item = await db.get(ShopItem, item_id)
    if item is None or item.kind != ShopItemKind.digital_code:
        raise AppError("invalid_item", "デジタルギフトの景品を選んでください。")
    seen: set[str] = set()
    added = skipped = 0
    for raw in codes:
        c = raw.strip()
        if not c or c in seen:
            continue
        seen.add(c)
        h = code_hash(c)
        if await db.scalar(select(GiftCode.id).where(GiftCode.code_hash == h)):
            skipped += 1
            continue
        db.add(GiftCode(item_id=item.id, code_encrypted=encrypt_pii(c), code_hash=h, expires_on=expires_on, created_by=admin.id))
        added += 1
    await db.flush()
    # 在庫待ちの申請があれば、登録したコードを古い順にお渡しする
    waiting = (await db.execute(
        select(ShopOrder).where(ShopOrder.item_id == item.id, ShopOrder.status == ShopOrderStatus.pending)
        .order_by(ShopOrder.created_at).with_for_update(skip_locked=True)
    )).scalars().all()
    delivered = 0
    for order in waiting:
        if await _assign_code(db, item, order) is None:
            break
        db.add(_fulfilled_notice(order))
        delivered += 1
    await db.commit()
    return {"added": added, "skipped_duplicates": skipped, "delivered_to_waiting": delivered}


def shipping_of(order: ShopOrder) -> dict | None:
    return load_shipping(order.shipping_encrypted)
