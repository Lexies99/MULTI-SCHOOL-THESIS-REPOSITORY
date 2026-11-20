from __future__ import annotations

from datetime import date, datetime
from pydantic import BaseModel, Field, model_validator
from typing import Optional


class PhDSupervisionLogCreate(BaseModel):
    student_id: int
    meeting_date: date
    meeting_mode: str = "In-Person"
    research_stage: str = "Proposal Preparation"
    work_submitted: Optional[str] = None
    feedback_given: Optional[str] = None
    next_task: Optional[str] = None
    progress_rating: str = "Satisfactory"
    supervisor_concerns: Optional[str] = None
    action_required: Optional[str] = None


class PhDSupervisionLogRead(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    supervisor_id: int
    supervisor_name: Optional[str] = None
    meeting_date: date
    meeting_mode: str
    research_stage: str
    work_submitted: Optional[str] = None
    feedback_given: Optional[str] = None
    next_task: Optional[str] = None
    progress_rating: str
    supervisor_concerns: Optional[str] = None
    action_required: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PhDSeminarCreate(BaseModel):
    student_id: int
    seminar_title: Optional[str] = None
    title: Optional[str] = None
    seminar_category: str
    seminar_date: date
    attended: bool = True
    is_presenter: bool = False
    department: Optional[str] = None
    evidence_url: Optional[str] = None
    venue_or_url: Optional[str] = None
    evaluator_name: Optional[str] = None
    evaluator_feedback: Optional[str] = None
    score_or_verdict: Optional[str] = None
    remarks: Optional[str] = None

    @model_validator(mode="after")
    def sync_aliases(self) -> "PhDSeminarCreate":
        resolved_title = (self.seminar_title or self.title or "").strip()
        if not resolved_title:
            raise ValueError("Seminar title is required")
        self.seminar_title = resolved_title
        self.title = resolved_title
        if not self.evidence_url and self.venue_or_url:
            self.evidence_url = self.venue_or_url
        if not self.remarks:
            parts = []
            if self.score_or_verdict:
                parts.append(f"Verdict: {self.score_or_verdict}")
            if self.evaluator_name:
                parts.append(f"Evaluator: {self.evaluator_name}")
            if self.evaluator_feedback:
                parts.append(self.evaluator_feedback)
            if parts:
                self.remarks = " | ".join(parts)
        return self


class PhDSeminarRead(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    seminar_title: str
    title: Optional[str] = None
    seminar_category: str
    seminar_date: date
    attended: bool
    is_presenter: bool
    department: Optional[str] = None
    evidence_url: Optional[str] = None
    venue_or_url: Optional[str] = None
    evaluator_name: Optional[str] = None
    evaluator_feedback: Optional[str] = None
    score_or_verdict: Optional[str] = None
    remarks: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PhDComprehensiveExamCreate(BaseModel):
    student_id: int
    assessor_id: Optional[int] = None
    coursework_completed: bool = True
    cgpa: Optional[float] = None
    specialization: Optional[str] = None
    paper_part: Optional[str] = None
    score: Optional[float] = None
    application_date: Optional[date] = None
    exam_date: Optional[date] = None
    attempt_number: int = 1
    committee_members: Optional[str] = None
    result: str = "Pending"  # Pending, Pass, Conditional Pass, Fail
    advanced_to_candidacy: bool = False
    appeal_status: Optional[str] = None
    remedial_instructions: Optional[str] = None
    remarks: Optional[str] = None


class PhDComprehensiveExamRead(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    assessor_id: Optional[int] = None
    assessor_name: Optional[str] = None
    coursework_completed: bool
    cgpa: Optional[float] = None
    specialization: Optional[str] = None
    paper_part: Optional[str] = None
    score: Optional[float] = None
    application_date: Optional[date] = None
    exam_date: Optional[date] = None
    attempt_number: int
    committee_members: Optional[str] = None
    result: str
    advanced_to_candidacy: bool
    appeal_status: Optional[str] = None
    remedial_instructions: Optional[str] = None
    remarks: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PhDTeachingRequirementCreate(BaseModel):
    student_id: int
    course_taught: Optional[str] = None
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    academic_year: Optional[str] = None
    semester: str = "Semester 1"
    department: Optional[str] = None
    supervising_faculty_id: Optional[int] = None
    teaching_role: str = "Teaching Assistant"
    duties_description: Optional[str] = None
    contact_hours: Optional[int] = 45
    evaluation_rating: Optional[str] = None
    faculty_feedback: Optional[str] = None
    faculty_evaluation_score: Optional[float] = None
    student_evaluation_score: Optional[float] = None
    feedback_summary: Optional[str] = None
    improvement_plan: Optional[str] = None
    is_completed: bool = False
    completion_date: Optional[date] = None

    @model_validator(mode="after")
    def sync_course_fields(self) -> "PhDTeachingRequirementCreate":
        if not self.course_taught:
            combined = ": ".join(p for p in [(self.course_code or "").strip(), (self.course_title or "").strip()] if p)
            if not combined:
                raise ValueError("Course code or course title is required")
            self.course_taught = combined
        if not self.feedback_summary and (self.faculty_feedback or self.duties_description):
            self.feedback_summary = self.faculty_feedback or self.duties_description
        if self.academic_year and self.academic_year not in self.semester:
            self.semester = f"{self.academic_year} - {self.semester}"
        return self


class PhDTeachingRequirementRead(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    course_taught: str
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    academic_year: Optional[str] = None
    semester: str
    department: Optional[str] = None
    supervising_faculty_id: Optional[int] = None
    supervising_faculty_name: Optional[str] = None
    teaching_role: str
    contact_hours: int = 45
    faculty_evaluation_score: Optional[float] = None
    student_evaluation_score: Optional[float] = None
    feedback_summary: Optional[str] = None
    improvement_plan: Optional[str] = None
    is_completed: bool
    completion_date: Optional[date] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PhDProgressEvaluationCreate(BaseModel):
    student_id: int
    evaluation_period: str
    current_stage: Optional[str] = None
    coursework_summary: Optional[str] = None
    research_progress_summary: Optional[str] = None
    seminar_summary: Optional[str] = None
    teaching_summary: Optional[str] = None
    overall_rating: str = "Satisfactory"
    action_plan: Optional[str] = None
    follow_up_date: Optional[date] = None
    evaluation_date: Optional[date] = None


class PhDProgressEvaluationRead(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    evaluator_id: Optional[int] = None
    evaluator_name: Optional[str] = None
    evaluation_period: str
    current_stage: Optional[str] = None
    coursework_summary: Optional[str] = None
    research_progress_summary: Optional[str] = None
    seminar_summary: Optional[str] = None
    teaching_summary: Optional[str] = None
    overall_rating: str
    action_plan: Optional[str] = None
    follow_up_date: Optional[date] = None
    evaluation_date: Optional[date] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PhDReaccreditationFolderCreate(BaseModel):
    folder_number: int
    folder_name: str
    academic_year: str = "2025/2026"
    file_name: str
    file_url: str
    description: Optional[str] = None
    status: str = "Verified"


class PhDReaccreditationFolderRead(BaseModel):
    id: int
    folder_number: int
    folder_name: str
    academic_year: str
    file_name: str
    file_url: str
    description: Optional[str] = None
    uploaded_by_id: Optional[int] = None
    uploaded_by_name: Optional[str] = None
    status: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# 6-Stage Doctoral Progression Pipeline Schemas
# ---------------------------------------------------------------------------

class PhDCourseworkRecordCreate(BaseModel):
    student_id: int
    course_code: str
    course_title: str
    academic_year: str = "2025/2026"
    semester: str = "Semester 1"
    credit_hours: int = 3
    assignment_score: Optional[float] = None
    coursework_score: Optional[float] = None
    exam_score: Optional[float] = None
    total_score: Optional[float] = None
    letter_grade: Optional[str] = None
    status: str = "Enrolled"
    instructor_name: Optional[str] = None
    remarks: Optional[str] = None


class PhDCourseworkRecordUpdate(BaseModel):
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    academic_year: Optional[str] = None
    semester: Optional[str] = None
    credit_hours: Optional[int] = None
    assignment_score: Optional[float] = None
    coursework_score: Optional[float] = None
    exam_score: Optional[float] = None
    total_score: Optional[float] = None
    letter_grade: Optional[str] = None
    status: Optional[str] = None
    instructor_name: Optional[str] = None
    remarks: Optional[str] = None


class PhDCourseworkRecordRead(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    course_code: str
    course_title: str
    academic_year: str
    semester: str
    credit_hours: int
    assignment_score: Optional[float] = None
    coursework_score: Optional[float] = None
    exam_score: Optional[float] = None
    total_score: Optional[float] = None
    letter_grade: Optional[str] = None
    grade_point: Optional[float] = None
    status: str
    instructor_name: Optional[str] = None
    remarks: Optional[str] = None
    recorded_by_id: Optional[int] = None
    recorded_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PhDAssignAdvisorRequest(BaseModel):
    advisor_id: int


class PhDAdvisorClearanceRequest(BaseModel):
    cleared: bool = True
    notes: Optional[str] = None


class PhDAssignAssessorRequest(BaseModel):
    assessor_id: int


class PhDAssignDissertationSupervisorRequest(BaseModel):
    dissertation_supervisor_id: int
    co_supervisor_id: Optional[int] = None


class PhDPreVivaUpdateRequest(BaseModel):
    pre_viva_examiner_id: Optional[int] = None
    pre_viva_date: Optional[date] = None
    pre_viva_score: Optional[float] = None
    pre_viva_verdict: Optional[str] = None
    pre_viva_cleared: Optional[bool] = None
    pre_viva_remarks: Optional[str] = None


class PhDVivaDefenseUpdateRequest(BaseModel):
    external_examiner_id: Optional[int] = None
    viva_date: Optional[date] = None
    internal_examiner_mark: Optional[float] = None
    external_examiner_mark: Optional[float] = None
    oral_defense_mark: Optional[float] = None
    overall_defense_mark: Optional[float] = None
    viva_verdict: Optional[str] = None
    viva_remarks: Optional[str] = None


class PhDFacultyMemberRead(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    department: Optional[str] = None
    school: Optional[str] = None
    is_external: bool = False


class PhDProgressionProfileRead(BaseModel):
    id: Optional[int] = None
    student_id: int
    student_name: Optional[str] = None
    student_email: Optional[str] = None

    # Stage 1
    advisor_id: Optional[int] = None
    advisor_name: Optional[str] = None
    courses_count: int = 0
    completed_courses_count: int = 0
    total_credits: int = 0
    cumulative_gpa: Optional[float] = None
    advisor_cleared_for_comps: bool = False
    advisor_clearance_date: Optional[date] = None
    advisor_clearance_notes: Optional[str] = None

    # Stage 2
    comp_assessor_id: Optional[int] = None
    comp_assessor_name: Optional[str] = None
    comp_assessor_assigned_at: Optional[datetime] = None

    # Stage 3
    comp_exam_passed: bool = False
    latest_comp_exam_result: str = "Not Sat"
    latest_comp_exam_score: Optional[float] = None
    dissertation_supervisor_id: Optional[int] = None
    dissertation_supervisor_name: Optional[str] = None
    co_supervisor_id: Optional[int] = None
    co_supervisor_name: Optional[str] = None
    supervisor_assigned_at: Optional[datetime] = None

    # Stage 4
    seminars_attended_count: int = 0
    seminars_presented_count: int = 0
    supervision_logs_count: int = 0

    # Stage 5
    pre_viva_examiner_id: Optional[int] = None
    pre_viva_examiner_name: Optional[str] = None
    pre_viva_date: Optional[date] = None
    pre_viva_score: Optional[float] = None
    pre_viva_verdict: Optional[str] = None
    pre_viva_cleared: bool = False
    pre_viva_remarks: Optional[str] = None

    # Stage 6
    external_examiner_id: Optional[int] = None
    external_examiner_name: Optional[str] = None
    external_dispatched_at: Optional[datetime] = None
    viva_date: Optional[date] = None
    internal_examiner_mark: Optional[float] = None
    external_examiner_mark: Optional[float] = None
    oral_defense_mark: Optional[float] = None
    overall_defense_mark: Optional[float] = None
    viva_verdict: Optional[str] = None
    viva_remarks: Optional[str] = None

    # Computed summary
    current_stage_number: int = 1
    current_stage_label: str = "Stage 1: Coursework & Advisor"


class PhDStudentDossier(BaseModel):
    student_id: int
    student_name: str
    student_email: str
    school_id: Optional[str] = None
    specialization: Optional[str] = None
    program: Optional[str] = None
    research_stage: str
    candidacy_status: str  # "Pre-Candidacy", "PhD Candidate", "Completed"
    comprehensive_result: str
    seminars_attended_count: int
    seminars_presented_count: int
    teaching_completed: bool
    last_meeting_date: Optional[date] = None
    days_since_last_meeting: Optional[int] = None
    inactivity_alert: bool = False  # True if > 60 days
    supervisors: list[str] = Field(default_factory=list)
    recent_eval_rating: Optional[str] = None
    # 6-Stage Progression Pipeline Snapshot
    current_stage_number: int = 1
    current_stage_label: str = "Stage 1: Coursework & Advisor"
    courses_count: int = 0
    cumulative_gpa: Optional[float] = None
    advisor_id: Optional[int] = None
    advisor_name: Optional[str] = None
    advisor_cleared_for_comps: bool = False
    comp_assessor_id: Optional[int] = None
    comp_assessor_name: Optional[str] = None
    comp_exam_passed: bool = False
    dissertation_supervisor_id: Optional[int] = None
    dissertation_supervisor_name: Optional[str] = None
    pre_viva_examiner_id: Optional[int] = None
    pre_viva_examiner_name: Optional[str] = None
    pre_viva_cleared: bool = False
    pre_viva_score: Optional[float] = None
    pre_viva_verdict: Optional[str] = None
    external_examiner_id: Optional[int] = None
    external_examiner_name: Optional[str] = None
    overall_defense_mark: Optional[float] = None
    viva_verdict: Optional[str] = None
