"""ガチャチケット（広告視聴・案件達成などで獲得し、ガチャを引くときに消費する）の残高の唯一の更新窓口。
処理の中身は ledger.Ledger を参照。"""

from app.models import TicketTransaction, TicketWallet
from app.services.ledger import InsufficientBalance, Ledger

LEDGER = Ledger(TicketWallet, TicketTransaction, label="チケット", unit="枚", error_code="insufficient_tickets")

InsufficientTickets = InsufficientBalance
ensure_wallet = LEDGER.ensure_wallet
lock_wallet = LEDGER.lock_wallet
get_balance = LEDGER.get_balance
credit = LEDGER.credit
debit = LEDGER.debit
adjust = LEDGER.adjust
insufficient = LEDGER.insufficient
