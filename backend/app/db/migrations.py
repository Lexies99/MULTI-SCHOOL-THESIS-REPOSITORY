from __future__ import annotations

from sqlalchemy import inspect, text

from app.db.session import engine


def ensure_user_role_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "role" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'student'"))
        conn.execute(text("UPDATE users SET role = 'librarian' WHERE is_admin = true"))


def ensure_user_department_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "department" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN department VARCHAR(255)"))


def ensure_user_school_id_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "school_id" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN school_id VARCHAR(64)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_school_id ON users (school_id)"))


def ensure_user_school_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "school" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN school VARCHAR(255)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_school ON users (school)"))


def ensure_user_must_change_password_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("users")}
    if "must_change_password" in columns:
        return

    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false")
        )


def ensure_paper_workflow_columns() -> None:
    inspector = inspect(engine)
    if "papers" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("papers")}

    statements: list[str] = []
    if "abstract_word_count" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN abstract_word_count INTEGER")
    if "publication_type" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN publication_type VARCHAR(64) DEFAULT 'thesis'")
    if "lecturer_approved_by_id" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN lecturer_approved_by_id INTEGER")
    if "lecturer_approved_at" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN lecturer_approved_at TIMESTAMP WITH TIME ZONE")
    if "project_coordinator_approved_by_id" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN project_coordinator_approved_by_id INTEGER")
    if "project_coordinator_approved_at" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN project_coordinator_approved_at TIMESTAMP WITH TIME ZONE")
    if "hod_approved_by_id" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN hod_approved_by_id INTEGER")
    if "hod_approved_at" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN hod_approved_at TIMESTAMP WITH TIME ZONE")
    if "internal_result_file_path" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN internal_result_file_path VARCHAR(1024)")
    if "internal_result_file_name" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN internal_result_file_name VARCHAR(255)")
    if "external_result_file_path" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN external_result_file_path VARCHAR(1024)")
    if "external_result_file_name" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN external_result_file_name VARCHAR(255)")
    if "degree_level" not in columns:
        statements.append("ALTER TABLE papers ADD COLUMN degree_level VARCHAR(64)")

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def ensure_student_extended_columns() -> None:
    inspector = inspect(engine)
    if "students" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("students")}
    statements: list[str] = []
    if "certification_type" not in columns:
        statements.append("ALTER TABLE students ADD COLUMN certification_type VARCHAR(64)")
        statements.append("CREATE INDEX IF NOT EXISTS ix_students_certification_type ON students (certification_type)")
    if "block_code" not in columns:
        statements.append("ALTER TABLE students ADD COLUMN block_code VARCHAR(8)")
        statements.append("CREATE INDEX IF NOT EXISTS ix_students_block_code ON students (block_code)")

    if not statements:
        return

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def ensure_paper_audit_tables() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    
    is_sqlite = engine.dialect.name == "sqlite"
    id_type = "INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "SERIAL PRIMARY KEY"
    timestamp_type = "DATETIME DEFAULT CURRENT_TIMESTAMP" if is_sqlite else "TIMESTAMPTZ DEFAULT now()"

    with engine.begin() as conn:
        if "paper_versions" not in table_names:
            conn.execute(
                text(
                    f"""
                    CREATE TABLE paper_versions (
                        id {id_type},
                        paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
                        version_no INTEGER NOT NULL,
                        source VARCHAR(32) NOT NULL,
                        file_name VARCHAR(255) NOT NULL,
                        file_path VARCHAR(1024) NOT NULL,
                        file_size INTEGER,
                        mime_type VARCHAR(128),
                        file_sha256 VARCHAR(64),
                        note TEXT,
                        uploaded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        created_at {timestamp_type}
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_versions_id ON paper_versions (id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_versions_paper_id ON paper_versions (paper_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_versions_uploaded_by_id ON paper_versions (uploaded_by_id)"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_paper_versions_paper_version_no ON paper_versions (paper_id, version_no)"
                )
            )

        if "paper_reviews" not in table_names:
            conn.execute(
                text(
                    f"""
                    CREATE TABLE paper_reviews (
                        id {id_type},
                        paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
                        reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        reviewer_role VARCHAR(32),
                        decision VARCHAR(32) NOT NULL,
                        comments TEXT,
                        from_status VARCHAR(32),
                        to_status VARCHAR(32),
                        created_at {timestamp_type}
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_reviews_id ON paper_reviews (id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_reviews_paper_id ON paper_reviews (paper_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_reviews_reviewer_id ON paper_reviews (reviewer_id)"))

        if "paper_workflow_events" not in table_names:
            conn.execute(
                text(
                    f"""
                    CREATE TABLE paper_workflow_events (
                        id {id_type},
                        paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
                        event_type VARCHAR(64) NOT NULL,
                        from_status VARCHAR(32),
                        to_status VARCHAR(32),
                        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        actor_role VARCHAR(32),
                        message TEXT,
                        created_at {timestamp_type}
                    )
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_workflow_events_id ON paper_workflow_events (id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_workflow_events_paper_id ON paper_workflow_events (paper_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_paper_workflow_events_actor_id ON paper_workflow_events (actor_id)"))


def ensure_correction_columns() -> None:
    inspector = inspect(engine)
    if "corrections" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("corrections")}
    if "coordinator_status" in columns:
        return

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE corrections ADD COLUMN coordinator_status VARCHAR(32) NOT NULL DEFAULT 'pending'"))


def ensure_examination_results_table() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "examination_results" in table_names:
        return

    is_sqlite = engine.dialect.name == "sqlite"
    id_type = "INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "SERIAL PRIMARY KEY"
    timestamp_type = "DATETIME DEFAULT CURRENT_TIMESTAMP" if is_sqlite else "TIMESTAMPTZ DEFAULT now()"

    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                CREATE TABLE examination_results (
                    id {id_type},
                    thesis_id INTEGER NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
                    examiner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    examiner_type VARCHAR(32) NOT NULL DEFAULT 'internal',
                    score FLOAT,
                    recommendation VARCHAR(64),
                    general_comments TEXT,
                    annotated_file_path VARCHAR(1024),
                    is_submitted BOOLEAN NOT NULL DEFAULT false,
                    submitted_at {timestamp_type}
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_examination_results_id ON examination_results (id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_examination_results_thesis_id ON examination_results (thesis_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_examination_results_examiner_id ON examination_results (examiner_id)"))


def ensure_multi_tenant_schema() -> None:
    """Idempotently add multi-tenant SaaS columns, indexes, and audit table across SQLite and PostgreSQL."""
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    is_sqlite = engine.dialect.name == "sqlite"
    id_type = "INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "SERIAL PRIMARY KEY"
    ts_type = "DATETIME" if is_sqlite else "TIMESTAMPTZ"
    ts_default = "DATETIME DEFAULT CURRENT_TIMESTAMP" if is_sqlite else "TIMESTAMPTZ DEFAULT now()"
    bool_true = "1" if is_sqlite else "true"
    bool_false = "0" if is_sqlite else "false"

    statements: list[str] = []

    if "institutions" in table_names:
        inst_cols = {c["name"] for c in inspector.get_columns("institutions")}
        inst_additions = [
            ("short_name", "VARCHAR(100)"),
            ("slug", "VARCHAR(100)"),
            ("custom_domain", "VARCHAR(255)"),
            ("status", "VARCHAR(32) NOT NULL DEFAULT 'approved'"),
            ("is_active", f"BOOLEAN NOT NULL DEFAULT {bool_true}"),
            ("contact_name", "VARCHAR(255)"),
            ("contact_email", "VARCHAR(255)"),
            ("contact_phone", "VARCHAR(64)"),
            ("website", "VARCHAR(255)"),
            ("address", "VARCHAR(500)"),
            ("allowed_email_domains", "VARCHAR(500)"),
            ("academic_year", "VARCHAR(32) DEFAULT '2025/2026'"),
            ("allow_public_catalog", f"BOOLEAN NOT NULL DEFAULT {bool_true}"),
            ("logo_url", "VARCHAR(1024)"),
            ("logo_file_path", "VARCHAR(1024)"),
            ("logo_mime_type", "VARCHAR(128)"),
            ("primary_color", "VARCHAR(16) NOT NULL DEFAULT '#5A6552'"),
            ("secondary_color", "VARCHAR(16) NOT NULL DEFAULT '#DCE7D0'"),
            ("accent_color", "VARCHAR(16) NOT NULL DEFAULT '#3B7A57'"),
            ("neutral_color", "VARCHAR(16) NOT NULL DEFAULT '#FAFBF8'"),
            ("default_theme", "VARCHAR(16) NOT NULL DEFAULT 'light'"),
            ("admin_full_name", "VARCHAR(255)"),
            ("admin_email", "VARCHAR(255)"),
            ("admin_school_id", "VARCHAR(64)"),
            ("initial_structure_json", "TEXT"),
            ("approval_notes", "TEXT"),
            ("approved_by_id", "INTEGER"),
            ("approved_at", ts_type),
            ("updated_at", ts_type),
        ]
        for col, col_def in inst_additions:
            if col not in inst_cols:
                statements.append(f"ALTER TABLE institutions ADD COLUMN {col} {col_def}")
        statements.append("CREATE UNIQUE INDEX IF NOT EXISTS ix_institutions_slug ON institutions (slug)")
        statements.append("CREATE UNIQUE INDEX IF NOT EXISTS ix_institutions_custom_domain ON institutions (custom_domain)")

    if "departments" in table_names:
        dept_cols = {c["name"] for c in inspector.get_columns("departments")}
        if "faculty_name" not in dept_cols:
            statements.append("ALTER TABLE departments ADD COLUMN faculty_name VARCHAR(255)")
        if "programs" not in dept_cols:
            statements.append("ALTER TABLE departments ADD COLUMN programs TEXT")

    if "users" in table_names:
        user_cols = {c["name"] for c in inspector.get_columns("users")}
        if "is_platform_admin" not in user_cols:
            statements.append(f"ALTER TABLE users ADD COLUMN is_platform_admin BOOLEAN NOT NULL DEFAULT {bool_false}")

    tenant_tables = [
        "users",
        "students",
        "schools",
        "papers",
        "theses",
        "notifications",
        "phd_supervision_logs",
        "phd_seminars",
        "phd_comprehensive_exams",
        "phd_coursework_records",
        "phd_progression_profiles",
        "phd_teaching_requirements",
        "phd_progress_evaluations",
        "phd_reaccreditation_folders",
    ]
    for tbl in tenant_tables:
        if tbl in table_names:
            cols = {c["name"] for c in inspector.get_columns(tbl)}
            if "institution_id" not in cols:
                statements.append(f"ALTER TABLE {tbl} ADD COLUMN institution_id INTEGER")
            statements.append(f"CREATE INDEX IF NOT EXISTS ix_{tbl}_institution_id ON {tbl} (institution_id)")

    if "tenant_audit_logs" not in table_names:
        statements.append(
            f"""
            CREATE TABLE tenant_audit_logs (
                id {id_type},
                institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
                actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                actor_email VARCHAR(255),
                action VARCHAR(100) NOT NULL,
                target_type VARCHAR(64),
                target_id VARCHAR(64),
                details TEXT,
                created_at {ts_default}
            )
            """
        )
        statements.append("CREATE INDEX IF NOT EXISTS ix_tenant_audit_logs_institution_id ON tenant_audit_logs (institution_id)")
        statements.append("CREATE INDEX IF NOT EXISTS ix_tenant_audit_logs_action ON tenant_audit_logs (action)")

    if statements:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))


def ensure_default_gimpa_tenant() -> None:
    """Ensure the canonical pilot GIMPA tenant exists and backfill legacy records without institution_id."""
    from app.core.config import settings
    from app.core.tenant import tenant_bypass
    from app.db.session import SessionLocal
    from app.models.department import Department
    from app.models.institution import Institution
    from app.models.user import User

    legacy_gimpa_faculties = {
        "gimpa business school",
        "school of public service and governance",
        "faculty of law",
        "school of technology and social sciences (sotss)",
    }

    with tenant_bypass():
        db = SessionLocal()
        try:
            gimpa = (
                db.query(Institution)
                .filter(Institution.slug == (settings.default_tenant_slug or "gimpa").strip().lower())
                .first()
            )
            if not gimpa:
                gimpa = (
                    db.query(Institution)
                    .filter(Institution.name == "Ghana Institute of Management and Public Administration")
                    .first()
                )
            if not gimpa:
                gimpa = Institution(
                    name="Ghana Institute of Management and Public Administration",
                    short_name="GIMPA",
                    slug=(settings.default_tenant_slug or "gimpa").strip().lower(),
                    status="approved",
                    is_active=True,
                    contact_name="GIMPA Repository Administration",
                    contact_email="repository@gimpa.edu.gh",
                    website="https://www.gimpa.edu.gh",
                    address="Greenhill, Achimota, Accra, Ghana",
                    allowed_email_domains=settings.allowed_email_domains or "gimpa.edu.gh",
                    academic_year="2025/2026",
                    allow_public_catalog=True,
                    primary_color="#5A6552",
                    secondary_color="#DCE7D0",
                    accent_color="#3B7A57",
                    neutral_color="#FAFBF8",
                    default_theme="light",
                )
                db.add(gimpa)
                db.commit()
                db.refresh(gimpa)
            else:
                changed = False
                if not gimpa.slug:
                    gimpa.slug = (settings.default_tenant_slug or "gimpa").strip().lower()
                    changed = True
                if not gimpa.short_name:
                    gimpa.short_name = "GIMPA"
                    changed = True
                if not gimpa.allowed_email_domains:
                    gimpa.allowed_email_domains = settings.allowed_email_domains or "gimpa.edu.gh"
                    changed = True
                if changed:
                    db.add(gimpa)
                    db.commit()

            # Migrate legacy faculty rows in `institutions` into `departments.faculty_name` under canonical GIMPA tenant
            legacy_rows = db.query(Institution).filter(Institution.id != gimpa.id, Institution.slug.is_(None)).all()
            for legacy_inst in legacy_rows:
                if (legacy_inst.name or "").strip().lower() in legacy_gimpa_faculties:
                    depts = db.query(Department).filter(Department.institution_id == legacy_inst.id).all()
                    for dept in depts:
                        if not dept.faculty_name:
                            dept.faculty_name = legacy_inst.name
                        dept.institution_id = gimpa.id
                        db.add(dept)
                    db.flush()
                    # Re-point any papers pointing to the legacy faculty row
                    db.execute(
                        text("UPDATE papers SET institution_id = :gid WHERE institution_id = :lid"),
                        {"gid": gimpa.id, "lid": legacy_inst.id},
                    )
                    db.delete(legacy_inst)
            db.commit()

            # Backfill NULL institution_id across all tenant-owned tables to canonical GIMPA tenant
            inspector = inspect(engine)
            existing_tables = set(inspector.get_table_names())
            backfill_tables = [
                "users",
                "students",
                "schools",
                "papers",
                "theses",
                "notifications",
                "phd_supervision_logs",
                "phd_seminars",
                "phd_comprehensive_exams",
                "phd_teaching_requirements",
                "phd_progress_evaluations",
                "phd_reaccreditation_folders",
            ]
            with engine.begin() as conn:
                for tbl in backfill_tables:
                    if tbl in existing_tables:
                        if tbl == "users":
                            conn.execute(
                                text("UPDATE users SET institution_id = :gid WHERE institution_id IS NULL AND is_platform_admin = false"),
                                {"gid": gimpa.id},
                            )
                        else:
                            conn.execute(
                                text(f"UPDATE {tbl} SET institution_id = :gid WHERE institution_id IS NULL"),
                                {"gid": gimpa.id},
                            )

            # Ensure optional bootstrap Platform Operator exists if configured or if none exists yet
            if settings.platform_admin_password:
                from app.core.security import hash_password
                from app.models.user_role import UserRole

                platform_email = (settings.platform_admin_email or "platform-admin@thesiscloud.org").strip().lower()
                platform_user = db.query(User).filter(User.email == platform_email).first()
                if not platform_user:
                    platform_user = User(
                        institution_id=None,
                        email=platform_email,
                        full_name="Platform Operator",
                        hashed_password=hash_password(settings.platform_admin_password),
                        is_active=True,
                        is_admin=True,
                        is_platform_admin=True,
                        role="system_admin",
                        must_change_password=False,
                    )
                    db.add(platform_user)
                    db.flush()
                    db.add(UserRole(user_id=platform_user.id, role="system_admin"))
                    db.commit()
        finally:
            db.close()


def ensure_phd_progression_schema() -> None:
    """Idempotently add 6-stage PhD progression columns to existing phd_comprehensive_exams table."""
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "phd_comprehensive_exams" not in table_names:
        return

    cols = {c["name"] for c in inspector.get_columns("phd_comprehensive_exams")}
    statements: list[str] = []
    if "assessor_id" not in cols:
        statements.append("ALTER TABLE phd_comprehensive_exams ADD COLUMN assessor_id INTEGER")
    if "paper_part" not in cols:
        statements.append("ALTER TABLE phd_comprehensive_exams ADD COLUMN paper_part VARCHAR(200)")
    if "score" not in cols:
        statements.append("ALTER TABLE phd_comprehensive_exams ADD COLUMN score FLOAT")
    if "remedial_instructions" not in cols:
        statements.append("ALTER TABLE phd_comprehensive_exams ADD COLUMN remedial_instructions TEXT")

    if statements:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))




