"""デジタルギフトの自動発行（デジコなど）の差し込み口。

ポイント交換でデジタルギフトが選ばれたときの発行順：
1. 管理画面で登録したギフトコード在庫があれば、1 件を自動でお渡しする（services/shop）
2. 在庫がなく、自動発行が設定されていれば、ここでギフト事業者の API から発行する
3. どちらもなければ「受付」のまま残し、運営が管理画面でコードを入力してお渡しする（手動発行）

デジコの API は事業者との契約後に仕様が提供されるため、現時点では未実装（設定がなければ None を返す）。
契約後、DigicoIssuer.issue に API 呼び出しを実装し、環境変数 DIGICO_API_BASE_URL / DIGICO_API_KEY を設定する。
"""

from app.core.config import settings
from app.models import ShopItem, ShopOrder


class GiftIssuer:
    name = "none"

    async def issue(self, item: ShopItem, order: ShopOrder) -> str | None:
        """ギフトコードを発行して返す。発行できない場合は None（手動発行に回る）。"""
        return None


class DigicoIssuer(GiftIssuer):
    name = "digico"

    async def issue(self, item: ShopItem, order: ShopOrder) -> str | None:
        # 契約後に API 仕様に沿って実装する（金額 = item.face_value_yen、注文番号 = order.id で冪等に発行すること）
        return None


def get_issuer(item: ShopItem) -> GiftIssuer:
    if settings.digico_api_base_url and settings.digico_api_key and item.brand == "デジコ":
        return DigicoIssuer()
    return GiftIssuer()
