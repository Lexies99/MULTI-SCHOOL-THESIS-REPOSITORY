from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": settings.app_name,
        "multi_tenant": True,
        "storage_backend": settings.storage_backend,
    }
