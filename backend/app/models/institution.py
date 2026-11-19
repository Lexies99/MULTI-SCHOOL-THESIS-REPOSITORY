from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Institution(Base):
    __tablename__ = "institutions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    short_name = Column(String(100), nullable=True)
    slug = Column(String(100), unique=True, nullable=True, index=True)
    custom_domain = Column(String(255), unique=True, nullable=True, index=True)

    # Onboarding & lifecycle status: pending, approved, rejected, suspended
    status = Column(String(32), nullable=False, default="approved", index=True)
    is_active = Column(Boolean, nullable=False, default=True)

    # Institutional metadata & contact details
    contact_name = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(64), nullable=True)
    website = Column(String(255), nullable=True)
    address = Column(String(500), nullable=True)
    allowed_email_domains = Column(String(500), nullable=True)
    academic_year = Column(String(32), nullable=True, default="2025/2026")
    allow_public_catalog = Column(Boolean, nullable=False, default=True)

    # Branding & visual identity (validated HEX colours + logo)
    logo_url = Column(String(1024), nullable=True)
    logo_file_path = Column(String(1024), nullable=True)
    logo_mime_type = Column(String(128), nullable=True)
    primary_color = Column(String(16), nullable=False, default="#5A6552")
    secondary_color = Column(String(16), nullable=False, default="#DCE7D0")
    accent_color = Column(String(16), nullable=False, default="#3B7A57")
    neutral_color = Column(String(16), nullable=False, default="#FAFBF8")
    default_theme = Column(String(16), nullable=False, default="light")

    # Initial institution administrator onboarding details
    admin_full_name = Column(String(255), nullable=True)
    admin_email = Column(String(255), nullable=True)
    admin_school_id = Column(String(64), nullable=True)
    # Optional JSON list of initial faculties/schools, departments & programs submitted during onboarding
    initial_structure_json = Column(Text, nullable=True)

    # Platform operator approval tracking
    approval_notes = Column(Text, nullable=True)
    approved_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    approved_by = relationship("User", foreign_keys=[approved_by_id])


class TenantAuditLog(Base):
    __tablename__ = "tenant_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    target_type = Column(String(64), nullable=True)
    target_id = Column(String(64), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    institution = relationship("Institution", foreign_keys=[institution_id])
    actor = relationship("User", foreign_keys=[actor_id])
