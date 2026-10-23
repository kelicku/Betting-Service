from app.core.config import settings
from app.core.security import hmac_hex
from app.providers.base import BaseProvider
from app.providers.hmac_generic import HmacProvider

# 開発用の模擬事業者。署名鍵はアプリの secret_key から導出し、本番では無効
MOCK_PROVIDER = "mock"


def _mock_secret() -> str:
    return hmac_hex("mock-provider-secret")


def get_provider(name: str) -> BaseProvider | None:
    if name == MOCK_PROVIDER:
        if not settings.mock_offers_allowed:
            return None
        return HmacProvider(MOCK_PROVIDER, secret=_mock_secret(), is_test=True)
    if name in PROVIDERS:
        return PROVIDERS[name]
    return None


# 実際の広告・アンケート事業者をここに登録する。
# 署名方式が汎用 HMAC と異なる場合は BaseProvider を継承した専用クラスを作成する。
PROVIDERS: dict[str, BaseProvider] = {
    # fluct（動画リワード広告・最初に導入）、skyflag（オファーウォール・ユーザー数が増えてから導入）。
    # 署名鍵は環境変数 POSTBACK_SECRET_FLUCT / POSTBACK_SECRET_SKYFLAG、送信元 IP の制限は POSTBACK_IPS_FLUCT など。
    # 成果通知の受け口：https://（ドメイン）/api/postbacks/fluct 。各社の通知の形式（パラメータ名・署名方式）が
    # 汎用 HMAC と異なる場合は、資料をもとに BaseProvider を継承した専用クラスに差し替える
    "fluct": HmacProvider("fluct"),
    "skyflag": HmacProvider("skyflag"),
    "adnetwork": HmacProvider("adnetwork"),
    "surveyhub": HmacProvider("surveyhub"),
}


def provider_names() -> list[str]:
    names = list(PROVIDERS)
    if settings.mock_offers_allowed:
        names.insert(0, MOCK_PROVIDER)
    return names


def mock_secret() -> str:
    return _mock_secret()
