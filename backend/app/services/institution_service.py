from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.core.tenant import (
    DEFAULT_BRANDING,
    evaluate_branding_contrast,
    normalize_slug,
    tenant_bypass,
    validate_hex_color,
    validate_slug,
)
from app.models.department import Department
from app.models.institution import Institution, TenantAuditLog
from app.models.paper import Paper
from app.models.user import User
from app.models.user_role import UserRole
from app.schemas.institution import (
    ContrastReport,
    InstitutionAdminRead,
    InstitutionBrandingUpdate,
    InstitutionOnboardRequest,
    InstitutionPublicRead,
)
from app.services.email_service import send_notification_email
from app.services.import_service import generate_default_password
from app.services.storage_service import delete_tenant_object, save_tenant_bytes, validate_logo_upload


def build_workspace_url(slug: str) -> str:
    base = (settings.public_frontend_url or "http://localhost:5173").rstrip("/")
    return f"{base}/{slug}"


def build_logo_api_url(slug: str) -> str:
    return f"{settings.api_prefix}/institutions/{slug}/logo"


def record_tenant_audit(
    db: Session,
    *,
    institution_id: int | None,
    actor: User | None,
    action: str,
    target_type: str | None = None,
    target_id: str | int | None = None,
    details: str | dict[str, Any] | None = None,
) -> TenantAuditLog:
    detail_str = json.dumps(details) if isinstance(details, dict) else (str(details) if details is not None else None)
    entry = TenantAuditLog(
        institution_id=institution_id,
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        details=detail_str,
    )
    db.add(entry)
    db.flush()
    return entry


def to_public_read(inst: Institution) -> InstitutionPublicRead:
    slug = inst.slug or normalize_slug(inst.short_name or inst.name) or f"school-{inst.id}"
    contrast_dict = evaluate_branding_contrast(
        primary_color=inst.primary_color or DEFAULT_BRANDING["primary_color"],
        secondary_color=inst.secondary_color or DEFAULT_BRANDING["secondary_color"],
        accent_color=inst.accent_color or DEFAULT_BRANDING["accent_color"],
        neutral_color=inst.neutral_color or DEFAULT_BRANDING["neutral_color"],
    )
    logo_url = build_logo_api_url(slug) if inst.logo_file_path else inst.logo_url
    return InstitutionPublicRead(
        id=inst.id,
        name=inst.name,
        short_name=inst.short_name or inst.name,
        slug=slug,
        custom_domain=inst.custom_domain,
        status=inst.status or "approved",
        is_active=bool(inst.is_active),
        website=inst.website,
        address=inst.address,
        contact_email=inst.contact_email,
        allowed_email_domains=inst.allowed_email_domains,
        academic_year=inst.academic_year or "2025/2026",
        allow_public_catalog=bool(inst.allow_public_catalog if inst.allow_public_catalog is not None else True),
        logo_url=logo_url,
        primary_color=inst.primary_color or DEFAULT_BRANDING["primary_color"],
        secondary_color=inst.secondary_color or DEFAULT_BRANDING["secondary_color"],
        accent_color=inst.accent_color or DEFAULT_BRANDING["accent_color"],
        neutral_color=inst.neutral_color or DEFAULT_BRANDING["neutral_color"],
        default_theme=inst.default_theme or DEFAULT_BRANDING["default_theme"],
        workspace_url=build_workspace_url(slug),
        contrast=ContrastReport(**contrast_dict),
    )


def to_admin_read(db: Session, inst: Institution) -> InstitutionAdminRead:
    pub = to_public_read(inst)
    with tenant_bypass():
        users_count = db.query(func.count(User.id)).filter(User.institution_id == inst.id).scalar() or 0
        papers_count = db.query(func.count(Paper.id)).filter(Paper.institution_id == inst.id).scalar() or 0
        depts_count = db.query(func.count(Department.id)).filter(Department.institution_id == inst.id).scalar() or 0
    return InstitutionAdminRead(
        **pub.model_dump(),
        contact_name=inst.contact_name,
        contact_phone=inst.contact_phone,
        admin_full_name=inst.admin_full_name,
        admin_email=inst.admin_email,
        admin_school_id=inst.admin_school_id,
        approval_notes=inst.approval_notes,
        approved_by_id=inst.approved_by_id,
        approved_at=inst.approved_at,
        created_at=inst.created_at,
        updated_at=inst.updated_at,
        users_count=int(users_count),
        papers_count=int(papers_count),
        departments_count=int(depts_count),
    )


