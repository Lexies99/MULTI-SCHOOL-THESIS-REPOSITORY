from __future__ import annotations

from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, func

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.user_role import UserRole
from app.models.student import Student
from app.models.paper import Paper
from app.models.phd_system import (
    PhDSupervisionLog,
    PhDSeminar,
    PhDComprehensiveExam,
    PhDCourseworkRecord,
    PhDProgressionProfile,
    PhDTeachingRequirement,
    PhDProgressEvaluation,
    PhDReaccreditationFolder,
)
from app.schemas.phd import (
    PhDSupervisionLogCreate,
    PhDSupervisionLogRead,
    PhDSeminarCreate,
    PhDSeminarRead,
    PhDComprehensiveExamCreate,
    PhDComprehensiveExamRead,
    PhDCourseworkRecordCreate,
    PhDCourseworkRecordUpdate,
    PhDCourseworkRecordRead,
    PhDAssignAdvisorRequest,
    PhDAdvisorClearanceRequest,
    PhDAssignAssessorRequest,
    PhDAssignDissertationSupervisorRequest,
    PhDPreVivaUpdateRequest,
    PhDVivaDefenseUpdateRequest,
    PhDFacultyMemberRead,
    PhDProgressionProfileRead,
    PhDTeachingRequirementCreate,
    PhDTeachingRequirementRead,
    PhDProgressEvaluationCreate,
    PhDProgressEvaluationRead,
    PhDReaccreditationFolderCreate,
    PhDReaccreditationFolderRead,
    PhDStudentDossier,
)
from app.services.notification_service import create_notification

router = APIRouter(prefix="/phd", tags=["phd"])

LEADERSHIP_ROLES = {"system_admin", "deputy_rector", "dean", "hod", "project_coordinator"}
ACADEMIC_STAFF_ROLES = LEADERSHIP_ROLES | {"project_supervisor", "lecturer", "external_examiner"}

GRADE_POINT_MAP: dict[str, float] = {
    "A": 4.0,
    "A-": 3.7,
    "B+": 3.3,
    "B": 3.0,
    "B-": 2.7,
    "C+": 2.3,
    "C": 2.0,
    "C-": 1.7,
    "D+": 1.3,
    "D": 1.0,
    "F": 0.0,
}


def _score_to_grade(score: float) -> tuple[str, float]:
    if score >= 80:
        return "A", 4.0
    if score >= 75:
        return "A-", 3.7
    if score >= 70:
        return "B+", 3.3
    if score >= 65:
        return "B", 3.0
    if score >= 60:
        return "B-", 2.7
    if score >= 55:
        return "C+", 2.3
    if score >= 50:
        return "C", 2.0
    return "F", 0.0


def _compute_coursework_metrics(
    assignment_score: float | None,
    coursework_score: float | None,
    exam_score: float | None,
    total_score: float | None,
    letter_grade: str | None,
    status_val: str | None,
) -> tuple[float | None, str | None, float | None, str]:
    computed_total = total_score
    if computed_total is None:
        parts = [v for v in [assignment_score, coursework_score, exam_score] if v is not None]
        if parts:
            raw_sum = sum(parts)
            # If the entered component marks sum <= 100 (e.g. 20 + 20 + 60 = 100), treat as weighted total;
            # otherwise average component percentages.
            computed_total = round(raw_sum if raw_sum <= 100 else (raw_sum / len(parts)), 2)

    grade = (letter_grade or "").strip().upper() or None
    gp: float | None = None
    if grade and grade in GRADE_POINT_MAP:
        gp = GRADE_POINT_MAP[grade]
    elif computed_total is not None:
        grade, gp = _score_to_grade(computed_total)

    resolved_status = (status_val or "Enrolled").strip()
    if resolved_status == "Enrolled" and (computed_total is not None or grade is not None):
        resolved_status = "Failed" if grade == "F" else "Passed"
    return computed_total, grade, gp, resolved_status


def _get_user_roles(db: Session, user: User) -> set[str]:
    roles = {user.role}
    sec_roles = db.query(UserRole.role).filter(UserRole.user_id == user.id).all()
    for r in sec_roles:
        roles.add(r[0])
    return roles


def _get_or_create_progression(db: Session, student_id: int) -> PhDProgressionProfile:
    prof = db.query(PhDProgressionProfile).filter(PhDProgressionProfile.student_id == student_id).first()
    if not prof:
        prof = PhDProgressionProfile(student_id=student_id)
        db.add(prof)
        db.flush()
    return prof


def _compute_gpa(courses: list[PhDCourseworkRecord]) -> tuple[int, int, float | None]:
    total_credits = sum((c.credit_hours or 0) for c in courses)
    completed = sum(1 for c in courses if (c.status or "").lower() in {"completed", "passed"})
    graded = [c for c in courses if c.grade_point is not None and (c.credit_hours or 0) > 0]
    if not graded:
        return completed, total_credits, None
    weighted_sum = sum((c.grade_point or 0.0) * (c.credit_hours or 3) for c in graded)
    graded_credits = sum((c.credit_hours or 3) for c in graded)
    return completed, total_credits, round(weighted_sum / graded_credits, 2) if graded_credits > 0 else None


def _resolve_stage_number_and_label(
    profile: PhDProgressionProfile | None,
    comp_passed: bool,
    seminars_count: int,
    logs_count: int,
) -> tuple[int, str]:
    if profile and profile.viva_verdict and profile.viva_verdict != "Pending":
        return 6, f"Stage 6: Viva Voce ({profile.viva_verdict})"
    if profile and (profile.external_examiner_id or profile.pre_viva_cleared):
        return 6, "Stage 6: External Viva & Defense Marks"
    if profile and (profile.pre_viva_examiner_id or profile.pre_viva_verdict):
        return 5, "Stage 5: Pre-Viva Internal Assessment"
    if profile and profile.dissertation_supervisor_id:
        if seminars_count > 0 or logs_count > 0:
            return 4, "Stage 4: Dissertation Supervision & Seminars"
        return 4, "Stage 4: Supervision & Doctoral Seminars"
    if comp_passed:
        return 3, "Stage 3: Comp Passed — Assign Dissertation Supervisor"
    if profile and profile.comp_assessor_id:
        return 3, "Stage 3: Comprehensive Examination (Assessor Assigned)"
    if profile and profile.advisor_cleared_for_comps:
        return 2, "Stage 2: Advisor Cleared — Assign Comp Exam Assessor"
    return 1, "Stage 1: Coursework & Academic Advisor"


