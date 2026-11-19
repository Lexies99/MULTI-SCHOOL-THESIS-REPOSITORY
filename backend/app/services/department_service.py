from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.tenant import current_tenant_id, tenant_bypass
from app.models.department import Department
from app.models.department_supervisor import DepartmentSupervisor
from app.models.institution import Institution
from app.models.user import User
from app.services.user_service import assign_role, has_role


GIMPA_DEFAULT_SCHOOLS_AND_DEPARTMENTS: dict[str, list[str]] = {
    "GIMPA Business School": [
        "Accounting and Finance",
        "Business Management",
        "Management Science",
    ],
    "School of Public Service and Governance": [
        "Development Policy",
        "Public Management & International Relations",
    ],
    "Faculty of Law": [
        "Law",
    ],
    "School of Technology and Social Sciences (SOTSS)": [
        "Computer Science and Information Systems",
        "Economics and Applied Mathematics",
        "Liberal Arts and Hospitality Studies",
    ],
}


def ensure_default_departments(db: Session, institution_id: int | None = None) -> list[Department]:
    """Ensures default departments exist for the target tenant (GIMPA defaults for GIMPA tenant)."""
    target_tid = institution_id or current_tenant_id.get()
    with tenant_bypass():
        if target_tid is not None:
            tenant = db.query(Institution).filter(Institution.id == target_tid).first()
        else:
            tenant = db.query(Institution).filter(func.lower(Institution.slug) == "gimpa").first()
    if not tenant:
        return []

    if (tenant.slug or "").lower() == "gimpa":
        for faculty_name, department_names in GIMPA_DEFAULT_SCHOOLS_AND_DEPARTMENTS.items():
            for department_name in department_names:
                dept = (
                    db.query(Department)
                    .filter(
                        Department.institution_id == tenant.id,
                        func.lower(Department.name) == department_name.strip().lower(),
                    )
                    .first()
                )
                if not dept:
                    dept = Department(
                        institution_id=tenant.id,
                        faculty_name=faculty_name.strip(),
                        name=department_name.strip(),
                    )
                    db.add(dept)
                    db.flush()
                elif not dept.faculty_name:
                    dept.faculty_name = faculty_name.strip()
                    db.add(dept)

    # Auto-link Deans within this tenant who have role 'dean' and matching faculty/school
    deans = (
        db.query(User)
        .filter(User.institution_id == tenant.id, User.role == "dean")
        .all()
    )
    for dean in deans:
        if dean.school:
            clean_school = dean.school.strip().lower()
            depts = db.query(Department).filter(Department.institution_id == tenant.id).all()
            for d in depts:
                fac = (d.faculty_name or "").strip().lower()
                if fac and (clean_school in fac or fac in clean_school):
                    if d.dean_user_id != dean.id:
                        d.dean_user_id = dean.id
                        db.add(d)

    db.commit()
    return db.query(Department).filter(Department.institution_id == tenant.id).order_by(Department.name).all()


