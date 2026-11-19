#!/usr/bin/env python3
"""
Seed a Multi-Tenant Pilot Environment:
  1. Platform Operator account (platform-admin@thesiscloud.org / PlatformAdmin#2026)
  2. GIMPA Pilot Tenant (/gimpa) with default faculties & departments
  3. Demo Second Institution: University of Ghana (/ug) with distinct Navy & Gold branding

Safe to run multiple times (idempotent).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.security import hash_password
from app.core.tenant import tenant_bypass
from app.db.migrations import ensure_default_gimpa_tenant, ensure_multi_tenant_schema
from app.db.session import SessionLocal
from app.main import create_app
from app.models.institution import Institution
from app.models.user import User
from app.models.user_role import UserRole
from app.schemas.institution import InstitutionOnboardRequest
from app.services.department_service import ensure_default_departments
from app.services.institution_service import approve_institution, get_institution_by_slug, submit_institution_onboarding


def seed() -> None:
    create_app()
    ensure_multi_tenant_schema()
    ensure_default_gimpa_tenant()

    with tenant_bypass():
        db = SessionLocal()
        try:
            # 1. Platform Operator
            op_email = "platform-admin@thesiscloud.org"
            operator = db.query(User).filter(User.email == op_email).first()
            if not operator:
                operator = User(
                    institution_id=None,
                    email=op_email,
                    full_name="Platform Operator",
                    hashed_password=hash_password("PlatformAdmin#2026"),
                    is_active=True,
                    is_admin=True,
                    is_platform_admin=True,
                    role="system_admin",
                    must_change_password=False,
                )
                db.add(operator)
                db.flush()
                db.add(UserRole(user_id=operator.id, role="system_admin"))
                db.commit()
                db.refresh(operator)
                print(f"Created Platform Operator: {op_email} / PlatformAdmin#2026")
            else:
                print(f"Platform Operator already exists: {op_email}")

            # 2. GIMPA Pilot Departments
            gimpa = get_institution_by_slug(db, "gimpa")
            if gimpa:
                ensure_default_departments(db, institution_id=gimpa.id)
                print(f"Verified GIMPA pilot tenant: /gimpa (id={gimpa.id})")

            # 3. Second Pilot Institution (University of Ghana)
            ug = get_institution_by_slug(db, "ug")
            if not ug:
                ug = submit_institution_onboarding(
                    db,
                    InstitutionOnboardRequest(
                        name="University of Ghana",
                        short_name="UG",
                        slug="ug",
                        contact_name="Dean of Graduate Studies",
                        contact_email="sgs@ug.edu.gh",
                        website="https://www.ug.edu.gh",
                        address="Legon, Accra, Ghana",
                        allowed_email_domains="ug.edu.gh",
                        academic_year="2025/2026",
                        admin_full_name="UG Repository Admin",
                        admin_email="admin@ug.edu.gh",
                        primary_color="#17365D",
                        secondary_color="#D9E4F2",
                        accent_color="#9A6B12",
                        neutral_color="#F8FAFC",
                        default_theme="light",
                    ),
                )
                ug, temp_pass, _ = approve_institution(
                    db,
                    ug.id,
                    actor=operator,
                    approval_notes="Pilot institution provisioned",
                    initial_departments=["Computer Science", "Political Science", "Economics"],
                )
                print(f"Provisioned UG tenant at /ug | Admin: admin@ug.edu.gh | Temp Password: {temp_pass}")
            else:
                print(f"UG pilot tenant already exists: /ug (id={ug.id})")
        finally:
            db.close()


if __name__ == "__main__":
    seed()
