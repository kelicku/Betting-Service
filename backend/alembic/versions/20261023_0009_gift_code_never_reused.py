"""一度渡したギフトコードは、申請が削除されて order_id が空になっても在庫に戻さない（未使用の判定に assigned_at を加える）

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-23 15:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0009'
down_revision: str | None = '0008'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index('ix_gift_codes_available', table_name='gift_codes')
    op.create_index('ix_gift_codes_available', 'gift_codes', ['item_id'], postgresql_where=sa.text('order_id is null and assigned_at is null'))


def downgrade() -> None:
    op.drop_index('ix_gift_codes_available', table_name='gift_codes')
    op.create_index('ix_gift_codes_available', 'gift_codes', ['item_id'], postgresql_where=sa.text('order_id is null'))