def check_slug_availability(db: Session, raw_slug: str) -> tuple[bool, str, str]:
    ok, result = validate_slug(raw_slug)
    if not ok:
        return False, normalize_slug(raw_slug), result
    normalized = result
    with tenant_bypass():
        existing = db.query(Institution).filter(func.lower(Institution.slug) == normalized).first()
    if existing:
        return False, normalized, f"The web address '/{normalized}' is already reserved by another institution."
    return True, normalized, f"Great! '/{normalized}' is available."


def get_institution_by_slug(db: Session, slug: str) -> Institution | None:
    cleaned = (slug or "").strip().lower()
    if not cleaned:
        return None
    with tenant_bypass():
        return db.query(Institution).filter(func.lower(Institution.slug) == cleaned).first()


def get_institution_by_domain(db: Session, host: str | None) -> Institution | None:
    if not host:
        return None
    clean_host = host.split(":", 1)[0].strip().lower()
    if not clean_host or clean_host in {"localhost", "127.0.0.1"}:
        return None
    with tenant_bypass():
        direct = db.query(Institution).filter(func.lower(Institution.custom_domain) == clean_host).first()
        if direct:
            return direct
        base_domain = (settings.platform_base_domain or "").strip().lower().lstrip(".")
        if base_domain and clean_host.endswith(f".{base_domain}"):
            sub = clean_host[: -(len(base_domain) + 1)]
            if sub and "." not in sub and sub != "www":
                return db.query(Institution).filter(func.lower(Institution.slug) == sub).first()
    return None


def get_default_institution(db: Session) -> Institution | None:
    default_slug = (settings.default_tenant_slug or "gimpa").strip().lower()
    with tenant_bypass():
        inst = db.query(Institution).filter(func.lower(Institution.slug) == default_slug).first()
        if inst:
            return inst
        return (
            db.query(Institution)
            .filter(Institution.status == "approved", Institution.is_active.is_(True))
            .order_by(Institution.id.asc())
            .first()
        )


def is_email_allowed_for_institution(email: str, institution: Institution | None) -> bool:
    """Check email domain against the specific institution's configured allowed_email_domains."""
    normalized = (email or "").strip().lower()
    if "@" not in normalized:
        return False
    _, domain = normalized.rsplit("@", 1)
    if not domain:
        return False
    raw_domains = (institution.allowed_email_domains if institution else None) or ""
    allowed = [item.strip().lower().lstrip("@") for item in raw_domains.split(",") if item.strip()]
    # If an onboarded institution has not restricted email domains, allow any valid email
    if not allowed:
        return True
    return any(domain == base or domain.endswith(f".{base}") for base in allowed)


