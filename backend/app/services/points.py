"""ポイント（ガチャの当選などで獲得し、景品・デジタルギフトとの交換に使う）の残高の唯一の更新窓口。
チケットとは別の残高。処理の中身は ledger.Ledger を参照。"""

from app.models import PointTransaction, PointWallet
from app.services.ledger import Ledger

LEDGER = Ledger(PointWallet, PointTransaction, label="ポイント", unit="pt", error_code="insufficient_points")

ensure_wallet = LEDGER.ensure_wallet
lock_wallet = LEDGER.lock_wallet
get_balance = LEDGER.get_balance
credit = LEDGER.credit
debit = LEDGER.debit
adjust = LEDGER.adjust
