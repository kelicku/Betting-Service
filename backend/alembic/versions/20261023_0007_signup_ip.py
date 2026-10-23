"""会員登録時の IP アドレス（同じネットワークからの新規登録の上限・複数アカウントの確認用）と、
動画広告のクリックを IP で数えるための索引

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-23 09:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0007'
down_revision: str | None = '0006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('signup_ip', sa.String(length=64), nullable=True))
    op.create_index('ix_users_signup_ip_created', 'users', ['signup_ip', 'created_at'])
    op.create_index('ix_offer_clicks_ip', 'offer_clicks', ['ip'])
    op.create_index('ix_user_sessions_ip', 'user_sessions', ['ip'])


def downgrade() -> None:
    op.drop_index('ix_user_sessions_ip', table_name='user_sessions')
    op.drop_index('ix_offer_clicks_ip', table_name='offer_clicks')
    op.drop_index('ix_users_signup_ip_created', table_name='users')
    op.drop_column('users', 'signup_ip')
