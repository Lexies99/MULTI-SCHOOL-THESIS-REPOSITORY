# Multi-School Thesis Repository Cloud Application — Architecture & Deployment Guide

This platform upgrades the GIMPA Thesis Repository into a **multi-tenant Software-as-a-Service (SaaS)** cloud application where multiple universities and colleges share centrally hosted infrastructure while operating in strictly isolated, custom-branded workspaces.

---

## 1. Multi-Tenant Architecture Overview

| Layer | Implementation |
| --- | --- |
| **Tenant Model** | Extended `institutions` table (`app/models/institution.py`) storing official name, short display name, unique URL `slug`, optional `custom_domain`, approval lifecycle (`pending`, `approved`, `rejected`, `suspended`), validated HEX branding palette (`primary_color`, `secondary_color`, `accent_color`, `neutral_color`, `default_theme`), uploaded logo metadata, allowed email domains, and academic year. |
| **Row-Level Data Isolation** | Every tenant-owned model (`users`, `students`, `departments`, `schools`, `papers`, `theses`, `notifications`, and all 6 `phd_*` tables) carries an indexed `institution_id`. SQLAlchemy 2.0 `do_orm_execute` + `before_flush` hooks (`app/db/tenant_scoping.py`) bound to `session.info["tenant_id"]` enforce automatic read scoping, write stamping, and cross-tenant write blocking. |
| **Authoritative Tenant Resolution** | Authenticated requests lock tenant scope to the verified user's `user.institution_id` (and reject spoofed `X-Tenant-Slug` headers or cross-tenant URLs with `403 Forbidden`). Public routes resolve from URL path (`/:tenantSlug`), `X-Tenant-Slug`, or `Host` subdomain/`custom_domain`. |
| **File & Document Security** | Tenant-partitioned private storage (`app/services/storage_service.py`) supporting both private local storage (`uploads/tenants/tenant_<id>/...`) and private S3-compatible object storage (`STORAGE_BACKEND=s3`). OnlyOffice document fetch and callback URLs use HMAC tokens embedding `institution_id`. |
| **School Branding & Accessibility** | Real-time WCAG 2.1 contrast checking (both client-side in `frontend/app/lib/branding.ts` and server-side in `app/core/tenant.py`), dynamic CSS custom property injection per workspace (`TenantContext`), Light/Dark mode support, curated presets, live workspace preview, and Reset-to-Default. |
| **Platform Operations & Audit** | Dedicated Platform Administration Console (`/platform`) for `platform_admin` operators to approve/reject onboarding applications, provision initial school admin credentials & starter departments, suspend/reactivate tenants, monitor health, and inspect `tenant_audit_logs`. |

---

## 2. School Onboarding & Provisioning Flow

1. **Central Directory (`/`)** — Visitors browse approved institutions or click **Register Institution**.
2. **Onboarding & Branding Wizard (`/onboard`)** — A school representative enters official name, short display name, preferred URL slug (checked in real time against reserved/taken slugs), contact details, initial administrator details, allowed email domains, uploads a logo (PNG/JPEG/WEBP/SVG <= 2 MB), picks primary/secondary/accent/neutral colours with live preview & WCAG contrast check, and submits.
3. **Platform Review & Approval (`/platform`)** — A platform operator inspects the pending request and clicks **Approve**. The backend atomically:
   - Marks the institution `approved` and active.
   - Provisions the initial `system_admin` account with a secure temporary password (`must_change_password=True`).
   - Seeds starter department(s) and records an entry in `tenant_audit_logs`.
   - Emails the institution's unique workspace link (`https://<host>/<slug>` and `https://<host>/<slug>/login`) and credentials.
4. **Institution Workspace (`/<slug>`)** — The school admin signs in, changes their initial password, customizes branding/logo/departments anytime under **Branding & Settings**, imports students & faculty, and runs the full 5-phase thesis workflow and PhD Hub.

---

## 3. Cloud Deployment (Docker + HTTPS + Private S3 Storage)

1. Copy `.env.example` to `.env` and set strong production secrets (`SECRET_KEY`, `POSTGRES_PASSWORD`, `PLATFORM_ADMIN_PASSWORD`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, SMTP credentials).
2. Mount valid TLS certificates (`fullchain.pem`, `privkey.pem`) into `./deploy/certs/`.
3. Launch the full stack:
   ```bash
   docker compose -f docker-compose.cloud.yml up -d --build
   ```
4. Verify health:
   ```bash
   curl -fsS https://your-domain.com/api/health
   ```

---

## 4. Backups, Recovery & Verification

Create a verified snapshot of the database and tenant uploads:
```bash
python scripts/backup_and_restore.py backup --output-dir ./backups
python scripts/backup_and_restore.py verify --backup-dir ./backups/backup_<timestamp>
```
Run the automated cross-tenant security & isolation test suite before every release:
```bash
python -m unittest -v tests/test_multi_tenant_isolation.py
```