def create_department_for_tenant(
    db: Session,
    *,
    institution_id: int,
    name: str,
    faculty_name: str | None = None,
    hod_user_id: int | None = None,
    dean_user_id: int | None = None,
) -> Department:
    clean_name = (name or "").strip()
    if not clean_name:
        raise ValueError("Department name is required")
    existing = (
        db.query(Department)
        .filter(
            Department.institution_id == institution_id,
            func.lower(Department.name) == clean_name.lower(),
        )
        .first()
    )
    if existing:
        raise ValueError(f"Department '{clean_name}' already exists in this institution")

    dept = Department(
        institution_id=institution_id,
        faculty_name=(faculty_name or "").strip() or None,
        name=clean_name,
        hod_user_id=hod_user_id,
        dean_user_id=dean_user_id,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


def assign_hod(db: Session, department_id: int, user_id: int, assigned_by_id: int | None = None) -> Department:
    """Assign a user as HOD for a department within the same institution."""
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise ValueError(f"Department {department_id} not found")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.institution_id != department.institution_id:
        raise ValueError(f"User {user_id} not found in this institution")

    if not has_role(db, user, "hod"):
        assign_role(db, user, "hod", assigned_by_id=assigned_by_id)

    if not user.department:
        user.department = department.name
        db.add(user)

    department.hod_user_id = user_id
    db.add(department)
    db.commit()
    db.refresh(department)
    return department


def assign_dean(db: Session, department_id: int, user_id: int, assigned_by_id: int | None = None) -> Department:
    """Assign a user as Dean for a faculty/school within the same institution."""
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise ValueError(f"Department {department_id} not found")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.institution_id != department.institution_id:
        raise ValueError(f"User {user_id} not found in this institution")

    if not has_role(db, user, "dean"):
        assign_role(db, user, "dean", assigned_by_id=assigned_by_id)

    faculty_label = department.faculty_name or (department.institution.name if getattr(department, "institution", None) else None)
    if faculty_label and not user.school:
        user.school = faculty_label
        db.add(user)

    query = db.query(Department).filter(Department.institution_id == department.institution_id)
    if department.faculty_name:
        query = query.filter(func.lower(Department.faculty_name) == department.faculty_name.strip().lower())
    for school_department in query.all():
        school_department.dean_user_id = user_id
        db.add(school_department)

    db.commit()
    db.refresh(department)
    return department


def add_department_supervisor(db: Session, department_id: int, supervisor_user_id: int) -> DepartmentSupervisor:
    """Add a project supervisor to a department within the same institution."""
    department = db.query(Department).filter(Department.id == department_id).first()
    if not department:
        raise ValueError(f"Department {department_id} not found")

    user = db.query(User).filter(User.id == supervisor_user_id).first()
    if not user or user.institution_id != department.institution_id:
        raise ValueError(f"User {supervisor_user_id} not found in this institution")

    if not has_role(db, user, "project_supervisor"):
        assign_role(db, user, "project_supervisor")

    existing = (
        db.query(DepartmentSupervisor)
        .filter(
            DepartmentSupervisor.department_id == department_id,
            DepartmentSupervisor.supervisor_user_id == supervisor_user_id,
        )
        .first()
    )

    if existing:
        if not existing.active:
            existing.active = True
            db.add(existing)
            db.commit()
            db.refresh(existing)
        return existing

    supervisor = DepartmentSupervisor(
        department_id=department_id,
        supervisor_user_id=supervisor_user_id,
        active=True,
    )
    db.add(supervisor)
    db.commit()
    db.refresh(supervisor)
    return supervisor


def remove_department_supervisor(db: Session, department_id: int, supervisor_user_id: int) -> None:
    supervisor = (
        db.query(DepartmentSupervisor)
        .filter(
            DepartmentSupervisor.department_id == department_id,
            DepartmentSupervisor.supervisor_user_id == supervisor_user_id,
        )
        .first()
    )

    if supervisor:
        supervisor.active = False
        db.add(supervisor)
        db.commit()


def get_department_supervisors(db: Session, department_id: int, active_only: bool = True) -> list[DepartmentSupervisor]:
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        return []
    query = db.query(DepartmentSupervisor).filter(DepartmentSupervisor.department_id == department_id)
    if active_only:
        query = query.filter(DepartmentSupervisor.active.is_(True))
    return query.all()


def get_department(db: Session, department_id: int) -> Department | None:
    return db.query(Department).filter(Department.id == department_id).first()


def list_departments(db: Session, institution_id: int | None = None) -> list[Department]:
    target_tid = institution_id or current_tenant_id.get()
    query = db.query(Department)
    if target_tid is not None:
        query = query.filter(Department.institution_id == target_tid)
        if query.count() == 0:
            ensure_default_departments(db, institution_id=target_tid)
            query = db.query(Department).filter(Department.institution_id == target_tid)
    elif db.query(Department).count() == 0:
        ensure_default_departments(db)

    return query.order_by(Department.name).all()
