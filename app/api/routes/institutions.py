from __future__ import annotations

from datetime import datetime, timezone
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_admin,
    get_current_platform_admin,
    get_current_tenant,
    get_current_user,
    get_db,
)
from app.core.config import settings
from app.core.tenant import DEFAULT_BRANDING, evaluate_branding_contrast, tenant_bypass, validate_hex_color
from app.models.department import Department
from app.models.institution import Institution, TenantAuditLog
from app.models.paper import Paper
from app.models.student import Student
from app.models.user import User
from app.schemas.institution import (
    ContrastReport,
    InstitutionAdminRead,
    InstitutionApprovalRequest,
    InstitutionApprovalResponse,
    InstitutionBrandingUpdate,
    InstitutionOnboardRequest,
    InstitutionPublicRead,
    InstitutionRejectionRequest,
    InstitutionStatusUpdate,
    PlatformOverviewResponse,
    SlugAvailabilityResponse,
    TenantAuditLogRead,
)
from app.services.institution_service import (
    approve_institution,
    build_workspace_url,
    check_slug_availability,
    get_default_institution,
    get_institution_by_domain,
    get_institution_by_slug,
    record_tenant_audit,
    reject_institution,
    remove_institution_logo,
    submit_institution_onboarding,
    to_admin_read,
    to_public_read,
    update_institution_branding,
    update_institution_logo,
)
from app.services.storage_service import read_tenant_bytes
from app.services.user_service import has_role

router = APIRouter()


# =============================================================================
# Public Institution Discovery, Resolution & Onboarding Endpoints
# =============================================================================


@router.get("/institutions/public", response_model=list[InstitutionPublicRead])
def list_public_institutions(db: Session = Depends(get_db)) -> list[InstitutionPublicRead]:
    """List approved, active institutions for the central SaaS directory."""
    with tenant_bypass():
        items = (
            db.query(Institution)
            .filter(Institution.status == "approved", Institution.is_active.is_(True))
            .order_by(Institution.name.asc())
            .all()
        )
    return [to_public_read(inst) for inst in items]


@router.get("/institutions/check-slug/{slug}", response_model=SlugAvailabilityResponse)
def check_slug_endpoint(slug: str, db: Session = Depends(get_db)) -> SlugAvailabilityResponse:
    available, normalized, message = check_slug_availability(db, slug)
    return SlugAvailabilityResponse(
        slug=normalized or slug.strip().lower(),
        available=available,
        message=message,
        preview_url=build_workspace_url(normalized or slug.strip().lower()),
    )


@router.get("/institutions/contrast-check", response_model=ContrastReport)
def check_branding_contrast(
    primary_color: str = Query(DEFAULT_BRANDING["primary_color"]),
    secondary_color: str = Query(DEFAULT_BRANDING["secondary_color"]),
    accent_color: str = Query(DEFAULT_BRANDING["accent_color"]),
    neutral_color: str = Query(DEFAULT_BRANDING["neutral_color"]),
) -> ContrastReport:
    try:
        report = evaluate_branding_contrast(
            primary_color=validate_hex_color(primary_color, DEFAULT_BRANDING["primary_color"]),
            secondary_color=validate_hex_color(secondary_color, DEFAULT_BRANDING["secondary_color"]),
            accent_color=validate_hex_color(accent_color, DEFAULT_BRANDING["accent_color"]),
            neutral_color=validate_hex_color(neutral_color, DEFAULT_BRANDING["neutral_color"]),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ContrastReport(**report)


@router.get("/institutions/resolve", response_model=InstitutionPublicRead)
def resolve_institution_endpoint(
    request: Request,
    slug: str | None = Query(None),
    db: Session = Depends(get_db),
) -> InstitutionPublicRead:
    """Resolve an institution's branding and public settings by URL slug or Host header."""
    inst: Institution | None = None
    effective_slug = (slug or request.headers.get("X-Tenant-Slug") or "").strip().lower()
    if effective_slug:
        inst = get_institution_by_slug(db, effective_slug)
        if not inst:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Institution '{effective_slug}' not found.",
            )
    else:
        host = request.headers.get("X-Forwarded-Host") or request.headers.get("Host")
        inst = get_institution_by_domain(db, host) or get_default_institution(db)
        if not inst:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No institution configured.")

    if inst.status != "approved" or not inst.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Institution '{inst.short_name or inst.name}' is currently {inst.status} and not yet active.",
        )
    return to_public_read(inst)


