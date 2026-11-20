"""Add PhD 6-stage progression pipeline tables and comprehensive exam fields

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "phd_comprehensive_exams" in tables:
        cols = {c["name"] for c in inspector.get_columns("phd_comprehensive_exams")}
        if "assessor_id" not in cols:
            op.add_column("phd_comprehensive_exams", sa.Column("assessor_id", sa.Integer(), nullable=True))
        if "paper_part" not in cols:
            op.add_column("phd_comprehensive_exams", sa.Column("paper_part", sa.String(length=200), nullable=True))
        if "score" not in cols:
            op.add_column("phd_comprehensive_exams", sa.Column("score", sa.Float(), nullable=True))
        if "remedial_instructions" not in cols:
            op.add_column("phd_comprehensive_exams", sa.Column("remedial_instructions", sa.Text(), nullable=True))

    if "phd_coursework_records" not in tables:
        op.create_table(
            "phd_coursework_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("institution_id", sa.Integer(), sa.ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("course_code", sa.String(length=50), nullable=False),
            sa.Column("course_title", sa.String(length=255), nullable=False),
            sa.Column("academic_year", sa.String(length=50), nullable=False, server_default="2025/2026"),
            sa.Column("semester", sa.String(length=50), nullable=False, server_default="Semester 1"),
            sa.Column("credit_hours", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("assignment_score", sa.Float(), nullable=True),
            sa.Column("coursework_score", sa.Float(), nullable=True),
            sa.Column("exam_score", sa.Float(), nullable=True),
            sa.Column("total_score", sa.Float(), nullable=True),
            sa.Column("letter_grade", sa.String(length=10), nullable=True),
            sa.Column("grade_point", sa.Float(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="Enrolled"),
            sa.Column("instructor_name", sa.String(length=200), nullable=True),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("recorded_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    if "phd_progression_profiles" not in tables:
        op.create_table(
            "phd_progression_profiles",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("institution_id", sa.Integer(), sa.ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
            sa.Column("advisor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("advisor_cleared_for_comps", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("advisor_clearance_date", sa.Date(), nullable=True),
            sa.Column("advisor_clearance_notes", sa.Text(), nullable=True),
            sa.Column("comp_assessor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("comp_assessor_assigned_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("dissertation_supervisor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("co_supervisor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("supervisor_assigned_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("pre_viva_examiner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("pre_viva_date", sa.Date(), nullable=True),
            sa.Column("pre_viva_score", sa.Float(), nullable=True),
            sa.Column("pre_viva_verdict", sa.String(length=60), nullable=True),
            sa.Column("pre_viva_cleared", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("pre_viva_remarks", sa.Text(), nullable=True),
            sa.Column("external_examiner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("external_dispatched_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("viva_date", sa.Date(), nullable=True),
            sa.Column("internal_examiner_mark", sa.Float(), nullable=True),
            sa.Column("external_examiner_mark", sa.Float(), nullable=True),
            sa.Column("oral_defense_mark", sa.Float(), nullable=True),
            sa.Column("overall_defense_mark", sa.Float(), nullable=True),
            sa.Column("viva_verdict", sa.String(length=60), nullable=True),
            sa.Column("viva_remarks", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("phd_progression_profiles")
    op.drop_table("phd_coursework_records")
