from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.tenant import DEFAULT_BRANDING, validate_hex_color, validate_slug

InstitutionStatus = Literal["pending", "approved", "rejected", "suspended"]
ThemePreference = Literal["light", "dark"]


class ContrastReport(BaseModel):
    primary_text_color: str
    primary_contrast_ratio: float
    primary_passes_aa: bool
    secondary_text_color: str
    secondary_contrast_ratio: float
    secondary_passes_aa: bool
    accent_text_color: str
    accent_contrast_ratio: float
    accent_passes_aa: bool
    primary_on_neutral_ratio: float
    accessible: bool
    warnings: list[str] = Field(default_factory=list)


class InstitutionPublicRead(BaseModel):
    id: int
    name: str
    short_name: str
    slug: str
    custom_domain: str | None = None
    status: str
    is_active: bool = True
    website: str | None = None
    address: str | None = None
    contact_email: str | None = None
    allowed_email_domains: str | None = None
    academic_year: str | None = None
    allow_public_catalog: bool = True
    logo_url: str | None = None
    primary_color: str = DEFAULT_BRANDING["primary_color"]
    secondary_color: str = DEFAULT_BRANDING["secondary_color"]
    accent_color: str = DEFAULT_BRANDING["accent_color"]
    neutral_color: str = DEFAULT_BRANDING["neutral_color"]
    default_theme: str = DEFAULT_BRANDING["default_theme"]
    workspace_url: str | None = None
    contrast: ContrastReport | None = None

    class Config:
        from_attributes = True


class InitialDepartmentInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    programs: list[str] = Field(default_factory=list)


class InitialFacultyInput(BaseModel):
    faculty_name: str = Field(..., min_length=1, max_length=255)
    departments: list[InitialDepartmentInput] = Field(default_factory=list)


class InstitutionAdminRead(InstitutionPublicRead):
    contact_name: str | None = None
    contact_phone: str | None = None
    admin_full_name: str | None = None
    admin_email: str | None = None
    admin_school_id: str | None = None
    initial_structure: list[InitialFacultyInput] = Field(default_factory=list)
    approval_notes: str | None = None
    approved_by_id: int | None = None
    approved_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    users_count: int = 0
    papers_count: int = 0
    departments_count: int = 0


class InstitutionOnboardRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    short_name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=3, max_length=50)
    custom_domain: str | None = Field(default=None, max_length=255)
    contact_name: str = Field(..., min_length=2, max_length=255)
    contact_email: EmailStr
    contact_phone: str | None = Field(default=None, max_length=64)
    website: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=500)
    allowed_email_domains: str | None = Field(default=None, max_length=500)
    academic_year: str | None = Field(default="2025/2026", max_length=32)
    admin_full_name: str = Field(..., min_length=2, max_length=255)
    admin_email: EmailStr
    admin_school_id: str | None = Field(default=None, max_length=64)
    initial_structure: list[InitialFacultyInput] = Field(default_factory=list)
    primary_color: str = Field(default=DEFAULT_BRANDING["primary_color"])
    secondary_color: str = Field(default=DEFAULT_BRANDING["secondary_color"])
    accent_color: str = Field(default=DEFAULT_BRANDING["accent_color"])
    neutral_color: str = Field(default=DEFAULT_BRANDING["neutral_color"])
    default_theme: ThemePreference = "light"

    @field_validator("slug")
    @classmethod
    def check_slug(cls, value: str) -> str:
        ok, result = validate_slug(value)
        if not ok:
            raise ValueError(result)
        return result

    @field_validator("primary_color")
    @classmethod
    def check_primary(cls, value: str) -> str:
        return validate_hex_color(value, DEFAULT_BRANDING["primary_color"])

    @field_validator("secondary_color")
    @classmethod
    def check_secondary(cls, value: str) -> str:
        return validate_hex_color(value, DEFAULT_BRANDING["secondary_color"])

    @field_validator("accent_color")
    @classmethod
    def check_accent(cls, value: str) -> str:
        return validate_hex_color(value, DEFAULT_BRANDING["accent_color"])

    @field_validator("neutral_color")
    @classmethod
    def check_neutral(cls, value: str) -> str:
        return validate_hex_color(value, DEFAULT_BRANDING["neutral_color"])


class InstitutionBrandingUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    short_name: str | None = Field(default=None, min_length=2, max_length=100)
    website: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=500)
    contact_name: str | None = Field(default=None, max_length=255)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=64)
    allowed_email_domains: str | None = Field(default=None, max_length=500)
    academic_year: str | None = Field(default=None, max_length=32)
    allow_public_catalog: bool | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    accent_color: str | None = None
    neutral_color: str | None = None
    default_theme: ThemePreference | None = None
    reset_to_default: bool = False

    @field_validator("primary_color", "secondary_color", "accent_color", "neutral_color")
    @classmethod
    def check_optional_hex(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return validate_hex_color(value, "#5A6552")


class SlugAvailabilityResponse(BaseModel):
    slug: str
    available: bool
    message: str
    preview_url: str


class InstitutionApprovalRequest(BaseModel):
    approval_notes: str | None = None
    initial_departments: list[str] | None = None


class InstitutionApprovalResponse(BaseModel):
    institution: InstitutionAdminRead
    workspace_url: str
    login_url: str
    admin_email: str
    temporary_password: str | None = None
    email_sent: bool = False
    message: str


class InstitutionRejectionRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)


class InstitutionStatusUpdate(BaseModel):
    status: Literal["approved", "suspended", "rejected"]
    is_active: bool | None = None
    custom_domain: str | None = None
    approval_notes: str | None = None


class TenantAuditLogRead(BaseModel):
    id: int
    institution_id: int | None = None
    actor_id: int | None = None
    actor_email: str | None = None
    action: str
    target_type: str | None = None
    target_id: str | None = None
    details: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class PlatformOverviewResponse(BaseModel):
    status: str = "healthy"
    total_institutions: int
    approved_institutions: int
    pending_institutions: int
    suspended_institutions: int
    rejected_institutions: int
    total_users: int
    total_papers: int
    total_departments: int
    storage_backend: str
