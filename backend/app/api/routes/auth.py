from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import _extract_requested_tenant, get_db, resolve_public_tenant
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_access_token
from app.core.tenant import scoped_tenant, tenant_bypass
from app.models.institution import Institution
from app.schemas.token import RefreshToken, SsoSyncPasswordRequest, SsoVerifyRequest, SsoVerifyResponse, Token
from app.schemas.user import UserCreate, UserRead
from app.services.institution_service import (
    get_default_institution,
    is_email_allowed_for_institution,
)
from app.services.notification_service import create_notification
from app.services.refresh_token_service import (
    create_refresh_token_record,
    get_refresh_token,
    is_refresh_token_valid,
    revoke_refresh_token,
)
from app.services.user_service import (
    authenticate_user,
    create_user,
    get_user_by_email,
    get_user_by_school_id,
    get_user_roles,
    list_users,
)

router = APIRouter()


def _attach_institution_meta(db: Session, user, response: UserRead) -> UserRead:
    response.roles = get_user_roles(db, user.id)
    response.is_platform_admin = bool(getattr(user, "is_platform_admin", False))
    response.institution_id = getattr(user, "institution_id", None)
    if response.institution_id:
        with tenant_bypass():
            inst = db.query(Institution).filter(Institution.id == response.institution_id).first()
            if inst:
                response.institution_slug = inst.slug
                response.institution_name = inst.name
    return response


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(
    payload: UserCreate,
    request: Request,
    tenant: Institution = Depends(resolve_public_tenant),
    db: Session = Depends(get_db),
) -> UserRead:
    if payload.role in {"student", "member"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Students do not need accounts. Import student records via CSV/XLSX instead.",
        )
    allowed = {item.strip().lower() for item in settings.self_registration_roles.split(",") if item.strip()}
    if payload.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Self-registration for role '{payload.role}' is not allowed. "
                "Please ask an administrator or import accounts via the admin import tool."
            ),
        )
    if not is_email_allowed_for_institution(payload.email, tenant):
        allowed_label = tenant.allowed_email_domains or "institutional domains"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only {tenant.short_name or tenant.name} email addresses are allowed ({allowed_label})",
        )

    with tenant_bypass():
        existing = get_user_by_email(db, payload.email)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
        if payload.school_id and get_user_by_school_id(db, payload.school_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="School ID already registered")

    try:
        user = create_user(
            db=db,
            email=payload.email,
            role=payload.role,
            school_id=payload.school_id,
            school=payload.school,
            password=payload.password,
            full_name=payload.full_name,
            department=payload.department,
            institution_id=tenant.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    with scoped_tenant(tenant.id, tenant.slug):
        librarians = list_users(db, limit=200, is_active=True, role="librarian")
        admins = list_users(db, limit=200, is_active=True, role="system_admin")
        recipients = {u.id: u for u in [*librarians, *admins]}.values()
        for recipient in recipients:
            create_notification(
                db,
                user_id=recipient.id,
                ntype="account_activation_required",
                message=(
                    f"A new account requires activation for {tenant.short_name or tenant.name}.\n"
                    f"User email: {user.email}\n"
                    "Please review and activate the account from the Administration panel."
                ),
            )

    response = UserRead.model_validate(user)
    return _attach_institution_meta(db, user, response)


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    with tenant_bypass():
        requested_inst = _extract_requested_tenant(request, db)
        user = authenticate_user(db, form_data.username, form_data.password)
        if not user:
            existing_user = get_user_by_email(db, form_data.username)
            if existing_user and not existing_user.is_active:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is pending administrator activation")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        user_inst: Institution | None = None
        if user.institution_id is not None:
            user_inst = db.query(Institution).filter(Institution.id == user.institution_id).first()

        if not user.is_platform_admin:
            if not user_inst:
                user_inst = get_default_institution(db)
                if user_inst:
                    user.institution_id = user_inst.id
                    db.add(user)
                    db.commit()
                    db.refresh(user)
            if not user_inst or user_inst.status != "approved" or not user_inst.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your institution workspace is inactive, pending approval, or suspended.",
                )
            if requested_inst is not None and requested_inst.id != user_inst.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"This account does not belong to {requested_inst.short_name or requested_inst.name}. Please sign in through your own institution link.",
                )

        access_token = create_access_token(
            subject=user.email,
            institution_id=user.institution_id,
            institution_slug=user_inst.slug if user_inst else None,
            is_platform_admin=bool(user.is_platform_admin),
        )
        refresh_token, jti, expires_at = create_refresh_token(
            subject=user.email,
            institution_id=user.institution_id,
        )
        create_refresh_token_record(db, user.id, jti, expires_at)
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            must_change_password=bool(user.must_change_password),
        )


