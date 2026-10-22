"""広告・アンケート事業者の成果通知（ポストバック）アダプター。

新しい事業者を追加する手順:
  1. このパッケージに BaseProvider のサブクラスを作成し parse() を実装する
     （署名検証の方式は事業者の仕様に合わせる）
  2. registry.py の PROVIDERS に登録する
  3. 環境変数 POSTBACK_SECRET_<NAME>（必要なら POSTBACK_IPS_<NAME>）を設定する
  4. 事業者の管理画面に成果通知 URL https://<ドメイン>/api/postbacks/<name> を登録する
"""

from dataclasses import dataclass, field
from typing import Literal


class PostbackRejected(Exception):
    def __init__(self, outcome: str, detail: str = "", http_status: int = 400):
        self.outcome = outcome
        self.detail = detail
        self.http_status = http_status
        super().__init__(detail or outcome)


@dataclass
class PostbackData:
    conversion_id: str  # 事業者側の成果 ID（重複判定に使用）
    click_id: str  # こちらが発行した click_id
    status: Literal["approved", "rejected", "pending"]
    payout: str | None = None
    raw: dict = field(default_factory=dict)


class BaseProvider:
    name: str = ""
    # True の場合、成果は開発用の仮データとして扱われる（本番の成果と区別）
    is_test: bool = False

    def parse(self, params: dict[str, str], headers: dict[str, str], ip: str | None) -> PostbackData:
        raise NotImplementedError
