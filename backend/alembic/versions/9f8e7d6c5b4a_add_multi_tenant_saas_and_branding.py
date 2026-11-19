"""add multi-tenant SaaS institution onboarding, branding, and tenant scoping

Revision ID: 9f8e7d6c5b4a
Revises: 170ae67b2b24
Create Date: 2026-11-19 22:30:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "9f8e7d6c5b4a"
down_revision = "170ae67b2b24"
branch_labels = None
depends_on = None


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if table_name not in inspector.get_table_names():
        return False
    return column_name in {c["name"] for c in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    # 1. Extend institutions table with multi-tenant SaaS & branding columns
    if "institutions" in tables:
        inst_cols = [
            ("short_name", sa.String(100), True, None),
            ("slug", sa.String(100), True, None),
            ("custom_domain", sa.String(255), True, None),
            ("status", sa.String(32), False, "approved"),
            ("is_active", sa.Boolean(), False, sa.true()),
            ("contact_name", sa.String(255), True, None),
            ("contact_email", sa.String(255), True, None),
            ("contact_phone", sa.String(64), True, None),
            ("website", sa.String(255), True, None),
            ("address", sa.String(500), True, None),
            ("allowed_email_domains", sa.String(500), True, None),
            ("academic_year", sa.String(32), True, "2025/2026"),
            ("allow_public_catalog", sa.Boolean(), False, sa.true()),
            ("logo_url", sa.String(1024), True, None),
            ("logo_file_path", sa.String(1024), True, None),
            ("logo_mime_type", sa.String(128), True, None),
            ("primary_color", sa.String(16), False, "#5A6552"),
            ("secondary_color", sa.String(16), False, "#DCE7D0"),
            ("accent_color", sa.String(16), False, "#3B7A57"),
            ("neutral_color", sa.String(16), False, "#FAFBF8"),
            ("default_theme", sa.String(16), False, "light"),
            ("admin_full_name", sa.String(255), True, None),
            ("admin_email", sa.String(255), True, None),
            ("admin_school_id", sa.String(64), True, None),
            ("approval_notes", sa.Text(), True, None),
            ("approved_by_id", sa.Integer(), True, None),
            ("approved_at", sa.DateTime(timezone=True), True, None),
            ("updated_at", sa.DateTime(timezone=True), True, None),
        ]
        for col_name, col_type, nullable, default in inst_cols:
            if not _has_column(inspector, "institutions", col_name):
                kwargs = {"nullable": nullable}
                if default is not None:
                    kwargs["server_default"] = default if not isinstance(default, str) else sa.text(f"'{default}'")
                op.add_column("institutions", sa.Column(col_name, col_type, **kwargs))

    # 2. Add institution_id & platform admin flag across tenant-owned tables
    tenant_tables = [
        "users",
        "students",
        "schools",
        "theses",
        "notifications",
        "phd_supervision_logs",
        "phd_seminars",
        "phd_comprehensive_exams",
        "phd_teaching_requirements",
        "phd_progress_evaluations",
        "phd_reaccreditation_folders",
    ]
    for tbl in tenant_tables:
        if tbl in tables and not _has_column(inspector, tbl, "institution_id"):
            op.add_column(tbl, sa.Column("institution_id", sa.Integer(), nullable=True))
            op.create_index(f"ix_{tbl}_institution_id", tbl, ["institution_id"], unique=False)

    if "users" in tables and not _has_column(inspector, "users", "is_platform_admin"):
        op.add_column("users", sa.Column("is_platform_admin", sa.Boolean(), nullable=False, server_default=sa.false()))

    if "departments" in tables and not _has_column(inspector, "departments", "faculty_name"):
        op.add_column("departments", sa.Column("faculty_name", sa.String(255), nullable=True))

    # 3. Create tenant_audit_logs table
    if "tenant_audit_logs" not in tables:
        op.create_table(
            "tenant_audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("institution_id", sa.Integer(), sa.ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True),
            sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("actor_email", sa.String(255), nullable=True),
            sa.Column("action", sa.String(100), nullable=False),
            sa.Column("target_type", sa.String(64), nullable=True),
            sa.Column("target_id", sa.String(64), nullable=True),
            sa.Column("details", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_tenant_audit_logs_institution_id", "tenant_audit_logs", ["institution_id"])
        op.create_index("ix_tenant_audit_logs_action", "tenant_audit_logs", ["action"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "tenant_audit_logs" in tables:
        op.drop_table("tenant_audit_logs")