def _build_progression_read(db: Session, student: User) -> PhDProgressionProfileRead:
    prof = db.query(PhDProgressionProfile).filter(PhDProgressionProfile.student_id == student.id).first()
    courses = db.query(PhDCourseworkRecord).filter(PhDCourseworkRecord.student_id == student.id).all()
    completed_courses, total_credits, gpa = _compute_gpa(courses)

    latest_exam = (
        db.query(PhDComprehensiveExam)
        .filter(PhDComprehensiveExam.student_id == student.id)
        .order_by(desc(PhDComprehensiveExam.attempt_number), desc(PhDComprehensiveExam.id))
        .first()
    )
    comp_passed = bool(
        latest_exam and (latest_exam.result == "Pass" or latest_exam.advanced_to_candidacy)
    )
    seminars = db.query(PhDSeminar).filter(PhDSeminar.student_id == student.id).all()
    attended_count = sum(1 for s in seminars if s.attended)
    presented_count = sum(1 for s in seminars if s.is_presenter)
    logs_count = db.query(PhDSupervisionLog).filter(PhDSupervisionLog.student_id == student.id).count()

    stage_num, stage_label = _resolve_stage_number_and_label(
        prof, comp_passed, len(seminars), logs_count
    )

    def _uname(u: User | None) -> str | None:
        return (u.full_name or u.email) if u else None

    return PhDProgressionProfileRead(
        id=prof.id if prof else None,
        student_id=student.id,
        student_name=student.full_name or student.email,
        student_email=student.email,
        advisor_id=prof.advisor_id if prof else None,
        advisor_name=_uname(prof.advisor) if prof else None,
        courses_count=len(courses),
        completed_courses_count=completed_courses,
        total_credits=total_credits,
        cumulative_gpa=gpa,
        advisor_cleared_for_comps=bool(prof.advisor_cleared_for_comps) if prof else False,
        advisor_clearance_date=prof.advisor_clearance_date if prof else None,
        advisor_clearance_notes=prof.advisor_clearance_notes if prof else None,
        comp_assessor_id=prof.comp_assessor_id if prof else None,
        comp_assessor_name=_uname(prof.comp_assessor) if prof else None,
        comp_assessor_assigned_at=prof.comp_assessor_assigned_at if prof else None,
        comp_exam_passed=comp_passed,
        latest_comp_exam_result=latest_exam.result if latest_exam else "Not Sat",
        latest_comp_exam_score=latest_exam.score if latest_exam else None,
        dissertation_supervisor_id=prof.dissertation_supervisor_id if prof else None,
        dissertation_supervisor_name=_uname(prof.dissertation_supervisor) if prof else None,
        co_supervisor_id=prof.co_supervisor_id if prof else None,
        co_supervisor_name=_uname(prof.co_supervisor) if prof else None,
        supervisor_assigned_at=prof.supervisor_assigned_at if prof else None,
        seminars_attended_count=attended_count,
        seminars_presented_count=presented_count,
        supervision_logs_count=logs_count,
        pre_viva_examiner_id=prof.pre_viva_examiner_id if prof else None,
        pre_viva_examiner_name=_uname(prof.pre_viva_examiner) if prof else None,
        pre_viva_date=prof.pre_viva_date if prof else None,
        pre_viva_score=prof.pre_viva_score if prof else None,
        pre_viva_verdict=prof.pre_viva_verdict if prof else None,
        pre_viva_cleared=bool(prof.pre_viva_cleared) if prof else False,
        pre_viva_remarks=prof.pre_viva_remarks if prof else None,
        external_examiner_id=prof.external_examiner_id if prof else None,
        external_examiner_name=_uname(prof.external_examiner) if prof else None,
        external_dispatched_at=prof.external_dispatched_at if prof else None,
        viva_date=prof.viva_date if prof else None,
        internal_examiner_mark=prof.internal_examiner_mark if prof else None,
        external_examiner_mark=prof.external_examiner_mark if prof else None,
        oral_defense_mark=prof.oral_defense_mark if prof else None,
        overall_defense_mark=prof.overall_defense_mark if prof else None,
        viva_verdict=prof.viva_verdict if prof else None,
        viva_remarks=prof.viva_remarks if prof else None,
        current_stage_number=stage_num,
        current_stage_label=stage_label,
    )


def get_accessible_phd_student_ids(db: Session, current_user: User) -> set[int] | None:
    """
    Computes authorized student IDs for the PhD Programme Hub according to strict RBAC:
    - System Administrator / Deputy Rector: None (unrestricted institutional oversight).
    - Dean: students enrolled in current_user's school.
    - HOD / Project Coordinator: students enrolled in current_user's department.
    - Project Supervisor / Lecturer / External Examiner: ONLY students assigned to them
      as advisor, comp assessor, dissertation supervisor, co-supervisor, pre-viva examiner,
      external examiner, teaching mentor, or paper supervisor.
    - PhD Student: ONLY current_user.id (own dossier and records). Non-PhD students are forbidden.
    - Other roles (Librarian, Guest, etc.): 403 Forbidden.
    """
    user_roles = _get_user_roles(db, current_user)

    if "system_admin" in user_roles or "deputy_rector" in user_roles:
        return None

    if "dean" in user_roles:
        if current_user.school:
            school_students = db.query(User.id).filter(
                User.role.in_(["student", "member"]),
                func.lower(User.school) == func.lower(current_user.school),
            ).all()
            return {s[0] for s in school_students}
        return None

    if "hod" in user_roles or "project_coordinator" in user_roles:
        if current_user.department:
            dept_students = db.query(User.id).filter(
                User.role.in_(["student", "member"]),
                func.lower(User.department) == func.lower(current_user.department),
            ).all()
            return {s[0] for s in dept_students}
        if current_user.school:
            school_students = db.query(User.id).filter(
                User.role.in_(["student", "member"]),
                func.lower(User.school) == func.lower(current_user.school),
            ).all()
            return {s[0] for s in school_students}
        return set()

    if "project_supervisor" in user_roles or "lecturer" in user_roles or "external_examiner" in user_roles:
        supervisee_ids: set[int] = set()

        for (sid,) in db.query(Paper.created_by_id).filter(
            Paper.supervisor_id == current_user.id,
            Paper.created_by_id.isnot(None),
        ).all():
            supervisee_ids.add(sid)

        for (sid,) in db.query(PhDSupervisionLog.student_id).filter(
            PhDSupervisionLog.supervisor_id == current_user.id,
            PhDSupervisionLog.student_id.isnot(None),
        ).all():
            supervisee_ids.add(sid)

        for (sid,) in db.query(PhDTeachingRequirement.student_id).filter(
            PhDTeachingRequirement.supervising_faculty_id == current_user.id,
            PhDTeachingRequirement.student_id.isnot(None),
        ).all():
            supervisee_ids.add(sid)

        for (sid,) in db.query(PhDProgressEvaluation.student_id).filter(
            PhDProgressEvaluation.evaluator_id == current_user.id,
            PhDProgressEvaluation.student_id.isnot(None),
        ).all():
            supervisee_ids.add(sid)

        for (sid,) in db.query(PhDProgressionProfile.student_id).filter(
            or_(
                PhDProgressionProfile.advisor_id == current_user.id,
                PhDProgressionProfile.comp_assessor_id == current_user.id,
                PhDProgressionProfile.dissertation_supervisor_id == current_user.id,
                PhDProgressionProfile.co_supervisor_id == current_user.id,
                PhDProgressionProfile.pre_viva_examiner_id == current_user.id,
                PhDProgressionProfile.external_examiner_id == current_user.id,
            )
        ).all():
            supervisee_ids.add(sid)

        return supervisee_ids

    if "student" in user_roles or "member" in user_roles:
        has_phd_program = bool(
            current_user.program and any(k in current_user.program.lower() for k in ["phd", "doctor"])
        )
        has_phd_paper = db.query(Paper.id).filter(
            Paper.created_by_id == current_user.id,
            or_(
                Paper.document_type == "doctoral_thesis",
                Paper.title.ilike("%phd%"),
                Paper.title.ilike("%doctor%"),
            ),
        ).first() is not None
        has_phd_log = db.query(PhDSupervisionLog.id).filter(
            PhDSupervisionLog.student_id == current_user.id
        ).first() is not None
        has_phd_profile = db.query(PhDProgressionProfile.id).filter(
            PhDProgressionProfile.student_id == current_user.id
        ).first() is not None
        has_phd_coursework = db.query(PhDCourseworkRecord.id).filter(
            PhDCourseworkRecord.student_id == current_user.id
        ).first() is not None

        if not (has_phd_program or has_phd_paper or has_phd_log or has_phd_profile or has_phd_coursework):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access to PhD Hub is restricted to registered PhD and Doctoral students.",
            )
        return {current_user.id}

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access to the PhD Programme Hub is restricted to doctoral students, supervisors, and academic leadership.",
    )


