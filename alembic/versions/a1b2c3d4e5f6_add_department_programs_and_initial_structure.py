"""add department programs and institution initial academic structure

Revision ID: a1b2c3d4e5f6
Revises: 9f8e7d6c5b4a
Create Date: 2026-11-19 23:24:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "9f8e7d6c5b4a"
branch_labels = None
depends_on = None


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if table_name not in inspector.get_table_names():
        return False
    return column_name in {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not _has_column(inspector, "departments", "programs"):
        op.add_column("departments", sa.Column("programs", sa.Text(), nullable=True))
    if not _has_column(inspector, "institutions", "initial_structure_json"):
        op.add_column("institutions", sa.Column("initial_structure_json", sa.Text(), nullable=True))


def downgrade() -> None:
    pass
