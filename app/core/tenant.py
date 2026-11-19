from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
import re
from typing import Iterator

# Request-scoped tenant context
current_tenant_id: ContextVar[int | None] = ContextVar("current_tenant_id", default=None)
current_tenant_slug: ContextVar[str | None] = ContextVar("current_tenant_slug", default=None)
current_tenant_bypass: ContextVar[bool] = ContextVar("current_tenant_bypass", default=False)

HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$")

RESERVED_SLUGS: frozenset[str] = frozenset(
    {
        "api",
        "admin",
        "administrator",
        "app",
        "assets",
        "auth",
        "billing",
        "catalog",
        "docs",
        "editor",
        "favicon",
        "health",
        "help",
        "home",
        "institution",
        "institutions",
        "login",
        "logout",
        "onboard",
        "onboarding",
        "openapi",
        "paper",
        "papers",
        "platform",
        "portal",
        "public",
        "redoc",
        "register",
        "schools",
        "settings",
        "signup",
        "static",
        "status",
        "submit-proposal",
        "support",
        "system",
        "tenant",
        "tenants",
        "theses",
        "uploads",
        "www",
    }
)

DEFAULT_BRANDING = {
    "primary_color": "#5A6552",
    "secondary_color": "#DCE7D0",
    "accent_color": "#3B7A57",
    "neutral_color": "#FAFBF8",
    "default_theme": "light",
}


def set_tenant_context(
    tenant_id: int | None,
    tenant_slug: str | None = None,
    *,
    bypass: bool = False,
) -> tuple[Token, Token, Token]:
    t_id = current_tenant_id.set(tenant_id)
    t_slug = current_tenant_slug.set(tenant_slug)
    t_bypass = current_tenant_bypass.set(bypass)
    return t_id, t_slug, t_bypass


def reset_tenant_context(tokens: tuple[Token, Token, Token]) -> None:
    t_id, t_slug, t_bypass = tokens
    current_tenant_id.reset(t_id)
    current_tenant_slug.reset(t_slug)
    current_tenant_bypass.reset(t_bypass)


def set_session_tenant(
    db,
    tenant_id: int | None,
    tenant_slug: str | None = None,
    *,
    bypass: bool = False,
) -> None:
    """Attach authoritative tenant scope directly onto a SQLAlchemy Session (threadpool-safe)."""
    if db is not None and hasattr(db, "info"):
        db.info["tenant_id"] = tenant_id
        db.info["tenant_slug"] = tenant_slug
        db.info["tenant_bypass"] = bool(bypass)
    set_tenant_context(tenant_id, tenant_slug, bypass=bypass)


def get_effective_tenant_id(db=None) -> int | None:
    if db is not None and hasattr(db, "info") and "tenant_id" in db.info:
        return db.info.get("tenant_id")
    return current_tenant_id.get()


@contextmanager
def tenant_bypass(db=None) -> Iterator[None]:
    """Temporarily disable automatic ORM tenant scoping for trusted system/platform queries."""
    token = current_tenant_bypass.set(True)
    prev_db_bypass = None
    has_prev = False
    if db is not None and hasattr(db, "info"):
        has_prev = "tenant_bypass" in db.info
        prev_db_bypass = db.info.get("tenant_bypass")
        db.info["tenant_bypass"] = True
    try:
        yield
    finally:
        current_tenant_bypass.reset(token)
        if db is not None and hasattr(db, "info"):
            if has_prev:
                db.info["tenant_bypass"] = prev_db_bypass
            else:
                db.info.pop("tenant_bypass", None)


@contextmanager
def scoped_tenant(tenant_id: int | None, tenant_slug: str | None = None, db=None) -> Iterator[None]:
    """Run ORM operations strictly scoped to a specific tenant."""
    tokens = set_tenant_context(tenant_id, tenant_slug, bypass=False)
    prev_info = None
    if db is not None and hasattr(db, "info"):
        prev_info = (
            db.info.get("tenant_id"),
            db.info.get("tenant_slug"),
            db.info.get("tenant_bypass"),
            "tenant_id" in db.info,
        )
        db.info["tenant_id"] = tenant_id
        db.info["tenant_slug"] = tenant_slug
        db.info["tenant_bypass"] = False
    try:
        yield
    finally:
        reset_tenant_context(tokens)
        if db is not None and hasattr(db, "info") and prev_info is not None:
            old_tid, old_slug, old_bypass, had_tid = prev_info
            if had_tid:
                db.info["tenant_id"] = old_tid
                db.info["tenant_slug"] = old_slug
                db.info["tenant_bypass"] = old_bypass
            else:
                db.info.pop("tenant_id", None)
                db.info.pop("tenant_slug", None)
                db.info.pop("tenant_bypass", None)