def _require_student_access(db: Session, current_user: User, student_id: int) -> User:
    allowed_ids = get_accessible_phd_student_ids(db, current_user)
    if allowed_ids is not None and student_id not in allowed_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to access or update this doctoral student's record.",
        )
    student = db.query(User).filter(User.id == student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctoral student not found")
    return student


# ---------------------------------------------------------------------------
# 0. Faculty & Examiner Directory for Stage Assignment Dropdowns
# ---------------------------------------------------------------------------
@router.get("/faculty-directory", response_model=list[PhDFacultyMemberRead])
def list_phd_faculty_directory(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhDFacultyMemberRead]:
    _ = get_accessible_phd_student_ids(db, current_user)
    faculty_roles = [
        "lecturer",
        "project_supervisor",
        "project_coordinator",
        "hod",
        "dean",
        "deputy_rector",
        "external_examiner",
        "system_admin",
    ]
    role_user_ids = {
        r[0]
        for r in db.query(UserRole.user_id).filter(UserRole.role.in_(faculty_roles)).all()
    }
    users = (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            or_(User.role.in_(faculty_roles), User.id.in_(role_user_ids)),
        )
        .order_by(User.full_name.asc(), User.email.asc())
        .all()
    )
    results: list[PhDFacultyMemberRead] = []
    for u in users:
        u_roles = _get_user_roles(db, u)
        results.append(
            PhDFacultyMemberRead(
                id=u.id,
                full_name=u.full_name or u.email,
                email=u.email,
                role=u.role,
                department=u.department,
                school=u.school,
                is_external=("external_examiner" in u_roles),
            )
        )
    return results


# ---------------------------------------------------------------------------
# 1. PhD Student Dossiers & 6-Stage Progression Overview
# ---------------------------------------------------------------------------
@router.get("/dossiers", response_model=list[PhDStudentDossier])
def list_phd_dossiers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhDStudentDossier]:
    allowed_student_ids = get_accessible_phd_student_ids(db, current_user)
    if allowed_student_ids is not None and len(allowed_student_ids) == 0:
        return []

    phd_papers = db.query(Paper).filter(
        or_(
            Paper.document_type == "doctoral_thesis",
            Paper.title.ilike("%phd%"),
            Paper.title.ilike("%doctor%"),
        )
    ).all()
    paper_student_ids = {p.created_by_id for p in phd_papers if p.created_by_id}
    log_student_ids = {l[0] for l in db.query(PhDSupervisionLog.student_id).all() if l[0]}
    profile_student_ids = {p[0] for p in db.query(PhDProgressionProfile.student_id).all() if p[0]}
    coursework_student_ids = {c[0] for c in db.query(PhDCourseworkRecord.student_id).all() if c[0]}
    phd_cert_student_ids = {
        u.id
        for u in db.query(User)
        .join(Student, func.lower(Student.email) == func.lower(User.email))
        .filter(
            or_(
                Student.certification_type.ilike("%phd%"),
                Student.certification_type.ilike("%doctor%"),
            )
        )
        .all()
    }

    combined_ids = (
        paper_student_ids
        | log_student_ids
        | profile_student_ids
        | coursework_student_ids
        | phd_cert_student_ids
    )

    query = db.query(User).filter(
        User.role.in_(["student", "member"]),
        or_(
            User.id.in_(combined_ids) if combined_ids else False,
            User.program.ilike("%phd%"),
            User.program.ilike("%doctor%"),
        ),
    )

    if allowed_student_ids is not None:
        query = query.filter(User.id.in_(allowed_student_ids))

    phd_users = query.all()
    today = date.today()
    dossiers: list[PhDStudentDossier] = []

    for u in phd_users:
        paper = next((p for p in phd_papers if p.created_by_id == u.id), None)
        prog = _build_progression_read(db, u)

        candidacy = "Pre-Candidacy"
        if prog.viva_verdict and prog.viva_verdict in {"Pass", "Pass with Minor Corrections"}:
            candidacy = "Completed"
        elif prog.comp_exam_passed:
            candidacy = "PhD Candidate"

        teaching_done = db.query(PhDTeachingRequirement).filter(
            PhDTeachingRequirement.student_id == u.id,
            PhDTeachingRequirement.is_completed.is_(True),
        ).first() is not None

        latest_log = db.query(PhDSupervisionLog).filter(
            PhDSupervisionLog.student_id == u.id
        ).order_by(desc(PhDSupervisionLog.meeting_date)).first()

        last_date = latest_log.meeting_date if latest_log else None
        days_since = None
        inactivity_alert = False
        research_stage = latest_log.research_stage if latest_log else prog.current_stage_label

        if last_date:
            days_since = (today - last_date).days
            if days_since > 60:
                inactivity_alert = True
        elif prog.dissertation_supervisor_id:
            inactivity_alert = True

        latest_eval = db.query(PhDProgressEvaluation).filter(
            PhDProgressEvaluation.student_id == u.id
        ).order_by(desc(PhDProgressEvaluation.created_at)).first()
        recent_eval = latest_eval.overall_rating if latest_eval else None

        supervisors = []
        if prog.dissertation_supervisor_name:
            supervisors.append(prog.dissertation_supervisor_name)
        if prog.co_supervisor_name and prog.co_supervisor_name not in supervisors:
            supervisors.append(prog.co_supervisor_name)
        if paper and paper.supervisor:
            p_sup = paper.supervisor.full_name or paper.supervisor.email
            if p_sup not in supervisors:
                supervisors.append(p_sup)
        if latest_log and latest_log.supervisor:
            s_name = latest_log.supervisor.full_name or latest_log.supervisor.email
            if s_name not in supervisors:
                supervisors.append(s_name)

        dossiers.append(
            PhDStudentDossier(
                student_id=u.id,
                student_name=u.full_name or u.email,
                student_email=u.email,
                school_id=u.school_id,
                specialization=u.department or "Doctoral Studies",
                program=u.program or "Doctor of Philosophy (PhD)",
                research_stage=research_stage,
                candidacy_status=candidacy,
                comprehensive_result=prog.latest_comp_exam_result,
                seminars_attended_count=prog.seminars_attended_count,
                seminars_presented_count=prog.seminars_presented_count,
                teaching_completed=teaching_done,
                last_meeting_date=last_date,
                days_since_last_meeting=days_since,
                inactivity_alert=inactivity_alert,
                supervisors=supervisors,
                recent_eval_rating=recent_eval,
                current_stage_number=prog.current_stage_number,
                current_stage_label=prog.current_stage_label,
                courses_count=prog.courses_count,
                cumulative_gpa=prog.cumulative_gpa,
                advisor_id=prog.advisor_id,
                advisor_name=prog.advisor_name,
                advisor_cleared_for_comps=prog.advisor_cleared_for_comps,
                comp_assessor_id=prog.comp_assessor_id,
                comp_assessor_name=prog.comp_assessor_name,
                comp_exam_passed=prog.comp_exam_passed,
                dissertation_supervisor_id=prog.dissertation_supervisor_id,
                dissertation_supervisor_name=prog.dissertation_supervisor_name,
                pre_viva_examiner_id=prog.pre_viva_examiner_id,
                pre_viva_examiner_name=prog.pre_viva_examiner_name,
                pre_viva_cleared=prog.pre_viva_cleared,
                pre_viva_score=prog.pre_viva_score,
                pre_viva_verdict=prog.pre_viva_verdict,
                external_examiner_id=prog.external_examiner_id,
                external_examiner_name=prog.external_examiner_name,
                overall_defense_mark=prog.overall_defense_mark,
                viva_verdict=prog.viva_verdict,
            )
        )

    return dossiers


