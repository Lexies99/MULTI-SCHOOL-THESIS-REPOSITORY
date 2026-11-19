from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.tenant import reset_tenant_context, set_tenant_context
from app.db.migrations import (
    ensure_correction_columns,
    ensure_default_gimpa_tenant,
    ensure_examination_results_table,
    ensure_multi_tenant_schema,
    ensure_paper_audit_tables,
    ensure_paper_workflow_columns,
    ensure_student_extended_columns,
    ensure_user_department_column,
    ensure_user_must_change_password_column,
    ensure_user_role_column,
    ensure_user_school_column,
    ensure_user_school_id_column,
)


def create_app() -> FastAPI:
    from app.db.session import engine
    from app.models.base import Base
    import app.models.department
    import app.models.department_supervisor
    import app.models.institution
    import app.models.notification
    import app.models.paper
    import app.models.paper_workflow
    import app.models.phd_system
    import app.models.refresh_token
    import app.models.student
    import app.models.tag
    import app.models.thesis_system
    import app.models.user
    import app.models.user_role

    Base.metadata.create_all(bind=engine)
    ensure_user_role_column()
    ensure_user_department_column()
    ensure_user_school_id_column()
    ensure_user_school_column()
    ensure_user_must_change_password_column()
    ensure_student_extended_columns()
    ensure_paper_workflow_columns()
    ensure_paper_audit_tables()
    ensure_correction_columns()
    ensure_examination_results_table()
    ensure_multi_tenant_schema()
    ensure_default_gimpa_tenant()

    app = FastAPI(title=settings.app_name)

    @app.middleware("http")
    async def tenant_context_lifecycle_middleware(request: Request, call_next):
        tokens = set_tenant_context(None, None, bypass=False)
        try:
            return await call_next(request)
        except PermissionError as exc:
            return JSONResponse(status_code=403, content={"detail": str(exc)})
        finally:
            reset_tenant_context(tokens)

    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
        "http://localhost:8011",
        "http://127.0.0.1:8011",
        "null",
    ]
    if settings.public_frontend_url:
        origins.append(settings.public_frontend_url.rstrip("/"))
    if settings.cors_allow_origins:
        origins.extend([o.strip().rstrip("/") for o in settings.cors_allow_origins.split(",") if o.strip()])

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(dict.fromkeys(origins)),
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
