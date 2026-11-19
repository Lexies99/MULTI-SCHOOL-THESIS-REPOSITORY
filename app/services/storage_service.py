from __future__ import annotations

from pathlib import Path
import re
from uuid import uuid4

from app.core.config import settings

ALLOWED_LOGO_MIME_TYPES: dict[str, str] = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}

ALLOWED_LOGO_EXTENSIONS: set[str] = {".png", ".jpg", ".jpeg", ".webp", ".svg"}


def _base_uploads_root() -> Path:
    if settings.local_storage_dir:
        root = Path(settings.local_storage_dir).resolve()
    else:
        root = (Path(__file__).resolve().parents[2] / "uploads").resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def tenant_upload_dir(institution_id: int | None, category: str) -> Path:
    """Return a private, tenant-partitioned directory under uploads/tenants/{institution_id}/{category}."""
    safe_category = re.sub(r"[^a-z0-9_-]+", "_", (category or "files").lower()).strip("_") or "files"
    tenant_segment = f"tenant_{int(institution_id)}" if institution_id is not None else "shared"
    target = (_base_uploads_root() / "tenants" / tenant_segment / safe_category).resolve()
    root = _base_uploads_root()
    if root not in target.parents and target != root:
        raise ValueError("Invalid tenant storage path")
    target.mkdir(parents=True, exist_ok=True)
    return target


def sanitize_filename(filename: str | None, default_name: str = "file.bin") -> str:
    base = Path(filename or default_name).name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")
    return cleaned or default_name


def validate_logo_upload(filename: str | None, content_type: str | None, data: bytes) -> tuple[str, str]:
    """Validate uploaded institution logo type, extension, magic bytes, and size limit."""
    if not data:
        raise ValueError("Logo file is empty.")
    max_bytes = int(settings.max_logo_size_bytes or (2 * 1024 * 1024))
    if len(data) > max_bytes:
        max_mb = round(max_bytes / (1024 * 1024), 2)
        raise ValueError(f"Logo file exceeds maximum allowed size of {max_mb} MB.")

    ext = Path(filename or "").suffix.lower()
    mime = (content_type or "").split(";")[0].strip().lower()

    if mime and mime not in ALLOWED_LOGO_MIME_TYPES:
        raise ValueError("Unsupported logo image type. Allowed formats: PNG, JPEG, WEBP, SVG.")
    if ext and ext not in ALLOWED_LOGO_EXTENSIONS:
        raise ValueError("Unsupported logo file extension. Allowed formats: .png, .jpg, .jpeg, .webp, .svg.")

    # Basic signature checks to prevent arbitrary file disguise
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png", "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg", "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp", "image/webp"
    text_prefix = data[:512].decode("utf-8", errors="ignore").lower()
    if "<svg" in text_prefix:
        if "<script" in data.decode("utf-8", errors="ignore").lower():
            raise ValueError("SVG logos containing embedded <script> tags are forbidden.")
        return ".svg", "image/svg+xml"

    raise ValueError("Uploaded file is not a valid PNG, JPEG, WEBP, or SVG image.")


def save_tenant_bytes(
    *,
    institution_id: int | None,
    category: str,
    filename: str,
    data: bytes,
    content_type: str | None = None,
) -> str:
    """
    Save private tenant bytes into tenant-scoped storage.
    Uses private S3/cloud object storage when STORAGE_BACKEND=s3 is configured,
    otherwise uses private tenant-partitioned local storage.
    """
    safe_name = f"{uuid4().hex}_{sanitize_filename(filename)}"
    if (settings.storage_backend or "local").strip().lower() == "s3" and settings.s3_bucket:
        import boto3  # type: ignore

        key = f"{settings.s3_prefix.strip('/')}/tenant_{institution_id or 'shared'}/{category}/{safe_name}"
        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region or "us-east-1",
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
        )
        client.put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=data,
            ContentType=content_type or "application/octet-stream",
            ACL="private",
        )
        return f"s3://{settings.s3_bucket}/{key}"

    directory = tenant_upload_dir(institution_id, category)
    path = (directory / safe_name).resolve()
    if directory not in path.parents:
        raise ValueError("Path traversal detected")
    path.write_bytes(data)
    return str(path)


def read_tenant_bytes(storage_path: str) -> bytes | None:
    """Read raw bytes from local or S3 tenant storage."""
    if not storage_path:
        return None
    if storage_path.startswith("s3://"):
        import boto3  # type: ignore

        without_scheme = storage_path[len("s3://"):]
        bucket, _, key = without_scheme.partition("/")
        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region or "us-east-1",
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
        )
        obj = client.get_object(Bucket=bucket, Key=key)
        return obj["Body"].read()

    path = Path(storage_path)
    if not path.exists() or not path.is_file():
        return None
    return path.read_bytes()


def delete_tenant_object(storage_path: str | None) -> None:
    if not storage_path:
        return
    try:
        if storage_path.startswith("s3://"):
            import boto3  # type: ignore

            without_scheme = storage_path[len("s3://"):]
            bucket, _, key = without_scheme.partition("/")
            client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint_url or None,
                region_name=settings.s3_region or "us-east-1",
                aws_access_key_id=settings.s3_access_key_id or None,
                aws_secret_access_key=settings.s3_secret_access_key or None,
            )
            client.delete_object(Bucket=bucket, Key=key)
            return

        path = Path(storage_path)
        if path.exists() and path.is_file():
            path.unlink()
    except Exception:
        pass