# ---------------------------------------------------------------------------
# STAGE 1: Enrollment, Coursework, Assignments, Course Exams & Grades
# ---------------------------------------------------------------------------
@router.get("/coursework", response_model=list[PhDCourseworkRecordRead])
def list_phd_coursework(
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhDCourseworkRecordRead]:
    allowed_ids = get_accessible_phd_student_ids(db, current_user)
    query = db.query(PhDCourseworkRecord)

    if allowed_ids is not None:
        if len(allowed_ids) == 0:
            return []
        if student_id:
            if student_id not in allowed_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to view coursework records for this student.",
                )
            query = query.filter(PhDCourseworkRecord.student_id == student_id)
        else:
            query = query.filter(PhDCourseworkRecord.student_id.in_(allowed_ids))
    elif student_id:
        query = query.filter(PhDCourseworkRecord.student_id == student_id)

    rows = query.order_by(desc(PhDCourseworkRecord.academic_year), desc(PhDCourseworkRecord.id)).all()
    results = []
    for r in rows:
        item = PhDCourseworkRecordRead.model_validate(r)
        if r.student:
            item.student_name = r.student.full_name or r.student.email
        if r.recorded_by:
            item.recorded_by_name = r.recorded_by.full_name or r.recorded_by.email
        results.append(item)
    return results


