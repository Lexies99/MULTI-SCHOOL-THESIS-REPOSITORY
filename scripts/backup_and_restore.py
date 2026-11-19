#!/usr/bin/env python3
"""
Automated Multi-Tenant Cloud Backup & Recovery Utility.

Creates timestamped backups of:
  1. Relational database (PostgreSQL pg_dump or SQLite online backup)
  2. Private tenant uploads directory (uploads/tenants)
  3. SHA-256 verification manifest

Usage:
  python scripts/backup_and_restore.py backup --output-dir ./backups
  python scripts/backup_and_restore.py verify --backup-dir ./backups/<timestamp>
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile

from app.core.config import settings


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def run_backup(output_dir: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    dest = (output_dir / f"backup_{stamp}").resolve()
    dest.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, object] = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "database_backend": "sqlite" if "sqlite" in settings.database_url else "postgresql",
        "files": {},
    }

    # 1. Database backup
    if "sqlite" in settings.database_url:
        db_file = Path(settings.database_url.replace("sqlite:///", "")).resolve()
        if db_file.exists():
            db_backup = dest / "database.sqlite3"
            with sqlite3.connect(str(db_file)) as src, sqlite3.connect(str(db_backup)) as dst:
                src.backup(dst)
            manifest["files"]["database.sqlite3"] = _sha256(db_backup)  # type: ignore[index]
    else:
        pg_dump = shutil.which("pg_dump")
        if not pg_dump:
            raise RuntimeError("pg_dump binary not found on PATH for PostgreSQL backup")
        db_backup = dest / "database.sql.gz"
        pg_url = settings.database_url.replace("postgresql+psycopg://", "postgresql://")
        subprocess.run([pg_dump, "--format=custom", "--file", str(db_backup), pg_url], check=True)
        manifest["files"]["database.sql.gz"] = _sha256(db_backup)  # type: ignore[index]

    # 2. Private tenant uploads archive
    uploads_dir = Path(settings.local_storage_dir) if settings.local_storage_dir else (Path(__file__).resolve().parents[1] / "uploads")
    if uploads_dir.exists():
        archive_path = dest / "tenant_uploads.tar.gz"
        with tarfile.open(archive_path, "w:gz") as tar:
            tar.add(uploads_dir, arcname="uploads")
        manifest["files"]["tenant_uploads.tar.gz"] = _sha256(archive_path)  # type: ignore[index]

    manifest_path = dest / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Backup created successfully at: {dest}")
    return dest


def verify_backup(backup_dir: Path) -> None:
    manifest_path = backup_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing manifest.json in {backup_dir}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for filename, expected_hash in manifest.get("files", {}).items():
        fpath = backup_dir / filename
        if not fpath.exists():
            raise FileNotFoundError(f"Backup artifact missing: {fpath}")
        actual_hash = _sha256(fpath)
        if actual_hash != expected_hash:
            raise ValueError(f"Checksum mismatch for {filename}: expected {expected_hash}, got {actual_hash}")
        print(f"VERIFIED OK: {filename} ({actual_hash[:16]}...)")
    print("All backup artifacts passed SHA-256 integrity verification.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Multi-School Thesis Repository Backup & Verification Tool")
    sub = parser.add_subparsers(dest="command", required=True)

    b = sub.add_parser("backup", help="Create a verified backup snapshot")
    b.add_argument("--output-dir", default="./backups", help="Directory to store backup snapshots")

    v = sub.add_parser("verify", help="Verify checksum integrity of a backup snapshot")
    v.add_argument("--backup-dir", required=True, help="Path to backup_<timestamp> directory")

    args = parser.parse_args()
    if args.command == "backup":
        run_backup(Path(args.output_dir))
    elif args.command == "verify":
        verify_backup(Path(args.backup_dir))


if __name__ == "__main__":
    main()