@router.get("/institutions/{slug}/logo")
def get_institution_logo(slug: str, db: Session = Depends(get_db)) -> Response:
    inst = get_institution_by_slug(db, slug)
    if not inst or not inst.logo_file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution logo not found")
    data = read_tenant_bytes(inst.logo_file_path)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution logo file missing")
    return Response(
        content=data,
        media_type=inst.logo_mime_type or "image/png",
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.post("/institutions/onboard", response_model=InstitutionAdminRead, status_code=status.HTTP_201_CREATED)
async def onboard_institution_json(
    payload: InstitutionOnboardRequest,
    db: Session = Depends(get_db),
) -> InstitutionAdminRead:
    """Public institution onboarding endpoint (JSON payload)."""
    try:
        inst = submit_institution_onboarding(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return to_admin_read(db, inst)


@router.post("/institutions/onboard-with-logo", response_model=InstitutionAdminRead, status_code=status.HTTP_201_CREATED)
async def onboard_institution_multipart(
    name: str = Form(...),
    short_name: str = Form(...),
    slug: str = Form(...),
    contact_name: str = Form(...),
    contact_email: str = Form(...),
    admin_full_name: str = Form(...),
    admin_email: str = Form(...),
    custom_domain: str | None = Form(None),
    contact_phone: str | None = Form(None),
    website: str | None = Form(None),
    address: str | None = Form(None),
    allowed_email_domains: str | None = Form(None),
    academic_year: str | None = Form("2025/2026"),
    admin_school_id: str | None = Form(None),
    primary_color: str = Form(DEFAULT_BRANDING["primary_color"]),
    secondary_color: str = Form(DEFAULT_BRANDING["secondary_color"]),
    accent_color: str = Form(DEFAULT_BRANDING["accent_color"]),
    neutral_color: str = Form(DEFAULT_BRANDING["neutral_color"]),
    default_theme: str = Form("light"),
    logo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
) -> InstitutionAdminRead:
    """Public institution onboarding endpoint supporting multipart form + optional logo image upload."""
    try:
        payload = InstitutionOnboardRequest(
            name=name,
            short_name=short_name,
            slug=slug,
            custom_domain=custom_domain or None,
            contact_name=contact_name,
            contact_email=contact_email,
            contact_phone=contact_phone or None,
            website=website or None,
            address=address or None,
            allowed_email_domains=allowed_email_domains or None,
            academic_year=academic_year or "2025/2026",
            admin_full_name=admin_full_name,
            admin_email=admin_email,
            admin_school_id=admin_school_id or None,
            primary_color=primary_color,
            secondary_color=secondary_color,
            accent_color=accent_color,
            neutral_color=neutral_color,
            default_theme="dark" if default_theme == "dark" else "light",
        )
        logo_bytes = await logo.read() if logo is not None else None
        inst = submit_institution_onboarding(
            db,
            payload,
            logo_filename=logo.filename if logo else None,
            logo_content_type=logo.content_type if logo else None,
            logo_bytes=logo_bytes if logo_bytes else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return to_admin_read(db, inst)


# =============================================================================
# Tenant Institution Administration Endpoints (Scoped strictly to current tenant)
# =============================================================================


def _require_institution_admin(db: Session, user: User) -> None:
    if user.is_platform_admin:
        return
    if user.is_admin or has_role(db, user, "system_admin") or has_role(db, user, "deputy_rector"):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Institution administrator access required",
    )


@router.get("/institutions/current", response_model=InstitutionAdminRead)
def get_current_institution_endpoint(
    tenant: Institution = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> InstitutionAdminRead:
    return to_admin_read(db, tenant)


@router.patch("/institutions/current/branding", response_model=InstitutionAdminRead)
def update_current_institution_branding(
    payload: InstitutionBrandingUpdate,
    tenant: Institution = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InstitutionAdminRead:
    _require_institution_admin(db, current_user)
    try:
        updated = update_institution_branding(db, tenant, payload, actor=current_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return to_admin_read(db, updated)


@router.post("/institutions/current/logo", response_model=InstitutionAdminRead)
async def upload_current_institution_logo(
    file: UploadFile = File(...),
    tenant: Institution = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InstitutionAdminRead:
    _require_institution_admin(db, current_user)
    data = await file.read()
    try:
        updated = update_institution_logo(
            db,
            tenant,
            filename=file.filename,
            content_type=file.content_type,
            data=data,
            actor=current_user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return to_admin_read(db, updated)


@router.delete("/institutions/current/logo", response_model=InstitutionAdminRead)
def delete_current_institution_logo(
    tenant: Institution = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InstitutionAdminRead:
    _require_institution_admin(db, current_user)
    updated = remove_institution_logo(db, tenant, actor=current_user)
    return to_admin_read(db, updated)


@router.get("/institutions/current/audit-logs", response_model=list[TenantAuditLogRead])
def list_current_institution_audit_logs(
    limit: int = Query(100, ge=1, le=500),
    tenant: Institution = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TenantAuditLogRead]:
    _require_institution_admin(db, current_user)
    with tenant_bypass():
        rows = (
            db.query(TenantAuditLog)
            .filter(TenantAuditLog.institution_id == tenant.id)
            .order_by(desc(TenantAuditLog.created_at), desc(TenantAuditLog.id))
            .limit(limit)
            .all()
        )
    return [TenantAuditLogRead.model_validate(r) for r in rows]


@router.get("/institutions/current/export")
def export_current_institution_data(
    tenant: Institution = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Export all tenant-scoped institutional metadata as JSON for portability and compliance."""
    _require_institution_admin(db, current_user)
    departments = db.query(Department).filter(Department.institution_id == tenant.id).all()
    users = db.query(User).filter(User.institution_id == tenant.id).all()
    students = db.query(Student).filter(Student.institution_id == tenant.id).all()
    papers = db.query(Paper).filter(Paper.institution_id == tenant.id).all()

    export_payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "institution": to_admin_read(db, tenant).model_dump(mode="json"),
        "departments": [
            {"id": d.id, "faculty_name": d.faculty_name, "name": d.name, "hod_user_id": d.hod_user_id, "dean_user_id": d.dean_user_id}
            for d in departments
        ],
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "school_id": u.school_id,
                "school": u.school,
                "department": u.department,
                "program": u.program,
                "role": u.role,
                "is_active": u.is_active,
            }
            for u in users
        ],
        "students": [
            {
                "student_id": s.student_id,
                "full_name": s.full_name,
                "email": s.email,
                "school": s.school,
                "department": s.department,
                "program": s.program,
                "year": s.year,
            }
            for s in students
        ],
        "papers": [
            {
                "id": p.id,
                "title": p.title,
                "status": p.status,
                "year": p.year,
                "discipline": p.discipline,
                "doi": p.doi,
                "file_name": p.file_name,
                "views": p.views,
                "downloads": p.downloads,
            }
            for p in papers
        ],
    }

    with tenant_bypass():
        record_tenant_audit(
            db,
            institution_id=tenant.id,
            actor=current_user,
            action="institution_data_exported",
            target_type="institution",
            target_id=tenant.id,
            details={"users": len(users), "papers": len(papers), "departments": len(departments)},
        )
        db.commit()

    return Response(
        content=json.dumps(export_payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{tenant.slug}_data_export.json"'},
    )


# =============================================================================
# Platform Operator Administration Endpoints (/api/platform/*)
# =============================================================================


@router.get("/platform/overview", response_model=PlatformOverviewResponse)
def platform_overview(
    current_admin: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
) -> PlatformOverviewResponse:
    with tenant_bypass():
        total_inst = db.query(func.count(Institution.id)).scalar() or 0
        approved = db.query(func.count(Institution.id)).filter(Institution.status == "approved", Institution.is_active.is_(True)).scalar() or 0
        pending = db.query(func.count(Institution.id)).filter(Institution.status == "pending").scalar() or 0
        suspended = db.query(func.count(Institution.id)).filter(Institution.status == "suspended").scalar() or 0
        rejected = db.query(func.count(Institution.id)).filter(Institution.status == "rejected").scalar() or 0
        total_users = db.query(func.count(User.id)).scalar() or 0
        total_papers = db.query(func.count(Paper.id)).scalar() or 0
        total_depts = db.query(func.count(Department.id)).scalar() or 0

    return PlatformOverviewResponse(
        status="healthy",
        total_institutions=int(total_inst),
        approved_institutions=int(approved),
        pending_institutions=int(pending),
        suspended_institutions=int(suspended),
        rejected_institutions=int(rejected),
        total_users=int(total_users),
        total_papers=int(total_papers),
        total_departments=int(total_depts),
        storage_backend=settings.storage_backend,
    )


@router.get("/platform/institutions", response_model=list[InstitutionAdminRead])
def platform_list_institutions(
    status_filter: str | None = Query(None, alias="status"),
    current_admin: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
) -> list[InstitutionAdminRead]:
    with tenant_bypass():
        query = db.query(Institution)
        if status_filter:
            query = query.filter(Institution.status == status_filter.strip().lower())
        items = query.order_by(desc(Institution.created_at), desc(Institution.id)).all()
    return [to_admin_read(db, inst) for inst in items]


@router.post("/platform/institutions/{institution_id}/approve", response_model=InstitutionApprovalResponse)
def platform_approve_institution(
    institution_id: int,
    payload: InstitutionApprovalRequest | None = None,
    current_admin: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
) -> InstitutionApprovalResponse:
    req = payload or InstitutionApprovalRequest()
    try:
        inst, temp_password, email_sent = approve_institution(
            db,
            institution_id,
            actor=current_admin,
            approval_notes=req.approval_notes,
            initial_departments=req.initial_departments,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    workspace_url = build_workspace_url(inst.slug)
    return InstitutionApprovalResponse(
        institution=to_admin_read(db, inst),
        workspace_url=workspace_url,
        login_url=f"{workspace_url}/login",
        admin_email=inst.admin_email or inst.contact_email or "",
        temporary_password=temp_password,
        email_sent=email_sent,
        message=f"Institution '{inst.name}' approved and provisioned at {workspace_url}.",
    )


@router.post("/platform/institutions/{institution_id}/reject", response_model=InstitutionAdminRead)
def platform_reject_institution(
    institution_id: int,
    payload: InstitutionRejectionRequest,
    current_admin: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
) -> InstitutionAdminRead:
    try:
        inst = reject_institution(db, institution_id, actor=current_admin, reason=payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return to_admin_read(db, inst)


@router.patch("/platform/institutions/{institution_id}/status", response_model=InstitutionAdminRead)
def platform_update_institution_status(
    institution_id: int,
    payload: InstitutionStatusUpdate,
    current_admin: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
) -> InstitutionAdminRead:
    with tenant_bypass():
        inst = db.query(Institution).filter(Institution.id == institution_id).first()
        if not inst:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution not found")
        if payload.custom_domain is not None:
            clean_domain = payload.custom_domain.strip().lower() or None
            if clean_domain:
                dup = (
                    db.query(Institution)
                    .filter(func.lower(Institution.custom_domain) == clean_domain, Institution.id != inst.id)
                    .first()
                )
                if dup:
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Custom domain already in use")
            inst.custom_domain = clean_domain
        inst.status = payload.status
        inst.is_active = payload.is_active if payload.is_active is not None else (payload.status == "approved")
        if payload.approval_notes is not None:
            inst.approval_notes = payload.approval_notes.strip() or None
        db.add(inst)
        record_tenant_audit(
            db,
            institution_id=inst.id,
            actor=current_admin,
            action=f"institution_status_{payload.status}",
            target_type="institution",
            target_id=inst.id,
            details={"status": inst.status, "is_active": inst.is_active, "custom_domain": inst.custom_domain},
        )
        db.commit()
        db.refresh(inst)
    return to_admin_read(db, inst)


@router.get("/platform/audit-logs", response_model=list[TenantAuditLogRead])
def platform_audit_logs(
    institution_id: int | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_admin: User = Depends(get_current_platform_admin),
    db: Session = Depends(get_db),
) -> list[TenantAuditLogRead]:
    with tenant_bypass():
        query = db.query(TenantAuditLog)
        if institution_id is not None:
            query = query.filter(TenantAuditLog.institution_id == institution_id)
        rows = query.order_by(desc(TenantAuditLog.created_at), desc(TenantAuditLog.id)).limit(limit).all()
    return [TenantAuditLogRead.model_validate(r) for r in rows]