@router.post("/coursework", response_model=PhDCourseworkRecordRead, status_code=status.HTTP_201_CREATED)
def create_phd_coursework(
    payload: PhDCourseworkRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDCourseworkRecordRead:
    user_roles = _get_user_roles(db, current_user)
    is_student = current_user.role in {"student", "member"} and not (user_roles & ACADEMIC_STAFF_ROLES)

    if is_student:
        payload.student_id = current_user.id
        # Students may register enrolled courses, but grades/scores are entered by advisors/faculty
        if any(v is not None for v in [payload.assignment_score, payload.coursework_score, payload.exam_score, payload.total_score, payload.letter_grade]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Academic Advisors, Lecturers, or Programme Leadership can enter coursework grades.",
            )

    student = _require_student_access(db, current_user, payload.student_id)
    total_score, letter_grade, grade_point, resolved_status = _compute_coursework_metrics(
        payload.assignment_score,
        payload.coursework_score,
        payload.exam_score,
        payload.total_score,
        payload.letter_grade,
        payload.status,
    )

    rec = PhDCourseworkRecord(
        student_id=payload.student_id,
        course_code=payload.course_code.strip().upper(),
        course_title=payload.course_title.strip(),
        academic_year=payload.academic_year.strip(),
        semester=payload.semester.strip(),
        credit_hours=max(1, payload.credit_hours),
        assignment_score=payload.assignment_score,
        coursework_score=payload.coursework_score,
        exam_score=payload.exam_score,
        total_score=total_score,
        letter_grade=letter_grade,
        grade_point=grade_point,
        status=resolved_status,
        instructor_name=(payload.instructor_name or "").strip() or None,
        remarks=(payload.remarks or "").strip() or None,
        recorded_by_id=current_user.id,
    )
    db.add(rec)
    _get_or_create_progression(db, payload.student_id)
    db.commit()
    db.refresh(rec)

    item = PhDCourseworkRecordRead.model_validate(rec)
    item.student_name = student.full_name or student.email
    item.recorded_by_name = current_user.full_name or current_user.email
    return item


@router.patch("/coursework/{record_id}", response_model=PhDCourseworkRecordRead)
def update_phd_coursework(
    record_id: int,
    payload: PhDCourseworkRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDCourseworkRecordRead:
    user_roles = _get_user_roles(db, current_user)
    if not (user_roles & ACADEMIC_STAFF_ROLES):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Academic Advisors, Lecturers, or Programme Leadership can update coursework grades.",
        )

    rec = db.query(PhDCourseworkRecord).filter(PhDCourseworkRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coursework record not found")

    student = _require_student_access(db, current_user, rec.student_id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if k in {"course_code", "course_title", "academic_year", "semester", "instructor_name", "remarks"} and isinstance(v, str):
            v = v.strip()
            if k == "course_code":
                v = v.upper()
        setattr(rec, k, v)

    total_score, letter_grade, grade_point, resolved_status = _compute_coursework_metrics(
        rec.assignment_score,
        rec.coursework_score,
        rec.exam_score,
        payload.total_score if "total_score" in data else None,
        payload.letter_grade if "letter_grade" in data else None,
        rec.status,
    )
    rec.total_score = total_score
    rec.letter_grade = letter_grade
    rec.grade_point = grade_point
    rec.status = resolved_status
    rec.recorded_by_id = current_user.id

    db.add(rec)
    db.commit()
    db.refresh(rec)

    item = PhDCourseworkRecordRead.model_validate(rec)
    item.student_name = student.full_name or student.email
    item.recorded_by_name = current_user.full_name or current_user.email
    return item


@router.delete("/coursework/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_phd_coursework(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_roles = _get_user_roles(db, current_user)
    if not (user_roles & ACADEMIC_STAFF_ROLES):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete coursework records.")
    rec = db.query(PhDCourseworkRecord).filter(PhDCourseworkRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coursework record not found")
    _require_student_access(db, current_user, rec.student_id)
    db.delete(rec)
    db.commit()


# ---------------------------------------------------------------------------
# 6-STAGE PROGRESSION PIPELINE ENDPOINTS
# ---------------------------------------------------------------------------
@router.get("/progression/{student_id}", response_model=PhDProgressionProfileRead)
def get_phd_progression(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDProgressionProfileRead:
    student = _require_student_access(db, current_user, student_id)
    return _build_progression_read(db, student)


@router.post("/progression/{student_id}/advisor", response_model=PhDProgressionProfileRead)
def assign_phd_advisor(
    student_id: int,
    payload: PhDAssignAdvisorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDProgressionProfileRead:
    user_roles = _get_user_roles(db, current_user)
    if not (user_roles & LEADERSHIP_ROLES):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HOD, Project Coordinator, Dean, or System Admin can assign an Academic Advisor.",
        )

    student = _require_student_access(db, current_user, student_id)
    advisor = db.query(User).filter(User.id == payload.advisor_id).first()
    if not advisor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Advisor user not found")

    prof = _get_or_create_progression(db, student_id)
    prof.advisor_id = advisor.id
    db.add(prof)
    db.commit()

    create_notification(
        db,
        user_id=student.id,
        ntype="phd_advisor_assigned",
        message=f"{advisor.full_name or advisor.email} has been assigned as your PhD Academic Advisor for Stage 1 Coursework.",
    )
    create_notification(
        db,
        user_id=advisor.id,
        ntype="phd_advisor_assigned",
        message=f"You have been assigned as Academic Advisor for PhD student {student.full_name or student.email}.",
    )
    return _build_progression_read(db, student)


@router.post("/progression/{student_id}/advisor-clearance", response_model=PhDProgressionProfileRead)
def set_advisor_clearance(
    student_id: int,
    payload: PhDAdvisorClearanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDProgressionProfileRead:
    student = _require_student_access(db, current_user, student_id)
    prof = _get_or_create_progression(db, student_id)
    user_roles = _get_user_roles(db, current_user)

    is_assigned_advisor = prof.advisor_id == current_user.id
    if not (is_assigned_advisor or (user_roles & LEADERSHIP_ROLES)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned Academic Advisor or Academic Leadership can issue Comprehensive Exam clearance.",
        )

    prof.advisor_cleared_for_comps = payload.cleared
    prof.advisor_clearance_date = date.today() if payload.cleared else None
    prof.advisor_clearance_notes = (payload.notes or "").strip() or None
    db.add(prof)
    db.commit()

    if payload.cleared:
        create_notification(
            db,
            user_id=student.id,
            ntype="phd_advisor_clearance",
            message="Your Academic Advisor has cleared your coursework for Comprehensive Examinations. Stage 2 (Assessor Assignment) is now unlocked.",
        )
    return _build_progression_read(db, student)


@router.post("/progression/{student_id}/assign-assessor", response_model=PhDProgressionProfileRead)
def assign_comp_exam_assessor(
    student_id: int,
    payload: PhDAssignAssessorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDProgressionProfileRead:
    user_roles = _get_user_roles(db, current_user)
    if not (user_roles & LEADERSHIP_ROLES):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HOD, Project Coordinator, Dean, or System Admin can assign a Comprehensive Exam Assessor.",
        )

    student = _require_student_access(db, current_user, student_id)
    prof = _get_or_create_progression(db, student_id)

    if not prof.advisor_cleared_for_comps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gate locked: Academic Advisor must clear coursework (Stage 1) before a Comprehensive Exam Assessor can be assigned.",
        )

    assessor = db.query(User).filter(User.id == payload.assessor_id).first()
    if not assessor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessor user not found")

    prof.comp_assessor_id = assessor.id
    prof.comp_assessor_assigned_at = datetime.now(timezone.utc)
    db.add(prof)
    db.commit()

    create_notification(
        db,
        user_id=student.id,
        ntype="phd_assessor_assigned",
        message=f"{assessor.full_name or assessor.email} has been assigned as your Comprehensive Examination Assessor.",
    )
    create_notification(
        db,
        user_id=assessor.id,
        ntype="phd_assessor_assigned",
        message=f"You have been assigned to assess the Comprehensive Examination for PhD student {student.full_name or student.email}.",
    )
    return _build_progression_read(db, student)


@router.post("/progression/{student_id}/assign-supervisor", response_model=PhDProgressionProfileRead)
def assign_dissertation_supervisor(
    student_id: int,
    payload: PhDAssignDissertationSupervisorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDProgressionProfileRead:
    user_roles = _get_user_roles(db, current_user)
    if not (user_roles & LEADERSHIP_ROLES):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HOD, Project Coordinator, Dean, or System Admin can assign a Dissertation Supervisor.",
        )

    student = _require_student_access(db, current_user, student_id)
    prof = _get_or_create_progression(db, student_id)

    # STRICT GATE: Student MUST pass Comprehensive Exam first!
    passed_exam = (
        db.query(PhDComprehensiveExam)
        .filter(
            PhDComprehensiveExam.student_id == student_id,
            or_(
                PhDComprehensiveExam.result == "Pass",
                PhDComprehensiveExam.advanced_to_candidacy.is_(True),
            ),
        )
        .first()
    )
    if not passed_exam:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gate locked: The student must PASS their Comprehensive Examination before a Dissertation Supervisor can be assigned.",
        )

    supervisor = db.query(User).filter(User.id == payload.dissertation_supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supervisor user not found")

    co_sup_id = None
    if payload.co_supervisor_id:
        co_sup = db.query(User).filter(User.id == payload.co_supervisor_id).first()
        if not co_sup:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Co-supervisor user not found")
        co_sup_id = co_sup.id

    prof.dissertation_supervisor_id = supervisor.id
    prof.co_supervisor_id = co_sup_id
    prof.supervisor_assigned_at = datetime.now(timezone.utc)
    db.add(prof)

    # Sync supervisor onto the student's active doctoral paper if present
    active_paper = (
        db.query(Paper)
        .filter(Paper.created_by_id == student_id)
        .order_by(desc(Paper.id))
        .first()
    )
    if active_paper:
        active_paper.supervisor_id = supervisor.id
        db.add(active_paper)

    db.commit()

    create_notification(
        db,
        user_id=student.id,
        ntype="phd_supervisor_assigned",
        message=f"Congratulations on advancing to PhD Candidacy! {supervisor.full_name or supervisor.email} has been assigned as your Dissertation Supervisor.",
    )
    create_notification(
        db,
        user_id=supervisor.id,
        ntype="phd_supervisor_assigned",
        message=f"You have been assigned as Dissertation Supervisor for PhD Candidate {student.full_name or student.email}.",
    )
    return _build_progression_read(db, student)


@router.post("/progression/{student_id}/pre-viva", response_model=PhDProgressionProfileRead)
def update_phd_pre_viva(
    student_id: int,
    payload: PhDPreVivaUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDProgressionProfileRead:
    student = _require_student_access(db, current_user, student_id)
    prof = _get_or_create_progression(db, student_id)
    user_roles = _get_user_roles(db, current_user)

    is_leadership = bool(user_roles & LEADERSHIP_ROLES)
    is_assigned_pre_viva = prof.pre_viva_examiner_id == current_user.id
    is_supervisor = prof.dissertation_supervisor_id == current_user.id
    if not (is_leadership or is_assigned_pre_viva or is_supervisor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Programme Leadership, Dissertation Supervisor, or the assigned Pre-Viva Examiner can update Pre-Viva assessment.",
        )

    if not prof.dissertation_supervisor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gate locked: A Dissertation Supervisor must be assigned (Stage 3) before proceeding to Pre-Viva Assessment (Stage 5).",
        )

    if payload.pre_viva_examiner_id is not None:
        if not is_leadership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HOD, Project Coordinator, Dean, or System Admin can assign the Pre-Viva Examiner.",
            )
        examiner = db.query(User).filter(User.id == payload.pre_viva_examiner_id).first()
        if not examiner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pre-Viva Examiner user not found")
        prof.pre_viva_examiner_id = examiner.id
        create_notification(
            db,
            user_id=examiner.id,
            ntype="phd_pre_viva_assigned",
            message=f"You have been assigned as Pre-Viva / Internal Examiner for PhD Candidate {student.full_name or student.email}.",
        )

    if payload.pre_viva_date is not None:
        prof.pre_viva_date = payload.pre_viva_date
    if payload.pre_viva_score is not None:
        prof.pre_viva_score = payload.pre_viva_score
    if payload.pre_viva_verdict is not None:
        prof.pre_viva_verdict = payload.pre_viva_verdict.strip()
    if payload.pre_viva_remarks is not None:
        prof.pre_viva_remarks = payload.pre_viva_remarks.strip() or None

    if payload.pre_viva_cleared is not None:
        prof.pre_viva_cleared = payload.pre_viva_cleared
    elif prof.pre_viva_verdict in {"Pass", "Pass with Minor Corrections"}:
        prof.pre_viva_cleared = True

    db.add(prof)
    db.commit()

    if prof.pre_viva_cleared:
        create_notification(
            db,
            user_id=student.id,
            ntype="phd_pre_viva_cleared",
            message=f"Your thesis has passed Pre-Viva assessment ({prof.pre_viva_verdict or 'Cleared'}). Stage 6 (External Examiner Dispatch & Viva Voce) is now unlocked.",
        )
    return _build_progression_read(db, student)


@router.post("/progression/{student_id}/viva-defense", response_model=PhDProgressionProfileRead)
def update_phd_viva_defense(
    student_id: int,
    payload: PhDVivaDefenseUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDProgressionProfileRead:
    student = _require_student_access(db, current_user, student_id)
    prof = _get_or_create_progression(db, student_id)
    user_roles = _get_user_roles(db, current_user)

    is_leadership = bool(user_roles & LEADERSHIP_ROLES)
    is_assigned_external = prof.external_examiner_id == current_user.id
    is_assigned_internal = prof.pre_viva_examiner_id == current_user.id
    if not (is_leadership or is_assigned_external or is_assigned_internal):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Programme Leadership or assigned Viva Examiners can record External Dispatch and Viva Defense marks.",
        )

    if not prof.pre_viva_cleared:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gate locked: Pre-Viva Assessment (Stage 5) must be cleared before dispatching to an External Examiner or recording Viva Defense marks.",
        )

    if payload.external_examiner_id is not None:
        if not is_leadership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HOD, Project Coordinator, Dean, or System Admin can assign the External Examiner.",
            )
        ext_user = db.query(User).filter(User.id == payload.external_examiner_id).first()
        if not ext_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="External Examiner user not found")
        if prof.external_examiner_id != ext_user.id or prof.external_dispatched_at is None:
            prof.external_dispatched_at = datetime.now(timezone.utc)
        prof.external_examiner_id = ext_user.id
        create_notification(
            db,
            user_id=ext_user.id,
            ntype="phd_external_viva_dispatch",
            message=f"A cleared PhD dissertation from {student.full_name or student.email} has been dispatched to you for External Examination & Viva Voce.",
        )

    if payload.viva_date is not None:
        prof.viva_date = payload.viva_date
    if payload.internal_examiner_mark is not None:
        prof.internal_examiner_mark = payload.internal_examiner_mark
    if payload.external_examiner_mark is not None:
        prof.external_examiner_mark = payload.external_examiner_mark
    if payload.oral_defense_mark is not None:
        prof.oral_defense_mark = payload.oral_defense_mark

    if payload.overall_defense_mark is not None:
        prof.overall_defense_mark = payload.overall_defense_mark
    else:
        marks = [
            m
            for m in [prof.internal_examiner_mark, prof.external_examiner_mark, prof.oral_defense_mark]
            if m is not None
        ]
        if marks:
            prof.overall_defense_mark = round(sum(marks) / len(marks), 2)

    if payload.viva_verdict is not None:
        prof.viva_verdict = payload.viva_verdict.strip()
    if payload.viva_remarks is not None:
        prof.viva_remarks = payload.viva_remarks.strip() or None

    db.add(prof)
    db.commit()

    if prof.viva_verdict and prof.viva_verdict != "Pending":
        create_notification(
            db,
            user_id=student.id,
            ntype="phd_viva_verdict",
            message=f"Your PhD Viva Voce defense outcome has been recorded: {prof.viva_verdict}"
            + (f" (Overall Defense Mark: {prof.overall_defense_mark}%)." if prof.overall_defense_mark is not None else "."),
        )
    return _build_progression_read(db, student)


# ---------------------------------------------------------------------------
# 2. Supervision Logs (Monthly Meeting Logs)
# ---------------------------------------------------------------------------
@router.get("/supervision-logs", response_model=list[PhDSupervisionLogRead])
def get_supervision_logs(
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhDSupervisionLogRead]:
    allowed_ids = get_accessible_phd_student_ids(db, current_user)
    query = db.query(PhDSupervisionLog)

    if allowed_ids is not None:
        if len(allowed_ids) == 0:
            return []
        if student_id:
            if student_id not in allowed_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to view supervision records for this student.",
                )
            query = query.filter(PhDSupervisionLog.student_id == student_id)
        else:
            query = query.filter(PhDSupervisionLog.student_id.in_(allowed_ids))
    else:
        if student_id:
            query = query.filter(PhDSupervisionLog.student_id == student_id)

    logs = query.order_by(desc(PhDSupervisionLog.meeting_date)).all()
    results = []
    for l in logs:
        item = PhDSupervisionLogRead.model_validate(l)
        if l.student:
            item.student_name = l.student.full_name or l.student.email
            item.student_email = l.student.email
        if l.supervisor:
            item.supervisor_name = l.supervisor.full_name or l.supervisor.email
        results.append(item)
    return results


@router.post("/supervision-logs", response_model=PhDSupervisionLogRead, status_code=status.HTTP_201_CREATED)
def create_supervision_log(
    payload: PhDSupervisionLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDSupervisionLogRead:
    if current_user.role in {"student", "member"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctoral students cannot create supervision meeting logs. This must be recorded by the supervisor.",
        )

    target_student = _require_student_access(db, current_user, payload.student_id)

    new_log = PhDSupervisionLog(
        student_id=payload.student_id,
        supervisor_id=current_user.id,
        meeting_date=payload.meeting_date,
        meeting_mode=payload.meeting_mode,
        research_stage=payload.research_stage,
        work_submitted=payload.work_submitted,
        feedback_given=payload.feedback_given,
        next_task=payload.next_task,
        progress_rating=payload.progress_rating,
        supervisor_concerns=payload.supervisor_concerns,
        action_required=payload.action_required,
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    create_notification(
        db,
        user_id=target_student.id,
        paper_id=None,
        ntype="supervision_log",
        message=f"Supervisor {current_user.full_name or current_user.email} logged a research supervision meeting for {payload.meeting_date}.",
    )

    item = PhDSupervisionLogRead.model_validate(new_log)
    item.student_name = target_student.full_name or target_student.email
    item.supervisor_name = current_user.full_name or current_user.email
    return item


# ---------------------------------------------------------------------------
# 3. Seminars Tracker (Stage 4: 7 Mandated Categories)
# ---------------------------------------------------------------------------
def _to_seminar_read(s: PhDSeminar) -> PhDSeminarRead:
    item = PhDSeminarRead.model_validate(s)
    item.title = s.seminar_title
    item.venue_or_url = s.evidence_url
    if s.remarks and "Verdict:" in s.remarks:
        first_part = s.remarks.split("|")[0].replace("Verdict:", "").strip()
        item.score_or_verdict = first_part or "Recorded"
    else:
        item.score_or_verdict = "Recorded"
    item.evaluator_feedback = s.remarks
    if s.student:
        item.student_name = s.student.full_name or s.student.email
    return item


@router.get("/seminars", response_model=list[PhDSeminarRead])
def get_phd_seminars(
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhDSeminarRead]:
    allowed_ids = get_accessible_phd_student_ids(db, current_user)
    query = db.query(PhDSeminar)

    if allowed_ids is not None:
        if len(allowed_ids) == 0:
            return []
        if student_id:
            if student_id not in allowed_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to view seminar records for this student.",
                )
            query = query.filter(PhDSeminar.student_id == student_id)
        else:
            query = query.filter(PhDSeminar.student_id.in_(allowed_ids))
    else:
        if student_id:
            query = query.filter(PhDSeminar.student_id == student_id)

    seminars = query.order_by(desc(PhDSeminar.seminar_date)).all()
    return [_to_seminar_read(s) for s in seminars]


@router.post("/seminars", response_model=PhDSeminarRead, status_code=status.HTTP_201_CREATED)
def record_phd_seminar(
    payload: PhDSeminarCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDSeminarRead:
    allowed_ids = get_accessible_phd_student_ids(db, current_user)
    if current_user.role in {"student", "member"}:
        payload.student_id = current_user.id
    elif allowed_ids is not None and payload.student_id not in allowed_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to record seminars for this doctoral student.",
        )

    new_sem = PhDSeminar(
        student_id=payload.student_id,
        seminar_title=payload.seminar_title or payload.title or "Doctoral Seminar",
        seminar_category=payload.seminar_category,
        seminar_date=payload.seminar_date,
        attended=payload.attended,
        is_presenter=payload.is_presenter,
        department=payload.department,
        evidence_url=payload.evidence_url or payload.venue_or_url,
        remarks=payload.remarks,
    )
    db.add(new_sem)
    db.commit()
    db.refresh(new_sem)
    return _to_seminar_read(new_sem)


# ---------------------------------------------------------------------------
# 4. Comprehensive Examination Tracking (Stage 3a)
# ---------------------------------------------------------------------------
def _to_comp_exam_read(e: PhDComprehensiveExam) -> PhDComprehensiveExamRead:
    item = PhDComprehensiveExamRead.model_validate(e)
    if e.student:
        item.student_name = e.student.full_name or e.student.email
    if e.assessor:
        item.assessor_name = e.assessor.full_name or e.assessor.email
    return item


@router.get("/comprehensive-exams", response_model=list[PhDComprehensiveExamRead])
def get_comprehensive_exams(
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhDComprehensiveExamRead]:
    allowed_ids = get_accessible_phd_student_ids(db, current_user)
    query = db.query(PhDComprehensiveExam)

    if allowed_ids is not None:
        if len(allowed_ids) == 0:
            return []
        if student_id:
            if student_id not in allowed_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to view examination records for this student.",
                )
            query = query.filter(PhDComprehensiveExam.student_id == student_id)
        else:
            query = query.filter(PhDComprehensiveExam.student_id.in_(allowed_ids))
    else:
        if student_id:
            query = query.filter(PhDComprehensiveExam.student_id == student_id)

    exams = query.order_by(desc(PhDComprehensiveExam.exam_date), desc(PhDComprehensiveExam.id)).all()
    return [_to_comp_exam_read(e) for e in exams]


@router.post("/comprehensive-exams", response_model=PhDComprehensiveExamRead, status_code=status.HTTP_201_CREATED)
def record_comprehensive_exam(
    payload: PhDComprehensiveExamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDComprehensiveExamRead:
    if current_user.role in {"student", "member"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctoral students cannot enter comprehensive exam results.",
        )

    student = _require_student_access(db, current_user, payload.student_id)
    prof = _get_or_create_progression(db, payload.student_id)
    user_roles = _get_user_roles(db, current_user)

    is_leadership = bool(user_roles & LEADERSHIP_ROLES)
    is_assigned_assessor = prof.comp_assessor_id == current_user.id
    if not (is_leadership or is_assigned_assessor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned Comprehensive Exam Assessor or Academic Leadership can record Comprehensive Exam results.",
        )

    if not prof.advisor_cleared_for_comps or not prof.comp_assessor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gate locked: Complete Stage 1 (Advisor Clearance) and Stage 2 (Assign Comprehensive Exam Assessor) before recording Comprehensive Exam results.",
        )

    courses = db.query(PhDCourseworkRecord).filter(PhDCourseworkRecord.student_id == payload.student_id).all()
    _, _, computed_gpa = _compute_gpa(courses)

    new_exam = PhDComprehensiveExam(
        student_id=payload.student_id,
        assessor_id=payload.assessor_id or prof.comp_assessor_id or current_user.id,
        coursework_completed=payload.coursework_completed,
        cgpa=payload.cgpa if payload.cgpa is not None else computed_gpa,
        specialization=payload.specialization or student.department,
        paper_part=payload.paper_part or "Comprehensive Written & Oral Exam",
        score=payload.score,
        application_date=payload.application_date,
        exam_date=payload.exam_date or date.today(),
        attempt_number=payload.attempt_number,
        committee_members=payload.committee_members,
        result=payload.result,
        advanced_to_candidacy=(payload.result == "Pass" or payload.advanced_to_candidacy),
        appeal_status=payload.appeal_status,
        remedial_instructions=payload.remedial_instructions,
        remarks=payload.remarks or payload.remedial_instructions,
    )
    db.add(new_exam)
    db.commit()
    db.refresh(new_exam)

    if new_exam.advanced_to_candidacy:
        create_notification(
            db,
            user_id=student.id,
            ntype="phd_comp_exam_passed",
            message=f"You have PASSED your Comprehensive Examination (Score: {new_exam.score if new_exam.score is not None else 'Pass'}). You have advanced to PhD Candidacy and are now eligible for Dissertation Supervisor assignment.",
        )
    return _to_comp_exam_read(new_exam)


# ---------------------------------------------------------------------------
# 5. Teaching Practice Requirement
# ---------------------------------------------------------------------------
def _to_teaching_read(r: PhDTeachingRequirement) -> PhDTeachingRequirementRead:
    item = PhDTeachingRequirementRead.model_validate(r)
    if ":" in (r.course_taught or ""):
        code, title = r.course_taught.split(":", 1)
        item.course_code = code.strip()
        item.course_title = title.strip()
    else:
        item.course_code = r.course_taught
        item.course_title = r.course_taught
    item.academic_year = r.semester.split(" - ")[0] if " - " in (r.semester or "") else r.semester
    if r.student:
        item.student_name = r.student.full_name or r.student.email
    if r.supervising_faculty:
        item.supervising_faculty_name = r.supervising_faculty.full_name or r.supervising_faculty.email
    return item


@router.get("/teaching-requirements", response_model=list[PhDTeachingRequirementRead])
def get_teaching_requirements(
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhDTeachingRequirementRead]:
    allowed_ids = get_accessible_phd_student_ids(db, current_user)
    query = db.query(PhDTeachingRequirement)

    if allowed_ids is not None:
        if len(allowed_ids) == 0:
            return []
        if student_id:
            if student_id not in allowed_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to view teaching requirements for this student.",
                )
            query = query.filter(PhDTeachingRequirement.student_id == student_id)
        else:
            query = query.filter(PhDTeachingRequirement.student_id.in_(allowed_ids))
    else:
        if student_id:
            query = query.filter(PhDTeachingRequirement.student_id == student_id)

    records = query.order_by(desc(PhDTeachingRequirement.created_at)).all()
    return [_to_teaching_read(r) for r in records]


