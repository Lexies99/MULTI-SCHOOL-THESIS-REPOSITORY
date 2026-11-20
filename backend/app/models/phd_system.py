from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Float,
    Text,
    Date,
    DateTime,
    ForeignKey,
)
from sqlalchemy.orm import relationship

from app.models.base import Base


class PhDSupervisionLog(Base):
    __tablename__ = "phd_supervision_logs"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    supervisor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    meeting_date = Column(Date, nullable=False)
    meeting_mode = Column(String(50), nullable=False, default="In-Person")  # In-Person, Virtual, Hybrid
    research_stage = Column(String(100), nullable=False, default="Proposal Preparation")
    work_submitted = Column(Text, nullable=True)
    feedback_given = Column(Text, nullable=True)
    next_task = Column(Text, nullable=True)
    progress_rating = Column(String(50), nullable=False, default="Satisfactory")  # Satisfactory, Needs Improvement
    supervisor_concerns = Column(Text, nullable=True)
    action_required = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    student = relationship("User", foreign_keys=[student_id], backref="phd_supervision_logs_as_student")
    supervisor = relationship("User", foreign_keys=[supervisor_id], backref="phd_supervision_logs_as_supervisor")


class PhDSeminar(Base):
    __tablename__ = "phd_seminars"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    seminar_title = Column(String(255), nullable=False)
    seminar_category = Column(String(100), nullable=False)  # 7 standard categories
    seminar_date = Column(Date, nullable=False)
    attended = Column(Boolean, default=True, nullable=False)
    is_presenter = Column(Boolean, default=False, nullable=False)
    department = Column(String(150), nullable=True)
    evidence_url = Column(String(500), nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    student = relationship("User", foreign_keys=[student_id], backref="phd_seminars")


class PhDComprehensiveExam(Base):
    __tablename__ = "phd_comprehensive_exams"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assessor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    coursework_completed = Column(Boolean, default=True, nullable=False)
    cgpa = Column(Float, nullable=True)
    specialization = Column(String(150), nullable=True)
    paper_part = Column(String(200), nullable=True)
    score = Column(Float, nullable=True)
    application_date = Column(Date, nullable=True)
    exam_date = Column(Date, nullable=True)
    attempt_number = Column(Integer, default=1, nullable=False)  # 1 or 2
    committee_members = Column(Text, nullable=True)
    result = Column(String(50), default="Pending", nullable=False)  # Pending, Pass, Conditional Pass, Fail
    advanced_to_candidacy = Column(Boolean, default=False, nullable=False)
    appeal_status = Column(String(50), nullable=True)
    remedial_instructions = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    student = relationship("User", foreign_keys=[student_id], backref="phd_comprehensive_exams")
    assessor = relationship("User", foreign_keys=[assessor_id])


class PhDCourseworkRecord(Base):
    """Stage 1: Enrolled courses, assignments, coursework, exams, and letter grades."""
    __tablename__ = "phd_coursework_records"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_code = Column(String(50), nullable=False)
    course_title = Column(String(255), nullable=False)
    academic_year = Column(String(50), nullable=False, default="2025/2026")
    semester = Column(String(50), nullable=False, default="Semester 1")
    credit_hours = Column(Integer, nullable=False, default=3)
    assignment_score = Column(Float, nullable=True)
    coursework_score = Column(Float, nullable=True)
    exam_score = Column(Float, nullable=True)
    total_score = Column(Float, nullable=True)
    letter_grade = Column(String(10), nullable=True)
    grade_point = Column(Float, nullable=True)
    status = Column(String(40), nullable=False, default="Enrolled")  # Enrolled, Completed, Passed, Failed
    instructor_name = Column(String(200), nullable=True)
    remarks = Column(Text, nullable=True)
    recorded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    student = relationship("User", foreign_keys=[student_id], backref="phd_coursework_records")
    recorded_by = relationship("User", foreign_keys=[recorded_by_id])


class PhDProgressionProfile(Base):
    """End-to-end 6-Stage Doctoral Progression Gatekeeper Profile per PhD Student."""
    __tablename__ = "phd_progression_profiles"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    # Stage 1 & 2: Academic Advisor & Coursework Clearance -> Comp Exam Assessor
    advisor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    advisor_cleared_for_comps = Column(Boolean, default=False, nullable=False)
    advisor_clearance_date = Column(Date, nullable=True)
    advisor_clearance_notes = Column(Text, nullable=True)
    comp_assessor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    comp_assessor_assigned_at = Column(DateTime(timezone=True), nullable=True)

    # Stage 3: Dissertation Supervisor (strictly gated on passing Comp Exam)
    dissertation_supervisor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    co_supervisor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    supervisor_assigned_at = Column(DateTime(timezone=True), nullable=True)

    # Stage 5: Pre-Viva Internal Examiner Assessment & Clearance
    pre_viva_examiner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    pre_viva_date = Column(Date, nullable=True)
    pre_viva_score = Column(Float, nullable=True)
    pre_viva_verdict = Column(String(60), nullable=True)  # Pending, Pass, Pass with Minor Corrections, Pass with Major Corrections, Repeat Pre-Viva
    pre_viva_cleared = Column(Boolean, default=False, nullable=False)
    pre_viva_remarks = Column(Text, nullable=True)

    # Stage 6: External Examiner Dispatch, Viva Voce & Official Defense Marks
    external_examiner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    external_dispatched_at = Column(DateTime(timezone=True), nullable=True)
    viva_date = Column(Date, nullable=True)
    internal_examiner_mark = Column(Float, nullable=True)
    external_examiner_mark = Column(Float, nullable=True)
    oral_defense_mark = Column(Float, nullable=True)
    overall_defense_mark = Column(Float, nullable=True)
    viva_verdict = Column(String(60), nullable=True)  # Pending, Pass, Pass with Minor Corrections, Pass with Major Corrections, Repeat Viva, Fail
    viva_remarks = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    student = relationship("User", foreign_keys=[student_id], backref="phd_progression_profile")
    advisor = relationship("User", foreign_keys=[advisor_id])
    comp_assessor = relationship("User", foreign_keys=[comp_assessor_id])
    dissertation_supervisor = relationship("User", foreign_keys=[dissertation_supervisor_id])
    co_supervisor = relationship("User", foreign_keys=[co_supervisor_id])
    pre_viva_examiner = relationship("User", foreign_keys=[pre_viva_examiner_id])
    external_examiner = relationship("User", foreign_keys=[external_examiner_id])


class PhDTeachingRequirement(Base):
    __tablename__ = "phd_teaching_requirements"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_taught = Column(String(200), nullable=False)
    semester = Column(String(100), nullable=False)
    department = Column(String(150), nullable=True)
    supervising_faculty_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    teaching_role = Column(String(100), default="Teaching Assistant", nullable=False)
    faculty_evaluation_score = Column(Float, nullable=True)
    student_evaluation_score = Column(Float, nullable=True)
    feedback_summary = Column(Text, nullable=True)
    improvement_plan = Column(Text, nullable=True)
    is_completed = Column(Boolean, default=False, nullable=False)
    completion_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    student = relationship("User", foreign_keys=[student_id], backref="phd_teaching_requirements")
    supervising_faculty = relationship("User", foreign_keys=[supervising_faculty_id])


class PhDProgressEvaluation(Base):
    __tablename__ = "phd_progress_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    evaluator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    evaluation_period = Column(String(100), nullable=False)  # e.g., "2025/2026 Semester 1"
    current_stage = Column(String(100), nullable=True)
    coursework_summary = Column(Text, nullable=True)
    research_progress_summary = Column(Text, nullable=True)
    seminar_summary = Column(Text, nullable=True)
    teaching_summary = Column(Text, nullable=True)
    overall_rating = Column(String(50), default="Satisfactory", nullable=False)  # Satisfactory, Needs Improvement, Recommend Dismissal
    action_plan = Column(Text, nullable=True)
    follow_up_date = Column(Date, nullable=True)
    evaluation_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    student = relationship("User", foreign_keys=[student_id], backref="phd_progress_evaluations")
    evaluator = relationship("User", foreign_keys=[evaluator_id])


class PhDReaccreditationFolder(Base):
    __tablename__ = "phd_reaccreditation_folders"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    folder_number = Column(Integer, nullable=False, index=True)  # 1 to 18
    folder_name = Column(String(200), nullable=False)
    academic_year = Column(String(50), nullable=False, index=True)  # e.g., "2024/2025"
    file_name = Column(String(255), nullable=False)
    file_url = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="Verified", nullable=False)  # Draft, Verified, Accreditation Ready
    uploaded_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
