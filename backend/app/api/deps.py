from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.core.tenant import set_session_tenant, tenant_bypass
from app.db.session import SessionLocal
from app.models.institution import Institution
from app.models.user import User
from app.services.institution_service import (
    get_default_institution,
    get_institution_by_domain,
    get_institution_by_slug,
)
from app.services.user_service import get_user_by_email, has_role

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _extract_requested_tenant(request: Request, db: Session) -> Institution | None:
    """Resolve an explicitly requested tenant from trusted header, query param, or Host subdomain/domain."""
    header_slug = (request.headers.get("X-Tenant-Slug") or "").strip().lower()
    query_slug = (request.query_params.get("tenant") or "").strip().lower()
    slug = header_slug or query_slug
    if slug:
        inst = get_institution_by_slug(db, slug)
        if not inst:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Institution '{slug}' was not found.",
            )
        return inst

    host = request.headers.get("X-Forwarded-Host") or request.headers.get("Host")
    if host:
        by_domain = get_institution_by_domain(db, host)
        if by_domain:
            return by_domain
    return None


def resolve_public_tenant(
    request: Request,
    db: Session = Depends(get_db),
) -> Institution:
    """Resolve an approved, active tenant for public endpoints (catalog, departments, login branding)."""
    inst = _extract_requested_tenant(request, db)
    if inst is None:
        inst = get_default_institution(db)
    if not inst:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active institution workspace found.",
        )
    if inst.status != "approved" or not inst.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Institution '{inst.short_name or inst.name}' workspace is currently {inst.status}.",
        )
    set_session_tenant(db, inst.id, inst.slug, bypass=False)
    return inst


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_access_token(token, expected_type="access")
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    with tenant_bypass(db):
        user = get_user_by_email(db, payload["sub"])
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

        # Validate tenant binding & prevent cross-tenant spoofing via browser headers/URLs
        requested_inst = _extract_requested_tenant(request, db)
        user_inst: Institution | None = None
        if user.institution_id is not None:
            user_inst = db.query(Institution).filter(Institution.id == user.institution_id).first()

        if not user.is_platform_admin:
            if not user_inst:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is not associated with an active institution.",
                )
            if user_inst.status != "approved" or not user_inst.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your institution workspace is currently inactive or suspended.",
                )
            if requested_inst is not None and requested_inst.id != user_inst.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cross-tenant access denied: your account does not belong to this institution.",
                )
            # Authoritatively lock ORM tenant scope to authenticated user's institution
            target_scope = (user_inst.id, user_inst.slug, False)
        else:
            if request.url.path.startswith(f"{settings.api_prefix}/platform"):
                target_scope = (None, None, True)
            elif requested_inst is not None:
                target_scope = (requested_inst.id, requested_inst.slug, False)
            elif user_inst is not None:
                target_scope = (user_inst.id, user_inst.slug, False)
            else:
                target_scope = (None, None, True)

    set_session_tenant(db, target_scope[0], target_scope[1], bypass=target_scope[2])

    if user.must_change_password:
        allowed_paths = {
            f"{settings.api_prefix}/me",
            f"{settings.api_prefix}/users/change-password",
            f"{settings.api_prefix}/auth/logout",
            f"{settings.api_prefix}/institutions/current",
        }
        if request.url.path not in allowed_paths:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password change required before accessing other resources",
            )

    return user


def get_current_tenant(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Institution:
    """Return the authenticated user's authoritative Institution tenant."""
    with tenant_bypass():
        if current_user.is_platform_admin:
            requested = _extract_requested_tenant(request, db)
            if requested:
                return requested
        if current_user.institution_id is not None:
            inst = db.query(Institution).filter(Institution.id == current_user.institution_id).first()
            if inst:
                return inst
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution workspace not found")


def get_current_platform_admin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if not current_user.is_platform_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator access required",
        )
    set_session_tenant(db, None, None, bypass=True)
    return current_user


def get_current_admin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if (
        not current_user.is_platform_admin
        and not current_user.is_admin
        and not has_role(db, current_user, "librarian")
        and not has_role(db, current_user, "head_library")
        and not has_role(db, current_user, "system_admin")
        and not has_role(db, current_user, "deputy_rector")
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def get_current_librarian(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if not has_role(db, current_user, "librarian") and not has_role(db, current_user, "head_library"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Librarian access required")
    return current_user


def get_current_reviewer(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    if current_user.is_admin or current_user.is_platform_admin:
        return current_user
    reviewer_roles = {
        "system_admin",
        "deputy_rector",
        "dean",
        "lecturer",
        "project_supervisor",
        "librarian",
        "head_library",
        "project_coordinator",
        "hod",
        "external_examiner",
    }
    if not any(has_role(db, current_user, role) for role in reviewer_roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviewer access required")
    return current_user


def require_role(required_role: str):
    """Dependency to require a specific role."""
    def check_role(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if current_user.is_platform_admin:
            return current_user
        if not has_role(db, current_user, required_role):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"{required_role} access required")
        return current_user
    return check_role


def require_any_role(*roles: str):
    """Dependency to require any of the specified roles."""
    def check_roles(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if current_user.is_platform_admin:
            return current_user
        if not any(has_role(db, current_user, role) for role in roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return check_roles


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        # Still set public tenant scope if resolvable
        try:
            resolve_public_tenant(request, db)
        except HTTPException:
            pass
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        return get_current_user(request=request, token=token, db=db)
    except HTTPException as exc:
        # Propagate explicit cross-tenant 403 denials instead of silently swallowing
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise
        return None
    except Exception:
        return None