@router.post("/teaching-requirements", response_model=PhDTeachingRequirementRead, status_code=status.HTTP_201_CREATED)
def record_teaching_requirement(
    payload: PhDTeachingRequirementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDTeachingRequirementRead:
    allowed_ids = get_accessible_phd_student_ids(db, current_user)
    if current_user.role in {"student", "member"}:
        payload.student_id = current_user.id
    elif allowed_ids is not None and payload.student_id not in allowed_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to record teaching requirements for this student.",
        )

    new_tr = PhDTeachingRequirement(
        student_id=payload.student_id,
        course_taught=payload.course_taught or "",
        semester=payload.semester,
        department=payload.department,
        supervising_faculty_id=payload.supervising_faculty_id,
        teaching_role=payload.teaching_role,
        faculty_evaluation_score=payload.faculty_evaluation_score,
        student_evaluation_score=payload.student_evaluation_score,
        feedback_summary=payload.feedback_summary,
        improvement_plan=payload.improvement_plan,
        is_completed=payload.is_completed,
        completion_date=payload.completion_date,
    )
    db.add(new_tr)
    db.commit()
    db.refresh(new_tr)
    return _to_teaching_read(new_tr)


# ---------------------------------------------------------------------------
# 6. Six-Month Progress Evaluations
# ---------------------------------------------------------------------------
@router.get("/progress-evaluations", response_model=list[PhDProgressEvaluationRead])
def get_progress_evaluations(
    student_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhDProgressEvaluationRead]:
    allowed_ids = get_accessible_phd_student_ids(db, current_user)
    query = db.query(PhDProgressEvaluation)

    if allowed_ids is not None:
        if len(allowed_ids) == 0:
            return []
        if student_id:
            if student_id not in allowed_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You are not authorized to view progress evaluations for this student.",
                )
            query = query.filter(PhDProgressEvaluation.student_id == student_id)
        else:
            query = query.filter(PhDProgressEvaluation.student_id.in_(allowed_ids))
    else:
        if student_id:
            query = query.filter(PhDProgressEvaluation.student_id == student_id)

    evals = query.order_by(desc(PhDProgressEvaluation.evaluation_date)).all()
    results = []
    for ev in evals:
        item = PhDProgressEvaluationRead.model_validate(ev)
        if ev.student:
            item.student_name = ev.student.full_name or ev.student.email
        if ev.evaluator:
            item.evaluator_name = ev.evaluator.full_name or ev.evaluator.email
        results.append(item)
    return results


