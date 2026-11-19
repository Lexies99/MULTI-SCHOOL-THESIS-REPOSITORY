from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE_PATH = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_FILE_PATH), extra="ignore")

    app_name: str = "Multi-School Thesis Repository Cloud API"
    env: str = "development"
    api_prefix: str = "/api"

    secret_key: str = "change-me-in-production-multi-school-thesis-secret"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    database_url: str = "sqlite:///./gimpa_thesis.db"
    allowed_email_domains: str = "gimpa.edu.gh"
    # Comma-separated list of roles allowed to self-register via the public signup endpoint
    self_registration_roles: str = "staff"

    # Multi-tenant SaaS & Cloud configuration
    default_tenant_slug: str = "gimpa"
    public_frontend_url: str = "http://localhost:5173"
    platform_base_domain: str | None = None  # e.g. "thesis.example.com" for subdomain routing
    auto_approve_institutions: bool = False
    max_logo_size_bytes: int = 2 * 1024 * 1024  # 2 MB
    cors_allow_origins: str = ""  # Optional comma-separated extra CORS origins

    # Initial Platform Operator bootstrap credentials (optional env override)
    platform_admin_email: str = "platform-admin@thesiscloud.org"
    platform_admin_password: str | None = None

    # Private object storage configuration ("local" or "s3")
    storage_backend: str = "local"
    local_storage_dir: str | None = None
    s3_bucket: str | None = None
    s3_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_prefix: str = "tenants"

    smtp_enabled: bool = False
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_from_email: str | None = None
    smtp_from_name: str = "Multi-School Thesis Repository"
    smtp_timeout_seconds: int = 30
    smtp_max_retries: int = 3
    smtp_retry_backoff_seconds: float = 1.5

    # OnlyOffice integration
    onlyoffice_doc_server_url: str | None = None
    # Publicly reachable backend base URL for OnlyOffice callbacks/file fetch
    public_api_base_url: str = "http://127.0.0.1:8011"
    # Optional dedicated callback base URL used by OnlyOffice server container.
    # Use this when browser and container need different backend hostnames.
    onlyoffice_callback_base_url: str | None = None


settings = Settings()
