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

            # 2. GIMPA Pilot Departments & Demo Institution Admin
            gimpa = get_institution_by_slug(db, "gimpa")
            if gimpa:
                ensure_default_departments(db, institution_id=gimpa.id)
                gimpa_admin = db.query(User).filter(User.email == "admin@gimpa.edu.gh").first()
                if not gimpa_admin:
                    gimpa_admin = User(
                        institution_id=gimpa.id,
                        email="admin@gimpa.edu.gh",
                        school_id="GIMPA-ADMIN-001",
                        school="GIMPA",
                        full_name="GIMPA Repository Admin",
                        department="Administration",
                        hashed_password=hash_password("GimpaAdmin#2026"),
                        is_active=True,
                        is_admin=True,
                        is_platform_admin=False,
                        role="system_admin",
                        must_change_password=False,
                    )
                    db.add(gimpa_admin)
                    db.flush()
                    db.add(UserRole(user_id=gimpa_admin.id, role="system_admin"))
                    db.commit()
                    print("Created GIMPA Admin: admin@gimpa.edu.gh / GimpaAdmin#2026")
                print(f"Verified GIMPA pilot tenant: /gimpa (id={gimpa.id})")

            # 3. Second Pilot Institution (University of Ghana) with distinct UG Colleges, Departments & Programs
            from app.models.department import Department
            from app.schemas.institution import InitialDepartmentInput, InitialFacultyInput
            from app.services.department_service import serialize_programs

            ug_structure = [
                InitialFacultyInput(
                    faculty_name="College of Basic and Applied Sciences",
                    departments=[
                        InitialDepartmentInput(name="Computer Science", programs=["BSc Computer Science", "MSc Computer Science", "PhD Computer Science"]),
                        InitialDepartmentInput(name="Mathematics", programs=["BSc Mathematics", "MPhil Mathematics"]),
                        InitialDepartmentInput(name="Biochemistry, Cell & Molecular Biology", programs=["BSc Biochemistry", "MPhil Molecular Biology"]),
                    ],
                ),
                InitialFacultyInput(
                    faculty_name="College of Humanities",
                    departments=[
                        InitialDepartmentInput(name="Political Science", programs=["BA Political Science", "MPhil Political Science", "PhD Political Science"]),
                        InitialDepartmentInput(name="Economics", programs=["BA Economics", "MPhil Economics"]),
                        InitialDepartmentInput(name="University of Ghana Business School", programs=["BSc Administration", "MBA Finance", "PhD Finance"]),
                    ],
                ),
                InitialFacultyInput(
                    faculty_name="School of Law",
                    departments=[
                        InitialDepartmentInput(name="Public & International Law", programs=["LLB Law", "LLM International Law"]),
                    ],
                ),
            ]

            ug = get_institution_by_slug(db, "ug-legon")
            if not ug:
                ug = submit_institution_onboarding(
                    db,
                    InstitutionOnboardRequest(
                        name="University of Ghana",
                        short_name="UG",
                        slug="ug-legon",
                        contact_name="Dean of Graduate Studies",
                        contact_email="sgs@ug.edu.gh",
                        website="https://www.ug.edu.gh",
                        address="Legon, Accra, Ghana",
                        allowed_email_domains="ug.edu.gh",
                        academic_year="2025/2026",
                        admin_full_name="UG Repository Admin",
                        admin_email="admin@ug.edu.gh",
                        initial_structure=ug_structure,
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
                )
                print(f"Provisioned UG tenant at /ug-legon | Admin: admin@ug.edu.gh | Temp Password: {temp_pass}")
            else:
                # Ensure UG's colleges/departments/programs are populated cleanly
                for fac in ug_structure:
                    for dept_in in fac.departments:
                        existing = (
                            db.query(Department)
                            .filter(Department.institution_id == ug.id, Department.name == dept_in.name)
                            .first()
                        )
                        if existing:
                            existing.faculty_name = fac.faculty_name
                            if not existing.programs:
                                existing.programs = serialize_programs(dept_in.programs)
                            db.add(existing)
                        else:
                            db.add(
                                Department(
                                    institution_id=ug.id,
                                    faculty_name=fac.faculty_name,
                                    name=dept_in.name,
                                    programs=serialize_programs(dept_in.programs),
                                )
                            )
                db.commit()
                print(f"Verified UG pilot tenant & colleges: /ug-legon (id={ug.id})")
        finally:
            db.close()


if __name__ == "__main__":
    seed()