@router.post("/progress-evaluations", response_model=PhDProgressEvaluationRead, status_code=status.HTTP_201_CREATED)
def record_progress_evaluation(
    payload: PhDProgressEvaluationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDProgressEvaluationRead:
    if current_user.role in {"student", "member"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctoral students cannot conduct progress evaluations for themselves.",
        )

    _require_student_access(db, current_user, payload.student_id)

    new_ev = PhDProgressEvaluation(
        student_id=payload.student_id,
        evaluator_id=current_user.id,
        evaluation_period=payload.evaluation_period,
        current_stage=payload.current_stage,
        coursework_summary=payload.coursework_summary,
        research_progress_summary=payload.research_progress_summary,
        seminar_summary=payload.seminar_summary,
        teaching_summary=payload.teaching_summary,
        overall_rating=payload.overall_rating,
        action_plan=payload.action_plan,
        follow_up_date=payload.follow_up_date,
        evaluation_date=payload.evaluation_date or date.today(),
    )
    db.add(new_ev)
    db.commit()
    db.refresh(new_ev)

    item = PhDProgressEvaluationRead.model_validate(new_ev)
    if new_ev.student:
        item.student_name = new_ev.student.full_name or new_ev.student.email
    item.evaluator_name = current_user.full_name or current_user.email
    return item


# ---------------------------------------------------------------------------
# 7. 18 Reaccreditation Folders
# ---------------------------------------------------------------------------
@router.get("/reaccreditation-folders", response_model=list[PhDReaccreditationFolderRead])
def get_reaccreditation_folders(
    academic_year: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PhDReaccreditationFolderRead]:
    _ = get_accessible_phd_student_ids(db, current_user)

    query = db.query(PhDReaccreditationFolder)
    if academic_year:
        query = query.filter(PhDReaccreditationFolder.academic_year == academic_year)
    records = query.order_by(PhDReaccreditationFolder.folder_number.asc()).all()

    results = []
    for r in records:
        item = PhDReaccreditationFolderRead.model_validate(r)
        if r.uploaded_by:
            item.uploaded_by_name = r.uploaded_by.full_name or r.uploaded_by.email
        results.append(item)
    return results


@router.post("/reaccreditation-folders", response_model=PhDReaccreditationFolderRead, status_code=status.HTTP_201_CREATED)
def upload_reaccreditation_folder_doc(
    payload: PhDReaccreditationFolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PhDReaccreditationFolderRead:
    if current_user.role in {"student", "member"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctoral candidates cannot upload accreditation evidence.",
        )
    _ = get_accessible_phd_student_ids(db, current_user)

    new_doc = PhDReaccreditationFolder(
        folder_number=payload.folder_number,
        folder_name=payload.folder_name,
        academic_year=payload.academic_year,
        file_name=payload.file_name,
        file_url=payload.file_url,
        description=payload.description,
        uploaded_by_id=current_user.id,
        status=payload.status,
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)

    item = PhDReaccreditationFolderRead.model_validate(new_doc)
    item.uploaded_by_name = current_user.full_name or current_user.email
    return item


# ---------------------------------------------------------------------------
# 8. Regulatory Early-Warning Reminders Dispatch
# ---------------------------------------------------------------------------
@router.post("/regulatory-reminders")
def send_regulatory_inactivity_reminders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_roles = _get_user_roles(db, current_user)
    allowed_roles = {"system_admin", "deputy_rector", "dean", "hod", "project_coordinator", "project_supervisor", "lecturer"}
    if not (user_roles & allowed_roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to dispatch regulatory supervision reminders.",
        )

    accessible_student_ids = get_accessible_phd_student_ids(db, current_user)
    if accessible_student_ids is not None and len(accessible_student_ids) == 0:
        return {
            "success": True,
            "message": "No candidates in your assigned scope.",
            "candidates_evaluated": 0,
            "inactive_candidates_found": 0,
            "students_notified": 0,
            "supervisors_notified": 0,
            "details": [],
        }

    q = db.query(User).filter(
        User.role.in_(["student", "member"]),
        or_(
            func.lower(User.program).like("%phd%"),
            func.lower(User.program).like("%doctor%"),
            User.id.in_(db.query(PhDSupervisionLog.student_id)),
            User.id.in_(db.query(PhDProgressionProfile.student_id)),
        ),
    )
    if accessible_student_ids is not None:
        q = q.filter(User.id.in_(accessible_student_ids))

    candidates = q.all()
    today = date.today()
    students_notified = 0
    supervisors_notified = 0
    details = []

    for st in candidates:
        latest_log = db.query(PhDSupervisionLog).filter(
            PhDSupervisionLog.student_id == st.id
        ).order_by(desc(PhDSupervisionLog.meeting_date)).first()

        last_date = latest_log.meeting_date if latest_log else None
        days_since = (today - last_date).days if last_date else None
        is_inactive = (days_since is None) or (days_since > 60)

        if not is_inactive:
            continue

        days_text = f"{days_since} days" if days_since is not None else "no recorded session since admission"
        last_date_str = last_date.strftime("%d %b %Y") if last_date else "None on record"

        st_name = st.full_name or "Doctoral Candidate"
        create_notification(
            db=db,
            user_id=st.id,
            message=(
                f"Regulatory Early-Warning: No research supervision session logged in the PhD Hub for {days_text} "
                f"(last recorded: {last_date_str}). Please schedule a supervision meeting immediately."
            ),
            ntype="phd_supervision_inactivity_student",
        )
        students_notified += 1

        supervisor_ids = set()
        prof = db.query(PhDProgressionProfile).filter(PhDProgressionProfile.student_id == st.id).first()
        if prof and prof.dissertation_supervisor_id:
            supervisor_ids.add(prof.dissertation_supervisor_id)
        paper = db.query(Paper).filter(Paper.created_by_id == st.id).first()
        if paper and paper.supervisor_id:
            supervisor_ids.add(paper.supervisor_id)
        if latest_log and latest_log.supervisor_id:
            supervisor_ids.add(latest_log.supervisor_id)

        for sup_id in supervisor_ids:
            sup_user = db.query(User).filter(User.id == sup_id).first()
            if sup_user:
                create_notification(
                    db=db,
                    user_id=sup_user.id,
                    message=(
                        f"Doctoral Supervision Alert: PhD Candidate {st_name} ({st.email}) has been inactive for {days_text} "
                        f"(last session: {last_date_str}). Please schedule and log a monthly supervision session."
                    ),
                    ntype="phd_supervision_inactivity_supervisor",
                )
                supervisors_notified += 1

        details.append({
            "student_id": st.id,
            "student_name": st_name,
            "student_email": st.email,
            "days_since_last_meeting": days_since,
            "supervisors_contacted": len(supervisor_ids),
        })

    return {
        "success": True,
        "message": f"Dispatched regulatory reminders for {len(details)} inactive doctoral candidate(s).",
        "candidates_evaluated": len(candidates),
        "inactive_candidates_found": len(details),
        "students_notified": students_notified,
        "supervisors_notified": supervisors_notified,
        "details": details,
    }
