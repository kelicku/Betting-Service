"""お試しアカウントのメールアドレスのドメインを新しいサイト名に合わせる（guest.hoshifuru.invalid → guest.wakuwaku.invalid）

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-23 12:00:00
"""
from collections.abc import Sequence

from alembic import op


revision: str = '0008'
down_revision: str | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE users SET email = replace(email, '@guest.hoshifuru.invalid', '@guest.wakuwaku.invalid') WHERE email LIKE '%@guest.hoshifuru.invalid'")


def downgrade() -> None:
    op.execute("UPDATE users SET email = replace(email, '@guest.wakuwaku.invalid', '@guest.hoshifuru.invalid') WHERE email LIKE '%@guest.wakuwaku.invalid'")