def submit_institution_onboarding(
    db: Session,
    payload: InstitutionOnboardRequest,
    *,
    logo_filename: str | None = None,
    logo_content_type: str | None = None,
    logo_bytes: bytes | None = None,
) -> Institution:
    available, normalized_slug, msg = check_slug_availability(db, payload.slug)
    if not available:
        raise ValueError(msg)

    with tenant_bypass():
        name_dup = db.query(Institution).filter(func.lower(Institution.name) == payload.name.strip().lower()).first()
        if name_dup:
            raise ValueError(f"An institution named '{payload.name.strip()}' is already registered.")
        if payload.custom_domain:
            clean_domain = payload.custom_domain.strip().lower()
            dom_dup = db.query(Institution).filter(func.lower(Institution.custom_domain) == clean_domain).first()
            if dom_dup:
                raise ValueError(f"Custom domain '{clean_domain}' is already in use.")

    # Auto-derive email domain from admin_email if not supplied explicitly
    allowed_domains = (payload.allowed_email_domains or "").strip()
    if not allowed_domains and "@" in payload.admin_email:
        _, admin_dom = payload.admin_email.lower().rsplit("@", 1)
        if admin_dom not in {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com"}:
            allowed_domains = admin_dom

    validated_logo: tuple[str, str] | None = None
    if logo_bytes:
        validated_logo = validate_logo_upload(logo_filename, logo_content_type, logo_bytes)

    initial_status = "approved" if settings.auto_approve_institutions else "pending"
    inst = Institution(
        name=payload.name.strip(),
        short_name=payload.short_name.strip(),
        slug=normalized_slug,
        custom_domain=(payload.custom_domain.strip().lower() if payload.custom_domain else None),
        status=initial_status,
        is_active=(initial_status == "approved"),
        contact_name=payload.contact_name.strip(),
        contact_email=payload.contact_email.strip().lower(),
        contact_phone=(payload.contact_phone or "").strip() or None,
        website=(payload.website or "").strip() or None,
        address=(payload.address or "").strip() or None,
        allowed_email_domains=allowed_domains or None,
        academic_year=(payload.academic_year or "2025/2026").strip(),
        allow_public_catalog=True,
        primary_color=validate_hex_color(payload.primary_color, DEFAULT_BRANDING["primary_color"]),
        secondary_color=validate_hex_color(payload.secondary_color, DEFAULT_BRANDING["secondary_color"]),
        accent_color=validate_hex_color(payload.accent_color, DEFAULT_BRANDING["accent_color"]),
        neutral_color=validate_hex_color(payload.neutral_color, DEFAULT_BRANDING["neutral_color"]),
        default_theme=payload.default_theme or "light",
        admin_full_name=payload.admin_full_name.strip(),
        admin_email=payload.admin_email.strip().lower(),
        admin_school_id=(payload.admin_school_id or "").strip() or None,
    )
    with tenant_bypass():
        db.add(inst)
        db.flush()

        if validated_logo and logo_bytes:
            ext, mime = validated_logo
            storage_path = save_tenant_bytes(
                institution_id=inst.id,
                category="logos",
                filename=f"logo{ext}",
                data=logo_bytes,
                content_type=mime,
            )
            inst.logo_file_path = storage_path
            inst.logo_mime_type = mime
            inst.logo_url = build_logo_api_url(inst.slug)
            db.add(inst)

        record_tenant_audit(
            db,
            institution_id=inst.id,
            actor=None,
            action="institution_onboarding_submitted",
            target_type="institution",
            target_id=inst.id,
            details={"slug": inst.slug, "admin_email": inst.admin_email, "status": inst.status},
        )
        db.commit()
        db.refresh(inst)

    if settings.auto_approve_institutions:
        inst, _, _ = approve_institution(db, inst.id, actor=None, approval_notes="Auto-approved on registration")

    return inst


def approve_institution(
    db: Session,
    institution_id: int,
    *,
    actor: User | None,
    approval_notes: str | None = None,
    initial_departments: list[str] | None = None,
) -> tuple[Institution, str | None, bool]:
    """Approve an institution, provision its initial system_admin account, starter departments, and issue welcome link."""
    with tenant_bypass():
        inst = db.query(Institution).filter(Institution.id == institution_id).first()
        if not inst:
            raise ValueError("Institution not found.")

        ok, normalized_slug = validate_slug(inst.slug or inst.short_name or inst.name)
        if not ok:
            raise ValueError(f"Invalid institution slug: {normalized_slug}")
        slug_conflict = (
            db.query(Institution)
            .filter(func.lower(Institution.slug) == normalized_slug, Institution.id != inst.id)
            .first()
        )
        if slug_conflict:
            raise ValueError(f"Slug '{normalized_slug}' is already taken by another institution.")

        inst.slug = normalized_slug
        inst.status = "approved"
        inst.is_active = True
        inst.approval_notes = (approval_notes or "").strip() or inst.approval_notes
        inst.approved_by_id = actor.id if actor else None
        inst.approved_at = datetime.now(timezone.utc)
        db.add(inst)

        # Provision initial institution administrator account
        temp_password: str | None = None
        admin_email = (inst.admin_email or inst.contact_email or "").strip().lower()
        if admin_email:
            existing_user = db.query(User).filter(func.lower(User.email) == admin_email).first()
            if existing_user:
                if existing_user.institution_id is not None and existing_user.institution_id != inst.id:
                    raise ValueError(
                        f"Administrator email '{admin_email}' is already registered under another institution."
                    )
                existing_user.institution_id = inst.id
                existing_user.is_active = True
                existing_user.is_admin = True
                existing_user.role = "system_admin"
                db.add(existing_user)
                if not db.query(UserRole).filter(UserRole.user_id == existing_user.id, UserRole.role == "system_admin").first():
                    db.add(UserRole(user_id=existing_user.id, role="system_admin", assigned_by_id=actor.id if actor else None))
            else:
                temp_password = generate_default_password()
                admin_user = User(
                    institution_id=inst.id,
                    email=admin_email,
                    school_id=inst.admin_school_id or None,
                    school=inst.short_name or inst.name,
                    full_name=inst.admin_full_name or f"{inst.short_name or inst.name} Administrator",
                    department="Administration",
                    hashed_password=hash_password(temp_password),
                    is_active=True,
                    is_admin=True,
                    is_platform_admin=False,
                    role="system_admin",
                    must_change_password=True,
                )
                db.add(admin_user)
                db.flush()
                db.add(UserRole(user_id=admin_user.id, role="system_admin", assigned_by_id=actor.id if actor else None))

        # Provision starter department(s) if institution currently has none
        dept_count = db.query(Department).filter(Department.institution_id == inst.id).count()
        if dept_count == 0:
            starter_depts = [d.strip() for d in (initial_departments or []) if d and d.strip()]
            if not starter_depts:
                starter_depts = ["Graduate Studies & Research"]
            for dept_name in starter_depts:
                db.add(
                    Department(
                        institution_id=inst.id,
                        faculty_name=inst.short_name or inst.name,
                        name=dept_name,
                    )
                )

        record_tenant_audit(
            db,
            institution_id=inst.id,
            actor=actor,
            action="institution_approved",
            target_type="institution",
            target_id=inst.id,
            details={"slug": inst.slug, "admin_email": admin_email, "notes": inst.approval_notes},
        )
        db.commit()
        db.refresh(inst)

    workspace_url = build_workspace_url(inst.slug)
    login_url = f"{workspace_url}/login"
    email_sent = False
    if admin_email:
        password_line = (
            f"- Temporary Password: {temp_password}\n(You will be prompted to change this password upon first sign-in.)\n"
            if temp_password
            else "- Use your existing account password to sign in.\n"
        )
        email_sent = send_notification_email(
            to_email=admin_email,
            to_name=inst.admin_full_name or inst.contact_name or inst.short_name,
            subject=f"Workspace Approved: {inst.name} Thesis Repository",
            message=(
                f"Congratulations! Your institution '{inst.name}' has been approved on the Multi-School Thesis Repository Cloud platform.\n\n"
                f"Your Institution Workspace URL: {workspace_url}\n"
                f"Administrator Sign-In URL: {login_url}\n\n"
                f"Initial Administrator Credentials:\n"
                f"- Email: {admin_email}\n"
                f"{password_line}\n"
                f"Once signed in, you can configure your departments, staff, supervisors, students, and institution branding from your workspace."
            ),
            institution_name=inst.name,
            portal_url=login_url,
        )

    return inst, temp_password, email_sent


def reject_institution(
    db: Session,
    institution_id: int,
    *,
    actor: User,
    reason: str,
) -> Institution:
    with tenant_bypass():
        inst = db.query(Institution).filter(Institution.id == institution_id).first()
        if not inst:
            raise ValueError("Institution not found.")
        inst.status = "rejected"
        inst.is_active = False
        inst.approval_notes = reason.strip()
        db.add(inst)
        record_tenant_audit(
            db,
            institution_id=inst.id,
            actor=actor,
            action="institution_rejected",
            target_type="institution",
            target_id=inst.id,
            details={"reason": reason.strip()},
        )
        db.commit()
        db.refresh(inst)

    recipient = inst.contact_email or inst.admin_email
    if recipient:
        send_notification_email(
            to_email=recipient,
            to_name=inst.contact_name or inst.admin_full_name or inst.name,
            subject=f"Institution Onboarding Update - {inst.name}",
            message=(
                f"Your onboarding request for '{inst.name}' was not approved at this time.\n\n"
                f"Reason: {reason.strip()}\n\n"
                "Please reply or submit an updated onboarding request once addressed."
            ),
        )
    return inst


def update_institution_branding(
    db: Session,
    inst: Institution,
    payload: InstitutionBrandingUpdate,
    *,
    actor: User,
) -> Institution:
    with tenant_bypass():
        if payload.reset_to_default:
            inst.primary_color = DEFAULT_BRANDING["primary_color"]
            inst.secondary_color = DEFAULT_BRANDING["secondary_color"]
            inst.accent_color = DEFAULT_BRANDING["accent_color"]
            inst.neutral_color = DEFAULT_BRANDING["neutral_color"]
            inst.default_theme = DEFAULT_BRANDING["default_theme"]
        else:
            if payload.primary_color is not None:
                inst.primary_color = validate_hex_color(payload.primary_color, inst.primary_color)
            if payload.secondary_color is not None:
                inst.secondary_color = validate_hex_color(payload.secondary_color, inst.secondary_color)
            if payload.accent_color is not None:
                inst.accent_color = validate_hex_color(payload.accent_color, inst.accent_color)
            if payload.neutral_color is not None:
                inst.neutral_color = validate_hex_color(payload.neutral_color, inst.neutral_color)
            if payload.default_theme is not None:
                inst.default_theme = payload.default_theme

        if payload.name is not None:
            clean_name = payload.name.strip()
            dup = (
                db.query(Institution)
                .filter(func.lower(Institution.name) == clean_name.lower(), Institution.id != inst.id)
                .first()
            )
            if dup:
                raise ValueError("Another institution already uses that official name.")
            inst.name = clean_name
        if payload.short_name is not None:
            inst.short_name = payload.short_name.strip()
        if payload.website is not None:
            inst.website = payload.website.strip() or None
        if payload.address is not None:
            inst.address = payload.address.strip() or None
        if payload.contact_name is not None:
            inst.contact_name = payload.contact_name.strip() or None
        if payload.contact_email is not None:
            inst.contact_email = payload.contact_email.strip().lower()
        if payload.contact_phone is not None:
            inst.contact_phone = payload.contact_phone.strip() or None
        if payload.allowed_email_domains is not None:
            inst.allowed_email_domains = payload.allowed_email_domains.strip() or None
        if payload.academic_year is not None:
            inst.academic_year = payload.academic_year.strip() or None
        if payload.allow_public_catalog is not None:
            inst.allow_public_catalog = payload.allow_public_catalog

        db.add(inst)
        record_tenant_audit(
            db,
            institution_id=inst.id,
            actor=actor,
            action="institution_branding_updated",
            target_type="institution",
            target_id=inst.id,
            details={
                "reset_to_default": payload.reset_to_default,
                "primary_color": inst.primary_color,
                "secondary_color": inst.secondary_color,
                "accent_color": inst.accent_color,
                "default_theme": inst.default_theme,
            },
        )
        db.commit()
        db.refresh(inst)
    return inst


def update_institution_logo(
    db: Session,
    inst: Institution,
    *,
    filename: str | None,
    content_type: str | None,
    data: bytes,
    actor: User,
) -> Institution:
    ext, mime = validate_logo_upload(filename, content_type, data)
    old_path = inst.logo_file_path
    storage_path = save_tenant_bytes(
        institution_id=inst.id,
        category="logos",
        filename=f"logo{ext}",
        data=data,
        content_type=mime,
    )
    with tenant_bypass():
        inst.logo_file_path = storage_path
        inst.logo_mime_type = mime
        inst.logo_url = build_logo_api_url(inst.slug or str(inst.id))
        db.add(inst)
        record_tenant_audit(
            db,
            institution_id=inst.id,
            actor=actor,
            action="institution_logo_uploaded",
            target_type="institution",
            target_id=inst.id,
            details={"mime_type": mime, "size_bytes": len(data)},
        )
        db.commit()
        db.refresh(inst)
    if old_path and old_path != storage_path:
        delete_tenant_object(old_path)
    return inst


def remove_institution_logo(db: Session, inst: Institution, *, actor: User) -> Institution:
    old_path = inst.logo_file_path
    with tenant_bypass():
        inst.logo_file_path = None
        inst.logo_mime_type = None
        inst.logo_url = None
        db.add(inst)
        record_tenant_audit(
            db,
            institution_id=inst.id,
            actor=actor,
            action="institution_logo_removed",
            target_type="institution",
            target_id=inst.id,
        )
        db.commit()
        db.refresh(inst)
    delete_tenant_object(old_path)
    return inst