@router.post("/refresh", response_model=Token)
def refresh(payload: RefreshToken, db: Session = Depends(get_db)) -> Token:
    decoded = decode_access_token(payload.refresh_token, expected_type="refresh")
    if not decoded or "sub" not in decoded or "jti" not in decoded:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    with tenant_bypass():
        record = get_refresh_token(db, decoded["jti"])
        if not record or not is_refresh_token_valid(record):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        user = get_user_by_email(db, decoded["sub"])
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

        user_inst: Institution | None = None
        if user.institution_id is not None:
            user_inst = db.query(Institution).filter(Institution.id == user.institution_id).first()
            if not user.is_platform_admin and (not user_inst or user_inst.status != "approved" or not user_inst.is_active):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Institution workspace is inactive")

        revoke_refresh_token(db, record)
        access_token = create_access_token(
            subject=user.email,
            institution_id=user.institution_id,
            institution_slug=user_inst.slug if user_inst else None,
            is_platform_admin=bool(user.is_platform_admin),
        )
        refresh_token, jti, expires_at = create_refresh_token(
            subject=user.email,
            institution_id=user.institution_id,
        )
        create_refresh_token_record(db, user.id, jti, expires_at)
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            must_change_password=bool(user.must_change_password),
        )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshToken, db: Session = Depends(get_db)) -> Response:
    decoded = decode_access_token(payload.refresh_token, expected_type="refresh")
    if not decoded or "jti" not in decoded:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    with tenant_bypass():
        record = get_refresh_token(db, decoded["jti"])
        if record:
            revoke_refresh_token(db, record)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sso/verify-credentials", response_model=SsoVerifyResponse)
def sso_verify_credentials(payload: SsoVerifyRequest, db: Session = Depends(get_db)) -> SsoVerifyResponse:
    with tenant_bypass():
        identifier = payload.identifier.strip()
        user = authenticate_user(db, identifier, payload.password)
        if not user and "@" not in identifier:
            u = get_user_by_school_id(db, identifier)
            if u and authenticate_user(db, u.email, payload.password):
                user = u

        if not user:
            return SsoVerifyResponse(
                authenticated=False,
                message="Invalid credentials or incorrect password.",
                user=None,
                access_token=None,
            )

        if not user.is_active:
            return SsoVerifyResponse(
                authenticated=False,
                message="Account is inactive or pending administrator activation.",
                user=None,
                access_token=None,
            )

        roles = get_user_roles(db, user.id)
        user_inst = db.query(Institution).filter(Institution.id == user.institution_id).first() if user.institution_id else None
        access_token = create_access_token(
            subject=user.email,
            institution_id=user.institution_id,
            institution_slug=user_inst.slug if user_inst else None,
            is_platform_admin=bool(user.is_platform_admin),
        )

        return SsoVerifyResponse(
            authenticated=True,
            message="Authentication successful.",
            user={
                "id": user.id,
                "institution_id": user.institution_id,
                "institution_slug": user_inst.slug if user_inst else None,
                "email": user.email,
                "full_name": user.full_name or user.email.split("@")[0],
                "school_id": user.school_id,
                "role": user.role,
                "roles": roles,
                "is_admin": bool(user.is_admin or "system_admin" in roles),
                "is_platform_admin": bool(user.is_platform_admin),
                "department": user.department,
                "school": user.school,
                "program": user.program,
                "must_change_password": bool(user.must_change_password),
                "password_hash": user.hashed_password,
            },
            access_token=access_token,
        )


@router.post("/sso/sync-password")
def sso_sync_password(payload: SsoSyncPasswordRequest, db: Session = Depends(get_db)):
    from app.core.security import get_password_hash, verify_password
    from app.services.user_service import validate_password_requirements

    with tenant_bypass():
        email = payload.email.strip().lower()
        user = get_user_by_email(db, email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found in Central Identity Provider.")

        if payload.old_password:
            if not verify_password(payload.old_password, user.hashed_password):
                raise HTTPException(status_code=400, detail="Current password verification failed.")

        validate_password_requirements(payload.new_password)
        user.hashed_password = get_password_hash(payload.new_password)
        user.must_change_password = False
        db.add(user)
        db.commit()
        db.refresh(user)
        return {"status": "success", "message": f"Central password synchronized for {user.email}."}
