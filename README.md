# Multi-School Thesis Repository Cloud Platform

A multi-tenant Software-as-a-Service (SaaS) academic thesis repository platform evolved from the GIMPA Thesis Repository. One centrally hosted FastAPI + React cloud application serves multiple universities and colleges—giving each approved institution its own unique web address (`/<slug>` or custom domain/subdomain), custom logo and accessible colour branding, and strictly isolated users, departments, theses, files, PhD Hub records, and administration.

## Key Capabilities

- **Institution Onboarding & Approval Workflow (`/onboard`, `/platform`)**:
  - Public onboarding wizard with live slug availability checking, contact & initial administrator capture, logo upload (PNG/JPEG/WEBP/SVG <= 2 MB), colour pickers + preset palettes, WCAG 2.1 contrast auditing, live workspace preview, and reset-to-default.
  - Platform Operator Console (`/platform`) to review pending applications, approve & provision workspaces (initial `system_admin` account, temporary password, starter departments, welcome email), reject, suspend/reactivate, and inspect platform health & audit logs.
- **Dedicated Institution Links & Dynamic Branding (`/<slug>`)**:
  - Path-based tenant routing (`/<slug>`, `/<slug>/login`, `/<slug>/signup`, `/<slug>/submit-proposal`, `/<slug>/paper/:id`, `/<slug>/editor`) plus `Host`-based subdomain and custom domain resolution.
  - Dynamic per-institution CSS variable theming (light & dark modes) loaded from each tenant's database settings—one institution's branding never affects another.
  - In-workspace **Branding & Settings** tab for institution administrators to update logo, colours, academic year, email domains, departments, audit logs, and JSON data export.
- **Strict Multi-Tenant Data & File Isolation**:
  - `institution_id` foreign keys across all tenant-owned tables (`users`, `students`, `departments`, `schools`, `papers`, `theses`, `notifications`, and all 6 `phd_*` tables) backed by Alembic migration `9f8e7d6c5b4a`.
  - Automatic SQLAlchemy 2.0 `do_orm_execute` + `before_flush` session-level tenant scoping (`app/db/tenant_scoping.py`) plus server-authoritative tenant checks rejecting spoofed headers (`X-Tenant-Slug`) or cross-tenant logins with `403 Forbidden`.
  - Tenant-partitioned private file storage (`uploads/tenants/tenant_<id>/...` or private S3 object storage via `STORAGE_BACKEND=s3`) and tenant-bound HMAC tokens for OnlyOffice callbacks.

## Quick Start (Local Development)

### 1. Backend (FastAPI + SQLAlchemy + Alembic)

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
python scripts/seed_multi_tenant_demo.py
uvicorn app.main:app --reload --port 8011
```

### 2. Frontend (React Router v7 + Vite + Tailwind)

```bash
cd frontend
npm ci
npm run dev
```

Visit:
- Central Multi-School Directory: `http://localhost:5173/`
- GIMPA Pilot Workspace: `http://localhost:5173/gimpa`
- Institution Onboarding & Branding Wizard: `http://localhost:5173/onboard`
- Platform Operator Console: `http://localhost:5173/platform`

## Cloud Deployment & Operations

See [MULTI_TENANT_DEPLOYMENT_GUIDE.md](MULTI_TENANT_DEPLOYMENT_GUIDE.md) for Docker Compose cloud deployment (`docker-compose.cloud.yml`), HTTPS reverse proxy (`deploy/nginx/multi-tenant.conf`), private S3 storage, and automated backups (`scripts/backup_and_restore.py`).

## Automated Cross-Tenant Security Tests

```bash
python -m unittest -v tests/test_multi_tenant_isolation.py
```