def normalize_slug(raw: str) -> str:
    cleaned = re.sub(r"[^a-z0-9-]+", "-", (raw or "").strip().lower())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned


def validate_slug(slug: str) -> tuple[bool, str]:
    normalized = normalize_slug(slug)
    if not normalized:
        return False, "Institution URL slug is required."
    if len(normalized) < 3 or len(normalized) > 50:
        return False, "Institution URL slug must be between 3 and 50 characters."
    if not SLUG_RE.match(normalized):
        return False, "Slug may only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen."
    if normalized in RESERVED_SLUGS:
        return False, f"'{normalized}' is a reserved platform path. Please choose another web address."
    return True, normalized


def validate_hex_color(value: str | None, fallback: str) -> str:
    candidate = (value or "").strip()
    if not candidate:
        return fallback
    if not candidate.startswith("#"):
        candidate = f"#{candidate}"
    if not HEX_COLOR_RE.match(candidate):
        raise ValueError(f"Invalid HEX colour '{value}'. Expected 6-digit HEX format like #17365D.")
    return candidate.upper()


def _channel_luminance(channel_255: int) -> float:
    c = channel_255 / 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_color: str) -> float:
    cleaned = validate_hex_color(hex_color, "#000000").lstrip("#")
    r = int(cleaned[0:2], 16)
    g = int(cleaned[2:4], 16)
    b = int(cleaned[4:6], 16)
    return 0.2126 * _channel_luminance(r) + 0.7152 * _channel_luminance(g) + 0.0722 * _channel_luminance(b)


def contrast_ratio(hex_a: str, hex_b: str) -> float:
    lum_a = relative_luminance(hex_a)
    lum_b = relative_luminance(hex_b)
    lighter = max(lum_a, lum_b)
    darker = min(lum_a, lum_b)
    return round((lighter + 0.05) / (darker + 0.05), 2)


def recommended_text_color(bg_hex: str) -> str:
    white_ratio = contrast_ratio(bg_hex, "#FFFFFF")
    dark_ratio = contrast_ratio(bg_hex, "#1A1D1A")
    return "#FFFFFF" if white_ratio >= dark_ratio else "#1A1D1A"


def evaluate_branding_contrast(
    *,
    primary_color: str,
    secondary_color: str,
    accent_color: str,
    neutral_color: str = "#FAFBF8",
) -> dict[str, object]:
    """Compute WCAG 2.1 AA/AAA contrast compliance for an institution's selected palette."""
    primary_text = recommended_text_color(primary_color)
    secondary_text = recommended_text_color(secondary_color)
    accent_text = recommended_text_color(accent_color)

    primary_ratio = contrast_ratio(primary_color, primary_text)
    secondary_ratio = contrast_ratio(secondary_color, secondary_text)
    accent_ratio = contrast_ratio(accent_color, accent_text)
    primary_on_neutral = contrast_ratio(primary_color, neutral_color)

    warnings: list[str] = []
    if primary_ratio < 4.5:
        warnings.append(f"Primary colour {primary_color} has low text contrast ({primary_ratio}:1 < 4.5:1 WCAG AA).")
    if secondary_ratio < 4.5:
        warnings.append(f"Secondary colour {secondary_color} has low text contrast ({secondary_ratio}:1 < 4.5:1 WCAG AA).")
    if accent_ratio < 4.5:
        warnings.append(f"Accent colour {accent_color} has low text contrast ({accent_ratio}:1 < 4.5:1 WCAG AA).")

    return {
        "primary_text_color": primary_text,
        "primary_contrast_ratio": primary_ratio,
        "primary_passes_aa": primary_ratio >= 4.5,
        "secondary_text_color": secondary_text,
        "secondary_contrast_ratio": secondary_ratio,
        "secondary_passes_aa": secondary_ratio >= 4.5,
        "accent_text_color": accent_text,
        "accent_contrast_ratio": accent_ratio,
        "accent_passes_aa": accent_ratio >= 4.5,
        "primary_on_neutral_ratio": primary_on_neutral,
        "accessible": len(warnings) == 0,
        "warnings": warnings,
    }
