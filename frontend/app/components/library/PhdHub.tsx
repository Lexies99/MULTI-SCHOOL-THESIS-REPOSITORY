import { useState, useEffect, useMemo } from 'react'
import {
  Calendar,
  Clock,
  BookOpen,
  Award,
  FileCheck,
  AlertTriangle,
  RefreshCw,
  FolderOpen,
  UserCheck,
  Search,
  Mail,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Lock,
  Unlock,
  CheckCircle2,
  GraduationCap,
  ShieldCheck,
  BookMarked,
  Trash2,
  Pencil,
} from 'lucide-react'
import {
  apiGetPhdDossiers,
  apiGetPhdFacultyDirectory,
  apiGetPhdCoursework,
  apiCreatePhdCoursework,
  apiUpdatePhdCoursework,
  apiDeletePhdCoursework,
  apiGetPhdProgression,
  apiAssignPhdAdvisor,
  apiSetPhdAdvisorClearance,
  apiAssignPhdAssessor,
  apiAssignPhdDissertationSupervisor,
  apiUpdatePhdPreViva,
  apiUpdatePhdVivaDefense,
  apiGetSupervisionLogs,
  apiCreateSupervisionLog,
  apiGetPhdSeminars,
  apiRecordPhdSeminar,
  apiGetComprehensiveExams,
  apiRecordComprehensiveExam,
  apiGetTeachingRequirements,
  apiRecordTeachingRequirement,
  apiGetProgressEvaluations,
  apiRecordProgressEvaluation,
  apiGetReaccreditationFolders,
  apiUploadReaccreditationFolderDoc,
  apiSendPhdRegulatoryReminders,
} from '../../lib/api'

import type {
  ApiPhDStudentDossier,
  ApiPhDFacultyMember,
  ApiPhDCourseworkRecord,
  ApiPhDCourseworkCreate,
  ApiPhDProgressionProfile,
  ApiPhDSupervisionLog,
  ApiPhDSupervisionLogCreate,
  ApiPhDSeminar,
  PhDSeminarCreate,
  ApiPhDComprehensiveExam,
  PhDComprehensiveExamCreate,
  ApiPhDTeachingRequirement,
  PhDTeachingRequirementCreate,
  ApiPhDProgressEvaluation,
  PhDProgressEvaluationCreate,
  ApiPhDReaccreditationFolder,
  PhDReaccreditationFolderCreate,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useTenant } from '../../context/TenantContext'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

const RESEARCH_STAGES = [
  'Proposal Preparation',
  'Proposal Defence & Ethics Sign-Off',
  'Literature Review & Theoretical Framework',
  'Methodology & Research Design',
  'Instrument Development & Pilot Study',
  'Data Collection & Fieldwork',
  'Data Analysis & Interpretation',
  'Empirical Findings & Discussion',
  'Full Draft Synthesis & Turnitin Plagiarism Check',
  'Departmental Seminar / Internal Review',
  'External Examination Submission',
  'Oral Examination (Viva Voce) & Final Corrections',
]

const SEMINAR_CATEGORIES = [
  'Departmental Research Seminar',
  'Doctoral Colloquium',
  'National Academic Conference',
  'International Peer-Reviewed Conference',
  'Methodology / Quantitative Workshop',
  'Proposal Defence Seminar',
  'Pre-Viva / Final Results Seminar',
]

const REACCREDITATION_FOLDERS = [
  { num: 1, name: 'Programme Approval & Accreditation Documents' },
  { num: 2, name: 'Curriculum, Syllabi & Course Outlines' },
  { num: 3, name: 'Admission Records & Interview Rubrics' },
  { num: 4, name: 'Enrolment & Specialization Registers' },
  { num: 5, name: 'Course Registration & Grade Submissions' },
  { num: 6, name: 'Comprehensive Examination Records' },
  { num: 7, name: 'Thesis Proposal Approvals & Ethics Sign-Off' },
  { num: 8, name: 'Supervision Meeting Logs & Workload Reports' },
  { num: 9, name: 'Research Seminar Registers (7 Types)' },
  { num: 10, name: 'Teaching Requirement Observation Reports' },
  { num: 11, name: 'Six-Month Student Progress Evaluation Reports' },
  { num: 12, name: 'Thesis Examination, Viva & Examiner Reports' },
  { num: 13, name: 'Graduate Output, Titles & Completions' },
  { num: 14, name: 'Staff Profiles, PhD Qualifications & Ranks' },
  { num: 15, name: 'Faculty Research Publications & Grants' },
  { num: 16, name: 'Library Holdings, Databases & Facility Resources' },
  { num: 17, name: 'Student Satisfaction & Supervision Surveys' },
  { num: 18, name: 'Quality Assurance Audits & Action Plans' },
]

const PIPELINE_STAGES = [
  { num: 1, short: '1. Coursework & Advisor', tab: 'coursework' as const },
  { num: 2, short: '2. Comp Assessor', tab: 'exams' as const },
  { num: 3, short: '3. Comp & Supervisor', tab: 'exams' as const },
  { num: 4, short: '4. Seminars & Logs', tab: 'seminars' as const },
  { num: 5, short: '5. Pre-Viva', tab: 'viva' as const },
  { num: 6, short: '6. Viva & Defense', tab: 'viva' as const },
]

function extractError(err: unknown): string {
  if (!(err instanceof Error)) return 'Operation failed'
  try {
    const parsed = JSON.parse(err.message) as { detail?: string }
    return parsed.detail || err.message
  } catch {
    return err.message
  }
}

export function PhdHub() {
  const { user } = useAuth()
  const { tenant, theme } = useTenant()
  const isDark = theme === 'dark'
  const token = typeof window !== 'undefined' ? (localStorage.getItem('murrs_access_token') || '') : ''

  const userRoles = (user?.roles || []) as string[]
  const hasRole = (r: string) => user?.role === r || userRoles.includes(r)
  const isLeadership =
    hasRole('system_admin') ||
    hasRole('deputy_rector') ||
    hasRole('dean') ||
    hasRole('hod') ||
    hasRole('project_coordinator')
  const isStudent =
    (user?.role === 'student' || user?.role === 'member') &&
    !userRoles.some((r) =>
      ['system_admin', 'deputy_rector', 'dean', 'hod', 'project_coordinator', 'project_supervisor', 'lecturer', 'external_examiner'].includes(r)
    )
  const isSupervisorOrStaff = !isStudent

  const [activeSubTab, setActiveSubTab] = useState<
    'dossiers' | 'coursework' | 'exams' | 'seminars' | 'supervision' | 'viva' | 'teaching' | 'reviews' | 'calendar' | 'folders'
  >('dossiers')

  const [calendarDate, setCalendarDate] = useState(() => new Date())

  const [dossiers, setDossiers] = useState<ApiPhDStudentDossier[]>([])
  const [facultyList, setFacultyList] = useState<ApiPhDFacultyMember[]>([])
  const [courseworkList, setCourseworkList] = useState<ApiPhDCourseworkRecord[]>([])
  const [progression, setProgression] = useState<ApiPhDProgressionProfile | null>(null)
  const [supervisionLogs, setSupervisionLogs] = useState<ApiPhDSupervisionLog[]>([])
  const [seminars, setSeminars] = useState<ApiPhDSeminar[]>([])
  const [exams, setExams] = useState<ApiPhDComprehensiveExam[]>([])
  const [teachingList, setTeachingList] = useState<ApiPhDTeachingRequirement[]>([])
  const [evaluations, setEvaluations] = useState<ApiPhDProgressEvaluation[]>([])
  const [folders, setFolders] = useState<ApiPhDReaccreditationFolder[]>([])

  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<number | undefined>(undefined)
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Modals
  const [showCourseModal, setShowCourseModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState<ApiPhDCourseworkRecord | null>(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [showSeminarModal, setShowSeminarModal] = useState(false)
  const [showExamModal, setShowExamModal] = useState(false)
  const [showTeachingModal, setShowTeachingModal] = useState(false)
  const [showEvalModal, setShowEvalModal] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)

  // Stage Gate Inline Form States
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<number>(0)
  const [clearanceNotes, setClearanceNotes] = useState('')
  const [selectedAssessorId, setSelectedAssessorId] = useState<number>(0)
  const [selectedDissertationSupId, setSelectedDissertationSupId] = useState<number>(0)
  const [selectedCoSupId, setSelectedCoSupId] = useState<number>(0)

  // Stage 5: Pre-Viva State
  const [preVivaForm, setPreVivaForm] = useState({
    pre_viva_examiner_id: 0,
    pre_viva_date: new Date().toISOString().split('T')[0],
    pre_viva_score: '',
    pre_viva_verdict: 'Pending',
    pre_viva_cleared: false,
    pre_viva_remarks: '',
  })

  // Stage 6: External Viva & Defense Marks State
  const [vivaForm, setVivaForm] = useState({
    external_examiner_id: 0,
    viva_date: new Date().toISOString().split('T')[0],
    internal_examiner_mark: '',
    external_examiner_mark: '',
    oral_defense_mark: '',
    viva_verdict: 'Pending',
    viva_remarks: '',
  })

  // Coursework Form
  const [courseForm, setCourseForm] = useState<ApiPhDCourseworkCreate>({
    student_id: 0,
    course_code: '',
    course_title: '',
    academic_year: tenant?.academic_year || '2025/2026',
    semester: 'Semester 1',
    credit_hours: 3,
    assignment_score: undefined,
    coursework_score: undefined,
    exam_score: undefined,
    letter_grade: '',
    status: 'Enrolled',
    instructor_name: '',
    remarks: '',
  })

  // Existing Modal Form States
  const [logForm, setLogForm] = useState<ApiPhDSupervisionLogCreate>({
    student_id: 0,
    meeting_date: new Date().toISOString().split('T')[0],
    meeting_mode: 'In-Person',
    research_stage: 'Proposal Preparation',
    work_submitted: '',
    feedback_given: '',
    next_task: '',
    progress_rating: 'Satisfactory',
    supervisor_concerns: '',
    action_required: '',
  })

  const [seminarForm, setSeminarForm] = useState<PhDSeminarCreate>({
    student_id: 0,
    seminar_category: SEMINAR_CATEGORIES[0],
    title: '',
    seminar_date: new Date().toISOString().split('T')[0],
    is_presenter: false,
    attended: true,
    venue_or_url: 'Graduate Research Conference Room',
    evaluator_name: '',
    evaluator_feedback: '',
    score_or_verdict: 'Pass',
  })

  const [examForm, setExamForm] = useState<PhDComprehensiveExamCreate>({
    student_id: 0,
    attempt_number: 1,
    exam_date: new Date().toISOString().split('T')[0],
    paper_part: 'Major Field & Research Methodology',
    result: 'Pass',
    score: 75,
    committee_members: '',
    remedial_instructions: '',
  })

  const [teachingForm, setTeachingForm] = useState<PhDTeachingRequirementCreate>({
    student_id: 0,
    course_code: '',
    course_title: '',
    academic_year: tenant?.academic_year || '2025/2026',
    semester: 'First Semester',
    duties_description: 'Seminar facilitation, undergraduate tutoring, grading assistance',
    contact_hours: 45,
    evaluation_rating: 'Satisfactory',
    faculty_feedback: '',
    is_completed: true,
  })

  const [evalForm, setEvalForm] = useState<PhDProgressEvaluationCreate>({
    student_id: 0,
    evaluation_period: 'Semester 1, 2025/2026',
    evaluation_date: new Date().toISOString().split('T')[0],
    current_stage: 'Literature Review & Theoretical Framework',
    coursework_summary: '',
    research_progress_summary: '',
    seminar_summary: '',
    teaching_summary: '',
    overall_rating: 'Satisfactory',
    action_plan: '',
    follow_up_date: '',
  })

  const [folderForm, setFolderForm] = useState<PhDReaccreditationFolderCreate>({
    folder_number: 1,
    folder_name: REACCREDITATION_FOLDERS[0].name,
    academic_year: tenant?.academic_year || '2025/2026',
    file_name: '',
    file_url: '',
    description: '',
    status: 'Verified',
  })

  const syncProgressionForms = (prof: ApiPhDProgressionProfile | null) => {
    setProgression(prof)
    if (!prof) return
    setSelectedAdvisorId(prof.advisor_id || 0)
    setClearanceNotes(prof.advisor_clearance_notes || '')
    setSelectedAssessorId(prof.comp_assessor_id || 0)
    setSelectedDissertationSupId(prof.dissertation_supervisor_id || 0)
    setSelectedCoSupId(prof.co_supervisor_id || 0)
    setPreVivaForm({
      pre_viva_examiner_id: prof.pre_viva_examiner_id || 0,
      pre_viva_date: prof.pre_viva_date || new Date().toISOString().split('T')[0],
      pre_viva_score: prof.pre_viva_score != null ? String(prof.pre_viva_score) : '',
      pre_viva_verdict: prof.pre_viva_verdict || 'Pending',
      pre_viva_cleared: prof.pre_viva_cleared,
      pre_viva_remarks: prof.pre_viva_remarks || '',
    })
    setVivaForm({
      external_examiner_id: prof.external_examiner_id || 0,
      viva_date: prof.viva_date || new Date().toISOString().split('T')[0],
      internal_examiner_mark: prof.internal_examiner_mark != null ? String(prof.internal_examiner_mark) : '',
      external_examiner_mark: prof.external_examiner_mark != null ? String(prof.external_examiner_mark) : '',
      oral_defense_mark: prof.oral_defense_mark != null ? String(prof.oral_defense_mark) : '',
      viva_verdict: prof.viva_verdict || 'Pending',
      viva_remarks: prof.viva_remarks || '',
    })
  }

  const loadAll = async (overrideStudentId?: number) => {
    if (!token) return
    setLoading(true)
    try {
      const targetStudentId = isStudent ? user?.id : (overrideStudentId ?? selectedStudentId)
      const [dossierRes, facultyRes, cwRes, logsRes, semRes, examRes, teachRes, evalRes, foldRes, progRes] =
        await Promise.all([
          apiGetPhdDossiers(token).catch(() => []),
          apiGetPhdFacultyDirectory(token).catch(() => []),
          apiGetPhdCoursework(token, targetStudentId).catch(() => []),
          apiGetSupervisionLogs(token, targetStudentId).catch(() => []),
          apiGetPhdSeminars(token, targetStudentId).catch(() => []),
          apiGetComprehensiveExams(token, targetStudentId).catch(() => []),
          apiGetTeachingRequirements(token, targetStudentId).catch(() => []),
          apiGetProgressEvaluations(token, targetStudentId).catch(() => []),
          apiGetReaccreditationFolders(token).catch(() => []),
          targetStudentId ? apiGetPhdProgression(token, targetStudentId).catch(() => null) : Promise.resolve(null),
        ])
      setDossiers(dossierRes)
      setFacultyList(facultyRes)
      setCourseworkList(cwRes)
      setSupervisionLogs(logsRes)
      setSeminars(semRes)
      setExams(examRes)
      setTeachingList(teachRes)
      setEvaluations(evalRes)
      setFolders(foldRes)
      syncProgressionForms(progRes)
    } finally {
      setLoading(false)
    }
  }

  const [dispatchingReminders, setDispatchingReminders] = useState(false)

  const handleSendReminders = async () => {
    if (!token) return
    setDispatchingReminders(true)
    setFeedbackBanner(null)
    try {
      const res = await apiSendPhdRegulatoryReminders(token)
      setFeedbackBanner({
        type: 'success',
        text: `Dispatched: ${res.students_notified} student notice(s) and ${res.supervisors_notified} supervisor alert(s).`,
      })
      void loadAll()
    } catch (err) {
      setFeedbackBanner({ type: 'error', text: extractError(err) })
    } finally {
      setDispatchingReminders(false)
    }
  }

  const selectStudentForWorkspace = (sid: number) => {
    setSelectedStudentId(sid)
    setCourseForm((f) => ({ ...f, student_id: sid }))
    setLogForm((f) => ({ ...f, student_id: sid }))
    setSeminarForm((f) => ({ ...f, student_id: sid }))
    setTeachingForm((f) => ({ ...f, student_id: sid }))
    setExamForm((f) => ({ ...f, student_id: sid }))
    setEvalForm((f) => ({ ...f, student_id: sid }))
  }

  useEffect(() => {
    if (isStudent && user?.id) {
      selectStudentForWorkspace(user.id)
    }
  }, [isStudent, user?.id])

  useEffect(() => {
    if (!isStudent && dossiers.length > 0 && !selectedStudentId) {
      selectStudentForWorkspace(dossiers[0].student_id)
    }
  }, [dossiers, isStudent, selectedStudentId])

  useEffect(() => {
    void loadAll()
  }, [token, selectedStudentId, isStudent, user?.id])

  const activeStudent = useMemo(
    () => dossiers.find((d) => d.student_id === selectedStudentId) || dossiers[0] || null,
    [dossiers, selectedStudentId],
  )

  const internalFaculty = useMemo(
    () => facultyList.filter((f) => !f.is_external),
    [facultyList],
  )
  const externalExaminers = useMemo(() => {
    const ext = facultyList.filter((f) => f.is_external)
    return ext.length > 0 ? ext : facultyList
  }, [facultyList])

  const inactiveCount = dossiers.filter((d) => d.inactivity_alert).length
  const candidacyCount = dossiers.filter((d) => d.candidacy_status === 'PhD Candidate' || d.candidacy_status === 'Completed').length

  const filteredDossiers = dossiers.filter((d) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      d.student_name.toLowerCase().includes(q) ||
      d.student_email.toLowerCase().includes(q) ||
      (d.specialization || '').toLowerCase().includes(q) ||
      (d.current_stage_label || '').toLowerCase().includes(q)
    )
  })

  // Computed defense average preview in Stage 6 form
  const previewDefenseAvg = useMemo(() => {
    const nums = [
      vivaForm.internal_examiner_mark,
      vivaForm.external_examiner_mark,
      vivaForm.oral_defense_mark,
    ]
      .map((s) => (s.trim() === '' ? NaN : Number(s)))
      .filter((n) => Number.isFinite(n))
    if (nums.length === 0) return null
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1)
  }, [vivaForm.internal_examiner_mark, vivaForm.external_examiner_mark, vivaForm.oral_defense_mark])

  // Calendar Grid generator
  const calendarCells = useMemo(() => {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    const firstDayOfMonth = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const cells: Array<{
      day: number
      isCurrentMonth: boolean
      dateStr: string
      events: Array<{ label: string; isPositive: boolean }>
    }> = []

    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, isCurrentMonth: false, dateStr: '', events: [] })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayEvents: Array<{ label: string; isPositive: boolean }> = []
      supervisionLogs.forEach((l) => {
        if (l.meeting_date === dateStr) dayEvents.push({ label: `Log: ${(l.student_name || 'PhD').split(' ')[0]}`, isPositive: true })
      })
      seminars.forEach((s) => {
        if (s.seminar_date === dateStr) dayEvents.push({ label: `Sem: ${(s.student_name || 'PhD').split(' ')[0]}`, isPositive: true })
      })
      exams.forEach((e) => {
        if (e.exam_date === dateStr) dayEvents.push({ label: `Comp: ${(e.student_name || 'PhD').split(' ')[0]}`, isPositive: e.result === 'Pass' })
      })
      if (progression?.pre_viva_date === dateStr) {
        dayEvents.push({ label: 'Pre-Viva', isPositive: true })
      }
      if (progression?.viva_date === dateStr) {
        dayEvents.push({ label: 'Viva Defense', isPositive: true })
      }
      cells.push({ day: d, isCurrentMonth: true, dateStr, events: dayEvents })
    }

    const remaining = (35 - cells.length + 7) % 7
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, isCurrentMonth: false, dateStr: '', events: [] })
    }
    return cells
  }, [calendarDate, supervisionLogs, seminars, exams, progression])

  // Stage Gate Action Handlers
  const runProgressionAction = async (fn: () => Promise<ApiPhDProgressionProfile>, successMsg: string) => {
    setFeedbackBanner(null)
    try {
      const updated = await fn()
      syncProgressionForms(updated)
      setFeedbackBanner({ type: 'success', text: successMsg })
      await loadAll(updated.student_id)
    } catch (err) {
      setFeedbackBanner({ type: 'error', text: extractError(err) })
    }
  }

  const StudentSelectorBar = () =>
    !isStudent && dossiers.length > 0 ? (
      <div className="fp-card py-3.5 px-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[12px] font-bold uppercase tracking-wider text-[#6e766b]">Active Doctoral Candidate:</span>
          <select
            value={selectedStudentId || ''}
            onChange={(e) => selectStudentForWorkspace(Number(e.target.value))}
            className="h-9 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] font-semibold text-[#1a1d1a] min-w-[240px]"
          >
            {dossiers.map((d) => (
              <option key={d.student_id} value={d.student_id}>
                {d.student_name} — Stage {d.current_stage_number}/6
              </option>
            ))}
          </select>
        </div>
        {progression && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="default">Stage {progression.current_stage_number}/6</Badge>
            <span className="text-[#6e766b] font-medium">{progression.current_stage_label}</span>
          </div>
        )}
      </div>
    ) : null

  return (
    <div className="space-y-7">
      {/* ── PAGE TITLE & 6-STAGE SUB-NAVIGATION PILLS ── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold tracking-tight text-[#1a1d1a] leading-tight">
              {isStudent ? 'My Doctoral Progression Hub' : 'PhD Programme & Progression Hub'}
            </h1>
            <p className="text-[13px] text-[#6e766b] mt-1">
              6-Stage gated doctoral lifecycle: Coursework &amp; Advisor → Comp Assessor → Comp Exam &amp; Supervisor → Seminars &amp; Supervision → Pre-Viva → External Viva &amp; Defense Marks.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {inactiveCount > 0 && !isStudent && (
              <Button size="sm" variant="olive" onClick={handleSendReminders} disabled={dispatchingReminders}>
                <Mail className="size-3.5 mr-1.5" />
                {dispatchingReminders ? 'Sending...' : `Remind Inactive (${inactiveCount})`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void loadAll()} disabled={loading}>
              <RefreshCw className={`size-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'dossiers', label: isStudent ? 'My 6-Stage Pipeline' : 'Student Dossiers', icon: UserCheck },
            { key: 'coursework', label: '1. Coursework & Grades', icon: BookMarked },
            { key: 'exams', label: '2–3. Comp Exam & Supervisor', icon: Award },
            { key: 'seminars', label: '4. Seminars', icon: BookOpen },
            { key: 'supervision', label: '4. Supervision Logs', icon: Clock },
            { key: 'viva', label: '5–6. Pre-Viva & Viva Marks', icon: GraduationCap },
            { key: 'teaching', label: 'Teaching Practice', icon: FileCheck },
            { key: 'reviews', label: '6-Month Reviews', icon: ShieldCheck },
            { key: 'calendar', label: 'Calendar', icon: Calendar },
            { key: 'folders', label: '18 Accreditation Folders', icon: FolderOpen },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = activeSubTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSubTab(tab.key as any)}
                className={`fp-subnav-pill ${isActive ? 'fp-subnav-pill-active' : 'fp-subnav-pill-inactive'}`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {feedbackBanner && (
        <div
          className="p-3.5 rounded-xl text-[13px] font-medium flex items-center justify-between gap-3"
          style={{
            background:
              feedbackBanner.type === 'success'
                ? isDark
                  ? 'rgba(34, 197, 94, 0.14)'
                  : '#dcfce7'
                : isDark
                  ? 'rgba(239, 68, 68, 0.15)'
                  : '#fdf2f0',
            color:
              feedbackBanner.type === 'success'
                ? isDark
                  ? '#86efac'
                  : '#166534'
                : isDark
                  ? '#fca5a5'
                  : '#c93b2b',
            border: `1px solid ${
              feedbackBanner.type === 'success'
                ? isDark
                  ? 'rgba(34, 197, 94, 0.3)'
                  : '#bbf7d0'
                : isDark
                  ? 'rgba(239, 68, 68, 0.32)'
                  : '#f5d0ca'
            }`,
          }}
        >
          <span>{feedbackBanner.text}</span>
          <button type="button" onClick={() => setFeedbackBanner(null)} className="text-xs font-bold underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* TAB 1: STUDENT DOSSIERS & 6-STAGE PIPELINE OVERVIEW        */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'dossiers' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="fp-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-[#1a1d1a]">
                  {isStudent ? 'Current Stage' : 'Enrolled PhD Scholars'}
                </span>
                <UserCheck className="size-4 text-[#5a6552]" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[24px] font-bold text-[#1a1d1a]">
                  {isStudent ? `Stage ${dossiers[0]?.current_stage_number || 1} / 6` : dossiers.length}
                </span>
                {!isStudent && <ArrowUpRight className="size-5 text-[#3b7a57]" />}
              </div>
              <p className="text-[12px] text-[#8c9489] mt-1">
                {isStudent ? (dossiers[0]?.current_stage_label || 'Stage 1: Coursework & Advisor') : 'doctoral records tracked'}
              </p>
            </div>

            <div className="fp-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-[#1a1d1a]">Candidacy Achieved</span>
                <Award className="size-4 text-[#5a6552]" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[24px] font-bold text-[#1a1d1a]">
                  {isStudent ? (dossiers[0]?.candidacy_status || 'Pre-Candidacy') : candidacyCount}
                </span>
                <ArrowUpRight className="size-5 text-[#3b7a57]" />
              </div>
              <p className="text-[12px] text-[#8c9489] mt-1">passed comprehensive exam</p>
            </div>

            <div className="fp-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-[#1a1d1a]">Pre-Viva / Viva Active</span>
                <GraduationCap className="size-4 text-[#5a6552]" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[24px] font-bold text-[#1a1d1a]">
                  {isStudent
                    ? (dossiers[0]?.viva_verdict || (dossiers[0]?.pre_viva_cleared ? 'Pre-Viva Cleared' : 'Pending'))
                    : dossiers.filter((d) => d.current_stage_number >= 5).length}
                </span>
              </div>
              <p className="text-[12px] text-[#8c9489] mt-1">Stage 5–6 defense pipeline</p>
            </div>

            <div className="fp-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-[#1a1d1a]">60-Day Inactivity Flag</span>
                <AlertTriangle className="size-4 text-[#5a6552]" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[24px] font-bold text-[#1a1d1a]">{inactiveCount}</span>
                {inactiveCount > 0 && <ArrowDownRight className="size-5 text-[#c93b2b]" />}
              </div>
              <p className="text-[12px] text-[#8c9489] mt-1">monthly supervision SLA</p>
            </div>
          </div>

          {!isStudent && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => { setEditingCourse(null); setShowCourseModal(true) }}>
                  + Add Coursework / Grade
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowLogModal(true)}>
                  + Log Supervision Meeting
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowSeminarModal(true)}>
                  + Record Seminar
                </Button>
              </div>
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search doctoral candidates..."
                  className="w-full h-9 pl-4 pr-10 rounded-full border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]"
                />
                <Search className="size-4 text-[#6e766b] absolute right-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          {/* 6-Stage Progression Dossier Cards */}
          <div className="space-y-4">
            {filteredDossiers.map((student) => {
              const initial = (student.student_name || 'S').trim().charAt(0).toUpperCase()
              const stageDone = [
                student.advisor_cleared_for_comps,
                Boolean(student.comp_assessor_id),
                Boolean(student.comp_exam_passed && student.dissertation_supervisor_id),
                student.seminars_attended_count > 0 || student.seminars_presented_count > 0,
                student.pre_viva_cleared,
                Boolean(student.viva_verdict && student.viva_verdict !== 'Pending'),
              ]
              return (
                <div key={student.student_id} className="fp-card space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="fp-avatar">{initial}</div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[16px] font-bold text-[#1a1d1a]">{student.student_name}</span>
                          <Badge variant={student.comp_exam_passed ? 'default' : 'secondary'}>
                            {student.candidacy_status}
                          </Badge>
                          <Badge variant="outline">Stage {student.current_stage_number} / 6</Badge>
                        </div>
                        <div className="text-[12px] text-[#6e766b] mt-0.5">
                          {student.student_email} · {student.program || 'PhD'} · {student.specialization || 'Doctoral Studies'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          selectStudentForWorkspace(student.student_id)
                          setActiveSubTab('coursework')
                        }}
                      >
                        1. Coursework ({student.courses_count})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          selectStudentForWorkspace(student.student_id)
                          setActiveSubTab('exams')
                        }}
                      >
                        2–3. Comp &amp; Supervisor
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          selectStudentForWorkspace(student.student_id)
                          setActiveSubTab('viva')
                        }}
                      >
                        5–6. Pre-Viva &amp; Viva
                      </Button>
                    </div>
                  </div>

                  {/* Visual 6-Stage Progression Pipeline */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
                    {PIPELINE_STAGES.map((st, idx) => {
                      const completed = stageDone[idx]
                      const isCurrent = student.current_stage_number === st.num
                      const locked = st.num > student.current_stage_number && !completed
                      return (
                        <button
                          key={st.num}
                          type="button"
                          onClick={() => {
                            selectStudentForWorkspace(student.student_id)
                            setActiveSubTab(st.tab)
                          }}
                          className="text-left p-2.5 rounded-xl border transition-colors cursor-pointer"
                          style={{
                            borderColor: completed
                              ? 'var(--fp-green)'
                              : isCurrent
                                ? 'var(--fp-olive)'
                                : 'var(--border-color)',
                            background: completed
                              ? isDark
                                ? 'rgba(34, 197, 94, 0.12)'
                                : '#f0fdf4'
                              : isCurrent
                                ? 'var(--fp-sage)'
                                : 'var(--bg-main)',
                            opacity: locked ? 0.65 : 1,
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold text-[#1a1d1a]">{st.short}</span>
                            {completed ? (
                              <CheckCircle2 className="size-3.5 text-[#3b7a57] shrink-0" />
                            ) : locked ? (
                              <Lock className="size-3 text-[#8c9489] shrink-0" />
                            ) : (
                              <Unlock className="size-3 text-[#5a6552] shrink-0" />
                            )}
                          </div>
                          <div className="text-[10.5px] text-[#6e766b] truncate">
                            {st.num === 1 && (student.cumulative_gpa != null ? `GPA ${student.cumulative_gpa.toFixed(2)}` : `${student.courses_count} course(s)`)}
                            {st.num === 2 && (student.comp_assessor_name || (student.advisor_cleared_for_comps ? 'Ready for Assessor' : 'Awaiting Clearance'))}
                            {st.num === 3 && (student.dissertation_supervisor_name || (student.comp_exam_passed ? 'Assign Supervisor' : student.comprehensive_result))}
                            {st.num === 4 && `${student.seminars_attended_count} sem · ${student.seminars_presented_count} pres`}
                            {st.num === 5 && (student.pre_viva_verdict || (student.pre_viva_examiner_name ? 'Examiner Assigned' : 'Pending'))}
                            {st.num === 6 && (student.overall_defense_mark != null ? `${student.overall_defense_mark}% · ${student.viva_verdict || 'Marked'}` : (student.external_examiner_name || 'Locked'))}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Key Role Assignments Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-[#eaece4] text-xs">
                    <div>
                      <div className="text-[10px] text-[#8c9489]">Academic Advisor</div>
                      <div className="font-semibold text-[#1a1d1a] truncate">{student.advisor_name || 'Unassigned'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#8c9489]">Comp Exam Assessor</div>
                      <div className="font-semibold text-[#1a1d1a] truncate">{student.comp_assessor_name || 'Unassigned'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#8c9489]">Dissertation Supervisor</div>
                      <div className="font-semibold text-[#1a1d1a] truncate">{student.dissertation_supervisor_name || 'Locked (Pass Comps)'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#8c9489]">Pre-Viva Examiner</div>
                      <div className="font-semibold text-[#1a1d1a] truncate">{student.pre_viva_examiner_name || 'Not assigned'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[#8c9489]">External Examiner / Defense</div>
                      <div className="font-semibold text-[#1a1d1a] truncate">
                        {student.external_examiner_name
                          ? `${student.external_examiner_name}${student.overall_defense_mark != null ? ` (${student.overall_defense_mark}%)` : ''}`
                          : 'Not dispatched'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {filteredDossiers.length === 0 && (
              <div className="fp-card py-12 text-center text-[#6e766b] text-[14px]">
                No doctoral candidate records found. Assign a student to a PhD / Doctoral program (or upload a doctoral thesis) to track their 6-stage progression here.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* STAGE 1: ENROLLMENT, COURSEWORK, ASSIGNMENTS & GRADES      */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'coursework' && (
        <div className="space-y-6">
          <StudentSelectorBar />

          {/* Stage 1 KPI Summary + Advisor Clearance Gate */}
          {progression && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="fp-card lg:col-span-5 space-y-4">
                <h3 className="text-[16px] font-bold text-[#1a1d1a]">Stage 1: Academic Advisor &amp; Coursework Summary</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-[#fafbf8] border border-[#eaece4]">
                    <div className="text-[11px] text-[#8c9489]">Courses</div>
                    <div className="text-[20px] font-bold text-[#1a1d1a]">{progression.courses_count}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#fafbf8] border border-[#eaece4]">
                    <div className="text-[11px] text-[#8c9489]">Credits</div>
                    <div className="text-[20px] font-bold text-[#1a1d1a]">{progression.total_credits}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#fafbf8] border border-[#eaece4]">
                    <div className="text-[11px] text-[#8c9489]">Cumulative GPA</div>
                    <div className="text-[20px] font-bold text-[#3b7a57]">
                      {progression.cumulative_gpa != null ? progression.cumulative_gpa.toFixed(2) : '—'}
                    </div>
                  </div>
                </div>

                {isLeadership && (
                  <div className="space-y-2 pt-2 border-t border-[#eaece4]">
                    <Label>Assign Academic Advisor (Stage 1)</Label>
                    <div className="flex gap-2">
                      <select
                        value={selectedAdvisorId}
                        onChange={(e) => setSelectedAdvisorId(Number(e.target.value))}
                        className="flex-1 h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]"
                      >
                        <option value={0}>Select academic advisor...</option>
                        {internalFaculty.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.full_name} ({f.department || f.role})
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={!selectedAdvisorId}
                        onClick={() =>
                          void runProgressionAction(
                            () => apiAssignPhdAdvisor(token, progression.student_id, selectedAdvisorId),
                            'Academic Advisor assigned for Stage 1 Coursework.',
                          )
                        }
                      >
                        Assign Advisor
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="fp-card lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[16px] font-bold text-[#1a1d1a]">Stage 1 → Stage 2 Gate: Advisor Coursework Clearance</h3>
                  <Badge variant={progression.advisor_cleared_for_comps ? 'default' : 'secondary'}>
                    {progression.advisor_cleared_for_comps ? '✓ Cleared for Comprehensive Exams' : 'Pending Clearance'}
                  </Badge>
                </div>
                <p className="text-[13px] text-[#6e766b]">
                  Once the student completes coursework, assignments, and exams with their Academic Advisor (<strong>{progression.advisor_name || 'Unassigned'}</strong>), issuing Advisor Clearance unlocks <strong>Stage 2: Comprehensive Exam Assessor Assignment</strong>.
                </p>

                {(isLeadership || progression.advisor_id === user?.id) && (
                  <div className="space-y-3">
                    <Input
                      placeholder="Advisor clearance notes (e.g. All 6 doctoral foundation courses passed with GPA >= 3.5)"
                      value={clearanceNotes}
                      onChange={(e) => setClearanceNotes(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          void runProgressionAction(
                            () => apiSetPhdAdvisorClearance(token, progression.student_id, true, clearanceNotes),
                            'Advisor Clearance granted! Stage 2 (Assign Comp Exam Assessor) is now unlocked.',
                          )
                        }
                      >
                        ✓ Grant Advisor Clearance (Unlock Stage 2)
                      </Button>
                      {progression.advisor_cleared_for_comps && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void runProgressionAction(
                              () => apiSetPhdAdvisorClearance(token, progression.student_id, false, clearanceNotes),
                              'Advisor clearance reverted to Pending.',
                            )
                          }
                        >
                          Revoke Clearance
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coursework, Assignments, Exams & Grades Table */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[17px] font-bold text-[#1a1d1a]">Enrolled Courses, Assignments, Exams &amp; Grades</h3>
              <p className="text-[12.5px] text-[#6e766b]">
                Track every doctoral course, continuous assignment mark, exam mark, weighted total, and letter grade.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditingCourse(null)
                setCourseForm({
                  student_id: activeStudent?.student_id || user?.id || 0,
                  course_code: '',
                  course_title: '',
                  academic_year: tenant?.academic_year || '2025/2026',
                  semester: 'Semester 1',
                  credit_hours: 3,
                  assignment_score: undefined,
                  coursework_score: undefined,
                  exam_score: undefined,
                  letter_grade: '',
                  status: 'Enrolled',
                  instructor_name: '',
                  remarks: '',
                })
                setShowCourseModal(true)
              }}
            >
              + {isStudent ? 'Register Course' : 'Add Course / Grade'}
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Term</th>
                  <th>Cr.</th>
                  <th>Assignment</th>
                  <th>Coursework</th>
                  <th>Exam</th>
                  <th>Total</th>
                  <th>Grade (GP)</th>
                  <th>Status</th>
                  {isSupervisorOrStaff && <th className="text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {courseworkList.map((cw) => (
                  <tr key={cw.id}>
                    <td>
                      <div className="font-bold text-[#1a1d1a]">{cw.course_code}: {cw.course_title}</div>
                      {cw.instructor_name && <div className="text-[11px] text-[#6e766b]">Instructor: {cw.instructor_name}</div>}
                    </td>
                    <td>{cw.academic_year} · {cw.semester}</td>
                    <td>{cw.credit_hours}</td>
                    <td>{cw.assignment_score != null ? cw.assignment_score : '—'}</td>
                    <td>{cw.coursework_score != null ? cw.coursework_score : '—'}</td>
                    <td>{cw.exam_score != null ? cw.exam_score : '—'}</td>
                    <td className="font-bold">{cw.total_score != null ? `${cw.total_score}%` : '—'}</td>
                    <td className={`font-bold ${cw.letter_grade === 'F' ? 'text-[#c93b2b]' : 'text-[#3b7a57]'}`}>
                      {cw.letter_grade ? `${cw.letter_grade} (${cw.grade_point?.toFixed(1) ?? '—'})` : 'Pending'}
                    </td>
                    <td>
                      <Badge variant={cw.status === 'Failed' ? 'secondary' : 'default'}>{cw.status}</Badge>
                    </td>
                    {isSupervisorOrStaff && (
                      <td className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCourse(cw)
                              setCourseForm({
                                student_id: cw.student_id,
                                course_code: cw.course_code,
                                course_title: cw.course_title,
                                academic_year: cw.academic_year,
                                semester: cw.semester,
                                credit_hours: cw.credit_hours,
                                assignment_score: cw.assignment_score ?? undefined,
                                coursework_score: cw.coursework_score ?? undefined,
                                exam_score: cw.exam_score ?? undefined,
                                total_score: cw.total_score ?? undefined,
                                letter_grade: cw.letter_grade || '',
                                status: cw.status,
                                instructor_name: cw.instructor_name || '',
                                remarks: cw.remarks || '',
                              })
                              setShowCourseModal(true)
                            }}
                            className="p-1.5 rounded-lg text-[#6e766b] hover:text-[#1a1d1a] cursor-pointer"
                            title="Edit marks / grade"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm(`Delete ${cw.course_code}?`)) return
                              try {
                                await apiDeletePhdCoursework(token, cw.id)
                                await loadAll()
                              } catch (err) {
                                setFeedbackBanner({ type: 'error', text: extractError(err) })
                              }
                            }}
                            className="p-1.5 rounded-lg text-[#6e766b] hover:text-[#c93b2b] cursor-pointer"
                            title="Remove course"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {courseworkList.length === 0 && (
                  <tr>
                    <td colSpan={isSupervisorOrStaff ? 10 : 9} className="py-10 text-center text-[#6e766b]">
                      No coursework or grade records entered yet for this candidate.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* STAGES 2 & 3: ASSESSOR, COMPREHENSIVE EXAM & SUPERVISOR GATE*/}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'exams' && (
        <div className="space-y-6">
          <StudentSelectorBar />

          {progression && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* STAGE 2: Assign Comprehensive Exam Assessor */}
              <div className="fp-card space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[16px] font-bold text-[#1a1d1a]">Stage 2: Assign Comprehensive Exam Assessor</h3>
                  {progression.advisor_cleared_for_comps ? (
                    <Badge variant="default">Unlocked</Badge>
                  ) : (
                    <Badge variant="secondary">Locked — Advisor Clearance Required</Badge>
                  )}
                </div>
                <p className="text-[13px] text-[#6e766b]">
                  After the Academic Advisor clears Stage 1 coursework, Programme Leadership assigns an independent <strong>Assessor</strong> to examine and grade the Comprehensive Examination.
                </p>
                <div className="p-3 rounded-xl bg-[#fafbf8] border border-[#eaece4] text-xs space-y-1">
                  <div><strong>Academic Advisor:</strong> {progression.advisor_name || 'Unassigned'}</div>
                  <div><strong>Advisor Clearance:</strong> {progression.advisor_cleared_for_comps ? `Cleared (${progression.advisor_clearance_date || 'Yes'})` : 'Not yet cleared'}</div>
                  <div><strong>Assigned Assessor:</strong> {progression.comp_assessor_name || 'Not assigned yet'}</div>
                </div>

                {isLeadership && (
                  <div className="flex gap-2">
                    <select
                      value={selectedAssessorId}
                      disabled={!progression.advisor_cleared_for_comps}
                      onChange={(e) => setSelectedAssessorId(Number(e.target.value))}
                      className="flex-1 h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a] disabled:opacity-50"
                    >
                      <option value={0}>Select Comprehensive Exam Assessor...</option>
                      {internalFaculty.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.full_name} ({f.department || f.role})
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={!progression.advisor_cleared_for_comps || !selectedAssessorId}
                      onClick={() =>
                        void runProgressionAction(
                          () => apiAssignPhdAssessor(token, progression.student_id, selectedAssessorId),
                          'Comprehensive Exam Assessor assigned! Assessor may now grade the exam.',
                        )
                      }
                    >
                      Assign Assessor
                    </Button>
                  </div>
                )}
              </div>

              {/* STAGE 3B: Dissertation Supervisor Gate */}
              <div className="fp-card space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[16px] font-bold text-[#1a1d1a]">Stage 3 Gate: Dissertation Supervisor Allocation</h3>
                  {progression.comp_exam_passed ? (
                    <Badge variant="default">✓ Unlocked (Comp Passed)</Badge>
                  ) : (
                    <Badge variant="secondary">Locked — Pass Comp Exam First</Badge>
                  )}
                </div>
                <p className="text-[13px] text-[#6e766b]">
                  A student remains under their Academic Advisor until they <strong>PASS</strong> their Comprehensive Exam. Passing flips candidacy to <strong>PhD Candidate</strong> and unlocks Dissertation Supervisor assignment.
                </p>
                <div className="p-3 rounded-xl bg-[#fafbf8] border border-[#eaece4] text-xs space-y-1">
                  <div><strong>Comp Exam Status:</strong> {progression.latest_comp_exam_result}{progression.latest_comp_exam_score != null ? ` (${progression.latest_comp_exam_score}%)` : ''}</div>
                  <div><strong>Dissertation Supervisor:</strong> {progression.dissertation_supervisor_name || 'Not assigned'}</div>
                  {progression.co_supervisor_name && <div><strong>Co-Supervisor:</strong> {progression.co_supervisor_name}</div>}
                </div>

                {isLeadership && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={selectedDissertationSupId}
                        disabled={!progression.comp_exam_passed}
                        onChange={(e) => setSelectedDissertationSupId(Number(e.target.value))}
                        className="h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a] disabled:opacity-50"
                      >
                        <option value={0}>Select Dissertation Supervisor...</option>
                        {internalFaculty.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.full_name} ({f.department || f.role})
                          </option>
                        ))}
                      </select>
                      <select
                        value={selectedCoSupId}
                        disabled={!progression.comp_exam_passed}
                        onChange={(e) => setSelectedCoSupId(Number(e.target.value))}
                        className="h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a] disabled:opacity-50"
                      >
                        <option value={0}>Co-Supervisor (optional)</option>
                        {internalFaculty.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      size="sm"
                      disabled={!progression.comp_exam_passed || !selectedDissertationSupId}
                      onClick={() =>
                        void runProgressionAction(
                          () =>
                            apiAssignPhdDissertationSupervisor(
                              token,
                              progression.student_id,
                              selectedDissertationSupId,
                              selectedCoSupId || undefined,
                            ),
                          'Dissertation Supervisor assigned! Stage 4 (Supervision & Seminars) is now active.',
                        )
                      }
                    >
                      Assign Dissertation Supervisor
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stage 3A: Comprehensive Exam Grading Table */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[17px] font-bold text-[#1a1d1a]">Stage 3: Comprehensive Examination Results</h3>
            {(isLeadership || (progression && progression.comp_assessor_id === user?.id)) && (
              <Button
                size="sm"
                disabled={progression ? !progression.comp_assessor_id : false}
                onClick={() => {
                  setExamForm((prev) => ({
                    ...prev,
                    student_id: progression?.student_id || activeStudent?.student_id || 0,
                    assessor_id: progression?.comp_assessor_id || undefined,
                  }))
                  setShowExamModal(true)
                }}
              >
                + Record Comprehensive Exam Grade
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Score &amp; Result</th>
                  <th>Student</th>
                  <th>Assessor</th>
                  <th>Exam Part</th>
                  <th>Attempt</th>
                  <th>Candidacy</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => (
                  <tr key={e.id}>
                    <td>{e.exam_date || '—'}</td>
                    <td className={`font-semibold ${e.result === 'Pass' ? 'text-[#3b7a57]' : 'text-[#c93b2b]'}`}>
                      {e.score != null ? `${e.score}% (${e.result})` : e.result}
                    </td>
                    <td className="font-medium">{e.student_name || `ID #${e.student_id}`}</td>
                    <td>{e.assessor_name || 'Exam Panel'}</td>
                    <td>{e.paper_part || 'Comprehensive Exam'}</td>
                    <td>Attempt {e.attempt_number}</td>
                    <td>
                      <Badge variant={e.advanced_to_candidacy || e.result === 'Pass' ? 'default' : 'secondary'}>
                        {e.advanced_to_candidacy || e.result === 'Pass' ? 'PhD Candidate' : 'Pre-Candidacy'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {exams.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-[#6e766b]">
                      No comprehensive examination results recorded yet. Assign an Assessor in Stage 2, then enter the exam mark here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* STAGE 4A: RESEARCH SEMINARS                                */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'seminars' && (
        <div className="space-y-6">
          <StudentSelectorBar />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              size="sm"
              onClick={() => {
                setSeminarForm((f) => ({ ...f, student_id: isStudent ? (user?.id || 0) : (activeStudent?.student_id || 0) }))
                setShowSeminarModal(true)
              }}
            >
              + Record Seminar Participation / Presentation
            </Button>
            <span className="text-[13px] text-[#6e766b]">
              Stage 4 doctoral seminars (Proposal Seminar, Work-in-Progress, Colloquium &amp; Conferences)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Verdict</th>
                  <th>Student</th>
                  <th>Category</th>
                  <th>Seminar Title</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {seminars.map((s) => (
                  <tr key={s.id}>
                    <td>{s.seminar_date}</td>
                    <td className="font-semibold text-[#3b7a57]">{s.score_or_verdict || 'Recorded'}</td>
                    <td className="font-medium">{s.student_name || `ID #${s.student_id}`}</td>
                    <td>{s.seminar_category}</td>
                    <td className="max-w-sm truncate">{s.title}</td>
                    <td>
                      <Badge variant={s.is_presenter ? 'secondary' : 'default'}>
                        {s.is_presenter ? 'Presenter' : 'Attendee'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {seminars.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#6e766b]">
                      No seminar records added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* STAGE 4B: SUPERVISION LOGS                                 */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'supervision' && (
        <div className="space-y-6">
          <StudentSelectorBar />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {isSupervisorOrStaff && (
              <Button size="sm" onClick={() => setShowLogModal(true)}>
                + Log Supervision Meeting
              </Button>
            )}
            <span className="text-[13px] text-[#6e766b]">
              12-stage dissertation supervision records and monthly milestone feedback
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Rating</th>
                  <th>Student</th>
                  <th>Supervisor</th>
                  <th>Research Stage</th>
                  <th>Feedback &amp; Next Task</th>
                  <th>Mode</th>
                </tr>
              </thead>
              <tbody>
                {supervisionLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.meeting_date}</td>
                    <td className={`font-semibold ${log.progress_rating === 'Unsatisfactory' ? 'text-[#c93b2b]' : 'text-[#3b7a57]'}`}>
                      {log.progress_rating}
                    </td>
                    <td className="font-medium">{log.student_name || `ID #${log.student_id}`}</td>
                    <td>{log.supervisor_name || 'Assigned Supervisor'}</td>
                    <td className="max-w-xs truncate">{log.research_stage}</td>
                    <td className="max-w-sm text-[#6e766b] truncate">{log.feedback_given || log.next_task || 'Logged'}</td>
                    <td><Badge variant="default">{log.meeting_mode}</Badge></td>
                  </tr>
                ))}
                {supervisionLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-[#6e766b]">
                      No supervision meeting logs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* STAGES 5 & 6: PRE-VIVA, EXTERNAL VIVA & DEFENSE MARKS      */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'viva' && (
        <div className="space-y-6">
          <StudentSelectorBar />

          {!progression ? (
            <div className="fp-card py-12 text-center text-[#6e766b]">
              Select a doctoral student to manage Pre-Viva Assessment, External Examiner Dispatch, and Official Defense Marks.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* STAGE 5: Pre-Viva Internal Examiner Assignment & Clearance */}
              <div className="fp-card space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[17px] font-bold text-[#1a1d1a]">Stage 5: Pre-Viva Internal Assessment</h3>
                  {progression.pre_viva_cleared ? (
                    <Badge variant="default">✓ Pre-Viva Cleared</Badge>
                  ) : progression.dissertation_supervisor_id ? (
                    <Badge variant="secondary">Unlocked — Ready for Pre-Viva</Badge>
                  ) : (
                    <Badge variant="secondary">Locked — Assign Supervisor First</Badge>
                  )}
                </div>

                <p className="text-[13px] text-[#6e766b]">
                  Assign the Pre-Viva / Internal Examiner to assess the completed dissertation draft. Clearing Pre-Viva unlocks <strong>Stage 6: External Examiner Dispatch &amp; Viva Voce</strong>.
                </p>

                <div className="space-y-3">
                  <div>
                    <Label>Pre-Viva / Internal Examiner</Label>
                    <select
                      value={preVivaForm.pre_viva_examiner_id}
                      disabled={!isLeadership || !progression.dissertation_supervisor_id}
                      onChange={(e) => setPreVivaForm((p) => ({ ...p, pre_viva_examiner_id: Number(e.target.value) }))}
                      className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a] disabled:opacity-60"
                    >
                      <option value={0}>Select Pre-Viva / Internal Examiner...</option>
                      {internalFaculty.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.full_name} ({f.department || f.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Pre-Viva Date</Label>
                      <Input
                        type="date"
                        disabled={isStudent || !progression.dissertation_supervisor_id}
                        value={preVivaForm.pre_viva_date}
                        onChange={(e) => setPreVivaForm((p) => ({ ...p, pre_viva_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Pre-Viva Score (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        placeholder="e.g. 78"
                        disabled={isStudent || !progression.dissertation_supervisor_id}
                        value={preVivaForm.pre_viva_score}
                        onChange={(e) => setPreVivaForm((p) => ({ ...p, pre_viva_score: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Pre-Viva Verdict</Label>
                    <select
                      value={preVivaForm.pre_viva_verdict}
                      disabled={isStudent || !progression.dissertation_supervisor_id}
                      onChange={(e) => {
                        const v = e.target.value
                        setPreVivaForm((p) => ({
                          ...p,
                          pre_viva_verdict: v,
                          pre_viva_cleared: v === 'Pass' || v === 'Pass with Minor Corrections' ? true : p.pre_viva_cleared,
                        }))
                      }}
                      className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a] disabled:opacity-60"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Pass">Pass (Clear for External Dispatch)</option>
                      <option value="Pass with Minor Corrections">Pass with Minor Corrections</option>
                      <option value="Pass with Major Corrections">Pass with Major Corrections</option>
                      <option value="Repeat Pre-Viva">Repeat Pre-Viva</option>
                    </select>
                  </div>

                  <div>
                    <Label>Pre-Viva Panel Remarks</Label>
                    <textarea
                      rows={2}
                      disabled={isStudent || !progression.dissertation_supervisor_id}
                      value={preVivaForm.pre_viva_remarks}
                      onChange={(e) => setPreVivaForm((p) => ({ ...p, pre_viva_remarks: e.target.value }))}
                      placeholder="Pre-Viva feedback and required pre-external corrections..."
                      className="w-full p-2.5 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]"
                    />
                  </div>

                  {!isStudent && (
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preVivaForm.pre_viva_cleared}
                        disabled={!progression.dissertation_supervisor_id}
                        onChange={(e) => setPreVivaForm((p) => ({ ...p, pre_viva_cleared: e.target.checked }))}
                      />
                      <span>Cleared for External Examiner Dispatch (Unlocks Stage 6)</span>
                    </label>
                  )}

                  {!isStudent && (
                    <Button
                      className="w-full"
                      disabled={!progression.dissertation_supervisor_id}
                      onClick={() =>
                        void runProgressionAction(
                          () =>
                            apiUpdatePhdPreViva(token, progression.student_id, {
                              pre_viva_examiner_id: isLeadership && preVivaForm.pre_viva_examiner_id ? preVivaForm.pre_viva_examiner_id : undefined,
                              pre_viva_date: preVivaForm.pre_viva_date || undefined,
                              pre_viva_score: preVivaForm.pre_viva_score !== '' ? Number(preVivaForm.pre_viva_score) : undefined,
                              pre_viva_verdict: preVivaForm.pre_viva_verdict,
                              pre_viva_cleared: preVivaForm.pre_viva_cleared,
                              pre_viva_remarks: preVivaForm.pre_viva_remarks,
                            }),
                          'Stage 5 Pre-Viva assessment saved!',
                        )
                      }
                    >
                      Save Pre-Viva Assessment &amp; Clearance
                    </Button>
                  )}
                </div>
              </div>

              {/* STAGE 6: External Examiner Dispatch, Viva Voce & Defense Marks */}
              <div className="fp-card space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[17px] font-bold text-[#1a1d1a]">Stage 6: External Viva &amp; Official Defense Marks</h3>
                  {progression.viva_verdict && progression.viva_verdict !== 'Pending' ? (
                    <Badge variant="default">{progression.viva_verdict}</Badge>
                  ) : progression.pre_viva_cleared ? (
                    <Badge variant="default">Unlocked — Ready for External Dispatch</Badge>
                  ) : (
                    <Badge variant="secondary">Locked — Clear Pre-Viva First</Badge>
                  )}
                </div>

                <p className="text-[13px] text-[#6e766b]">
                  Dispatch the Pre-Viva-cleared thesis to the <strong>External Examiner</strong> and record the official itemized <strong>Defense Marks</strong> and final Viva Voce verdict.
                </p>

                <div className="space-y-3">
                  <div>
                    <Label>External Examiner (Dispatch Target)</Label>
                    <select
                      value={vivaForm.external_examiner_id}
                      disabled={!isLeadership || !progression.pre_viva_cleared}
                      onChange={(e) => setVivaForm((v) => ({ ...v, external_examiner_id: Number(e.target.value) }))}
                      className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a] disabled:opacity-60"
                    >
                      <option value={0}>Select External Examiner...</option>
                      {externalExaminers.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.full_name} ({f.is_external ? 'External Examiner' : f.role} · {f.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label>Viva Voce Defense Date</Label>
                    <Input
                      type="date"
                      disabled={isStudent || !progression.pre_viva_cleared}
                      value={vivaForm.viva_date}
                      onChange={(e) => setVivaForm((v) => ({ ...v, viva_date: e.target.value }))}
                    />
                  </div>

                  {/* Itemized Defense Marks Grid */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <Label>Internal Mark (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        placeholder="0–100"
                        disabled={isStudent || !progression.pre_viva_cleared}
                        value={vivaForm.internal_examiner_mark}
                        onChange={(e) => setVivaForm((v) => ({ ...v, internal_examiner_mark: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>External Mark (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        placeholder="0–100"
                        disabled={isStudent || !progression.pre_viva_cleared}
                        value={vivaForm.external_examiner_mark}
                        onChange={(e) => setVivaForm((v) => ({ ...v, external_examiner_mark: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Oral Viva (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        placeholder="0–100"
                        disabled={isStudent || !progression.pre_viva_cleared}
                        value={vivaForm.oral_defense_mark}
                        onChange={(e) => setVivaForm((v) => ({ ...v, oral_defense_mark: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#fafbf8] border border-[#eaece4] flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#6e766b]">Overall Defense Mark (Computed Average)</span>
                    <span className="text-[18px] font-bold text-[#3b7a57]">
                      {previewDefenseAvg != null ? `${previewDefenseAvg}%` : (progression.overall_defense_mark != null ? `${progression.overall_defense_mark}%` : '—')}
                    </span>
                  </div>

                  <div>
                    <Label>Final Viva Voce Verdict</Label>
                    <select
                      value={vivaForm.viva_verdict}
                      disabled={isStudent || !progression.pre_viva_cleared}
                      onChange={(e) => setVivaForm((v) => ({ ...v, viva_verdict: e.target.value }))}
                      className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a] disabled:opacity-60"
                    >
                      <option value="Pending">Pending Defense</option>
                      <option value="Pass">Pass (Unconditional Award)</option>
                      <option value="Pass with Minor Corrections">Pass with Minor Corrections</option>
                      <option value="Pass with Major Corrections">Pass with Major Corrections</option>
                      <option value="Repeat Viva">Repeat Viva Voce</option>
                      <option value="Fail">Fail</option>
                    </select>
                  </div>

                  <div>
                    <Label>Defense Panel Remarks</Label>
                    <textarea
                      rows={2}
                      disabled={isStudent || !progression.pre_viva_cleared}
                      value={vivaForm.viva_remarks}
                      onChange={(e) => setVivaForm((v) => ({ ...v, viva_remarks: e.target.value }))}
                      placeholder="External examiner comments, defense panel notes, corrections..."
                      className="w-full p-2.5 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]"
                    />
                  </div>

                  {!isStudent && (
                    <Button
                      className="w-full"
                      disabled={!progression.pre_viva_cleared}
                      onClick={() =>
                        void runProgressionAction(
                          () =>
                            apiUpdatePhdVivaDefense(token, progression.student_id, {
                              external_examiner_id: isLeadership && vivaForm.external_examiner_id ? vivaForm.external_examiner_id : undefined,
                              viva_date: vivaForm.viva_date || undefined,
                              internal_examiner_mark: vivaForm.internal_examiner_mark !== '' ? Number(vivaForm.internal_examiner_mark) : undefined,
                              external_examiner_mark: vivaForm.external_examiner_mark !== '' ? Number(vivaForm.external_examiner_mark) : undefined,
                              oral_defense_mark: vivaForm.oral_defense_mark !== '' ? Number(vivaForm.oral_defense_mark) : undefined,
                              viva_verdict: vivaForm.viva_verdict,
                              viva_remarks: vivaForm.viva_remarks,
                            }),
                          'Stage 6 External Examiner Dispatch & Viva Defense Marks recorded!',
                        )
                      }
                    >
                      Save External Dispatch &amp; Official Defense Marks
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* TEACHING PRACTICE                                          */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'teaching' && (
        <div className="space-y-6">
          <StudentSelectorBar />
          <div>
            <Button
              size="sm"
              onClick={() => {
                setTeachingForm((f) => ({ ...f, student_id: isStudent ? (user?.id || 0) : (activeStudent?.student_id || 0) }))
                setShowTeachingModal(true)
              }}
            >
              + Record Teaching Practice
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Academic Year</th>
                  <th>Contact Hours</th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Supervising Faculty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {teachingList.map((t) => (
                  <tr key={t.id}>
                    <td>{t.semester}</td>
                    <td className="font-semibold text-[#3b7a57]">{t.contact_hours} hrs</td>
                    <td className="font-medium">{t.student_name || `ID #${t.student_id}`}</td>
                    <td>{t.course_code}{t.course_title && t.course_title !== t.course_code ? `: ${t.course_title}` : ''}</td>
                    <td>{t.supervising_faculty_name || 'Course Lecturer'}</td>
                    <td>
                      <Badge variant={t.is_completed ? 'default' : 'secondary'}>
                        {t.is_completed ? 'Completed' : 'In Progress'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {teachingList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#6e766b]">No teaching practice records entered yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 6-MONTH PROGRESS REVIEWS                                   */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'reviews' && (
        <div className="space-y-6">
          <StudentSelectorBar />
          {isSupervisorOrStaff && (
            <div>
              <Button size="sm" onClick={() => setShowEvalModal(true)}>+ Conduct 6-Month Review</Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Rating</th>
                  <th>Review Period</th>
                  <th>Student</th>
                  <th>Action Plan</th>
                  <th>Evaluator</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev) => (
                  <tr key={ev.id}>
                    <td>{ev.evaluation_date}</td>
                    <td className="font-semibold text-[#3b7a57]">{ev.overall_rating}</td>
                    <td>{ev.evaluation_period}</td>
                    <td className="font-medium">{ev.student_name || `ID #${ev.student_id}`}</td>
                    <td className="max-w-sm truncate text-[#6e766b]">{ev.action_plan || 'N/A'}</td>
                    <td><Badge variant="default">{ev.evaluator_name || 'Committee'}</Badge></td>
                  </tr>
                ))}
                {evaluations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#6e766b]">No 6-month evaluations recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* CALENDAR VIEW                                              */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'calendar' && (
        <div className="space-y-5">
          <div className="inline-flex items-center gap-4 px-4 py-2 rounded-lg bg-[#dce7d0] text-[#1a1d1a] text-[13px] font-bold">
            <button type="button" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} className="hover:opacity-70 cursor-pointer">
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[110px] text-center">
              {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} className="hover:opacity-70 cursor-pointer">
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="border border-[#eaece4] rounded-xl overflow-hidden bg-[#fafbf8]">
            <div className="grid grid-cols-7 border-b border-[#eaece4] bg-[#fafbf8]">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => (
                <div key={day} className="py-3 text-center text-[11px] font-semibold tracking-wider text-[#6e766b] border-r last:border-r-0 border-[#eaece4]">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarCells.map((cell, idx) => (
                <div
                  key={idx}
                  className={`min-h-[96px] p-2.5 border-b border-r border-[#eaece4] flex flex-col justify-between ${
                    cell.isCurrentMonth ? 'bg-[#fafbf8]' : 'bg-[#f4f6f0]/60 opacity-50'
                  }`}
                >
                  <div className="text-center text-[12px] font-bold text-[#1a1d1a]">{cell.day}</div>
                  <div className="space-y-1 pt-2">
                    {cell.events.map((ev, evIdx) => (
                      <div key={evIdx} className={`flex items-center gap-1.5 text-[11px] font-semibold truncate ${ev.isPositive ? 'text-[#3b7a57]' : 'text-[#c93b2b]'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ev.isPositive ? 'bg-[#3b7a57]' : 'bg-[#c93b2b]'}`} />
                        <span className="truncate">{ev.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 18 REACCREDITATION FOLDERS                                 */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeSubTab === 'folders' && (
        <div className="space-y-6">
          {isSupervisorOrStaff && (
            <div>
              <Button size="sm" onClick={() => setShowFolderModal(true)}>+ Upload Evidence Document</Button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {REACCREDITATION_FOLDERS.map((f) => {
              const uploadedDocs = folders.filter((doc) => doc.folder_number === f.num)
              return (
                <div key={f.num} className="fp-card flex flex-col justify-between space-y-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="w-8 h-8 rounded-full bg-[#dce7d0] text-[#1a1d1a] flex items-center justify-center font-bold text-xs">{f.num}</span>
                      <Badge variant={uploadedDocs.length > 0 ? 'default' : 'outline'}>{uploadedDocs.length} file(s)</Badge>
                    </div>
                    <h4 className="text-[15px] font-bold text-[#1a1d1a] leading-snug">{f.name}</h4>
                  </div>
                  <div className="pt-3 border-t border-[#eaece4] space-y-2">
                    {uploadedDocs.length > 0 ? (
                      uploadedDocs.slice(0, 2).map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between text-[12px] text-[#6e766b]">
                          <span className="truncate max-w-[190px] font-medium text-[#1a1d1a]">{doc.file_name}</span>
                          <span>{doc.status}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[12px] text-[#8c9489]">No evidence uploaded yet</p>
                    )}
                    {isSupervisorOrStaff && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2"
                        onClick={() => {
                          setFolderForm((prev) => ({ ...prev, folder_number: f.num, folder_name: f.name }))
                          setShowFolderModal(true)
                        }}
                      >
                        + Add Document
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: Add / Edit Coursework, Assignments & Grades         */}
      {/* ────────────────────────────────────────────────────────── */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 bg-[#1a1d1a]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="fp-card max-w-lg w-full space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-[#1a1d1a]">
                {editingCourse ? `Edit Course: ${editingCourse.course_code}` : 'Add PhD Course / Grade'}
              </h3>
              <button onClick={() => setShowCourseModal(false)} className="text-[#6e766b] hover:text-[#1a1d1a] cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              {!isStudent && !editingCourse && (
                <div>
                  <Label>Doctoral Student</Label>
                  <select
                    value={courseForm.student_id}
                    onChange={(e) => setCourseForm({ ...courseForm, student_id: Number(e.target.value) })}
                    className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]"
                  >
                    <option value={0}>Select PhD student</option>
                    {dossiers.map((d) => (
                      <option key={d.student_id} value={d.student_id}>{d.student_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Course Code *</Label>
                  <Input
                    placeholder="e.g. PHD 801"
                    value={courseForm.course_code}
                    onChange={(e) => setCourseForm({ ...courseForm, course_code: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Course Title *</Label>
                  <Input
                    placeholder="e.g. Advanced Research Methods"
                    value={courseForm.course_title}
                    onChange={(e) => setCourseForm({ ...courseForm, course_title: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Academic Year</Label>
                  <Input value={courseForm.academic_year || ''} onChange={(e) => setCourseForm({ ...courseForm, academic_year: e.target.value })} />
                </div>
                <div>
                  <Label>Semester</Label>
                  <Input value={courseForm.semester || ''} onChange={(e) => setCourseForm({ ...courseForm, semester: e.target.value })} />
                </div>
                <div>
                  <Label>Credit Hours</Label>
                  <Input type="number" min={1} max={12} value={courseForm.credit_hours || 3} onChange={(e) => setCourseForm({ ...courseForm, credit_hours: Number(e.target.value) || 3 })} />
                </div>
              </div>

              {!isStudent && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Assignment Score</Label>
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="e.g. 18"
                        value={courseForm.assignment_score ?? ''}
                        onChange={(e) => setCourseForm({ ...courseForm, assignment_score: e.target.value === '' ? undefined : Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Coursework Score</Label>
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="e.g. 17"
                        value={courseForm.coursework_score ?? ''}
                        onChange={(e) => setCourseForm({ ...courseForm, coursework_score: e.target.value === '' ? undefined : Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Exam Score</Label>
                      <Input
                        type="number"
                        step="0.5"
                        placeholder="e.g. 52"
                        value={courseForm.exam_score ?? ''}
                        onChange={(e) => setCourseForm({ ...courseForm, exam_score: e.target.value === '' ? undefined : Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Letter Grade (auto if blank)</Label>
                      <select
                        value={courseForm.letter_grade || ''}
                        onChange={(e) => setCourseForm({ ...courseForm, letter_grade: e.target.value })}
                        className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]"
                      >
                        <option value="">Auto-compute from score</option>
                        {['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'F'].map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <select
                        value={courseForm.status || 'Enrolled'}
                        onChange={(e) => setCourseForm({ ...courseForm, status: e.target.value })}
                        className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]"
                      >
                        <option value="Enrolled">Enrolled</option>
                        <option value="Completed">Completed</option>
                        <option value="Passed">Passed</option>
                        <option value="Failed">Failed</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div>
                <Label>Course Instructor (optional)</Label>
                <Input
                  placeholder="e.g. Prof. Kwame Boateng"
                  value={courseForm.instructor_name || ''}
                  onChange={(e) => setCourseForm({ ...courseForm, instructor_name: e.target.value })}
                />
              </div>
            </div>

            <Button
              className="w-full h-11 font-bold"
              onClick={async () => {
                const targetId = isStudent ? (user?.id || 0) : courseForm.student_id
                if (!targetId || !courseForm.course_code.trim() || !courseForm.course_title.trim()) {
                  setFeedbackBanner({ type: 'error', text: 'Please select a student and enter both Course Code and Course Title.' })
                  return
                }
                try {
                  if (editingCourse) {
                    await apiUpdatePhdCoursework(token, editingCourse.id, courseForm)
                  } else {
                    await apiCreatePhdCoursework(token, { ...courseForm, student_id: targetId })
                  }
                  setShowCourseModal(false)
                  setEditingCourse(null)
                  setFeedbackBanner({ type: 'success', text: editingCourse ? 'Coursework grade updated!' : 'Coursework record added!' })
                  await loadAll(targetId)
                } catch (err) {
                  setFeedbackBanner({ type: 'error', text: extractError(err) })
                }
              }}
            >
              {editingCourse ? 'Update Coursework Grade' : 'Save Coursework Record'}
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: Log Supervision Meeting                             */}
      {/* ────────────────────────────────────────────────────────── */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 bg-[#1a1d1a]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="fp-card max-w-lg w-full space-y-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-[#1a1d1a]">New Supervision Log</h3>
              <button onClick={() => setShowLogModal(false)} className="text-[#6e766b] hover:text-[#1a1d1a] cursor-pointer"><X className="size-5" /></button>
            </div>
            <div className="space-y-3.5">
              <div>
                <Label>Doctoral Student</Label>
                <select value={logForm.student_id} onChange={(e) => setLogForm({ ...logForm, student_id: Number(e.target.value) })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                  <option value={0}>Select PhD student</option>
                  {dossiers.map((d) => (<option key={d.student_id} value={d.student_id}>{d.student_name}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Meeting Date</Label><Input type="date" value={logForm.meeting_date} onChange={(e) => setLogForm({ ...logForm, meeting_date: e.target.value })} /></div>
                <div>
                  <Label>Mode</Label>
                  <select value={logForm.meeting_mode} onChange={(e) => setLogForm({ ...logForm, meeting_mode: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                    <option value="In-Person">In-Person</option>
                    <option value="Online / Zoom">Online / Zoom</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>12-Stage Milestone</Label>
                <select value={logForm.research_stage} onChange={(e) => setLogForm({ ...logForm, research_stage: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                  {RESEARCH_STAGES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <div><Label>Work Submitted</Label><Input placeholder="e.g. Draft Chapter 3 methodology" value={logForm.work_submitted || ''} onChange={(e) => setLogForm({ ...logForm, work_submitted: e.target.value })} /></div>
              <div><Label>Supervisor Feedback</Label><textarea rows={2} value={logForm.feedback_given || ''} onChange={(e) => setLogForm({ ...logForm, feedback_given: e.target.value })} className="w-full p-2.5 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Next Task</Label><Input value={logForm.next_task || ''} onChange={(e) => setLogForm({ ...logForm, next_task: e.target.value })} /></div>
                <div>
                  <Label>Progress Rating</Label>
                  <select value={logForm.progress_rating} onChange={(e) => setLogForm({ ...logForm, progress_rating: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                    <option value="Exceptional">Exceptional</option>
                    <option value="Satisfactory">Satisfactory</option>
                    <option value="Needs Improvement">Needs Improvement</option>
                    <option value="Unsatisfactory">Unsatisfactory</option>
                  </select>
                </div>
              </div>
            </div>
            <Button
              className="w-full h-11 font-bold"
              onClick={async () => {
                if (!logForm.student_id) return
                try {
                  await apiCreateSupervisionLog(token, logForm)
                  setShowLogModal(false)
                  setFeedbackBanner({ type: 'success', text: 'Supervision meeting logged.' })
                  await loadAll()
                } catch (err) {
                  setFeedbackBanner({ type: 'error', text: extractError(err) })
                }
              }}
            >
              Save Supervision Log
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: Record Seminar                                      */}
      {/* ────────────────────────────────────────────────────────── */}
      {showSeminarModal && (
        <div className="fixed inset-0 z-50 bg-[#1a1d1a]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="fp-card max-w-lg w-full space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-[#1a1d1a]">Record Doctoral Seminar</h3>
              <button onClick={() => setShowSeminarModal(false)} className="text-[#6e766b] hover:text-[#1a1d1a] cursor-pointer"><X className="size-5" /></button>
            </div>
            <div className="space-y-3.5">
              {!isStudent && (
                <div>
                  <Label>Doctoral Candidate</Label>
                  <select value={seminarForm.student_id} onChange={(e) => setSeminarForm({ ...seminarForm, student_id: Number(e.target.value) })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                    <option value={0}>Select student</option>
                    {dossiers.map((d) => (<option key={d.student_id} value={d.student_id}>{d.student_name}</option>))}
                  </select>
                </div>
              )}
              <div>
                <Label>Seminar Category</Label>
                <select value={seminarForm.seminar_category} onChange={(e) => setSeminarForm({ ...seminarForm, seminar_category: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                  {SEMINAR_CATEGORIES.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
                </select>
              </div>
              <div>
                <Label>Seminar / Paper Title *</Label>
                <Input placeholder="Presentation title" value={seminarForm.title} onChange={(e) => setSeminarForm({ ...seminarForm, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Date</Label><Input type="date" value={seminarForm.seminar_date} onChange={(e) => setSeminarForm({ ...seminarForm, seminar_date: e.target.value })} /></div>
                <div>
                  <Label>Role</Label>
                  <select value={seminarForm.is_presenter ? 'Presenter' : 'Attendee'} onChange={(e) => setSeminarForm({ ...seminarForm, is_presenter: e.target.value === 'Presenter' })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                    <option value="Presenter">Presenter</option>
                    <option value="Attendee">Attendee</option>
                  </select>
                </div>
                <div>
                  <Label>Verdict</Label>
                  <select value={seminarForm.score_or_verdict || 'Pass'} onChange={(e) => setSeminarForm({ ...seminarForm, score_or_verdict: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                    <option value="Pass">Pass</option>
                    <option value="Revisions Requested">Revisions Requested</option>
                    <option value="Attended">Attended</option>
                  </select>
                </div>
              </div>
            </div>
            <Button
              className="w-full h-11 font-bold"
              onClick={async () => {
                const targetStudentId = isStudent ? (user?.id || 0) : seminarForm.student_id
                if (!targetStudentId || !seminarForm.title.trim()) return
                try {
                  await apiRecordPhdSeminar(token, { ...seminarForm, student_id: targetStudentId })
                  setShowSeminarModal(false)
                  setFeedbackBanner({ type: 'success', text: 'Seminar record saved!' })
                  await loadAll()
                } catch (err) {
                  setFeedbackBanner({ type: 'error', text: extractError(err) })
                }
              }}
            >
              Save Seminar
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: Record Comprehensive Exam                           */}
      {/* ────────────────────────────────────────────────────────── */}
      {showExamModal && (
        <div className="fixed inset-0 z-50 bg-[#1a1d1a]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="fp-card max-w-lg w-full space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-[#1a1d1a]">Record Comprehensive Exam Result</h3>
              <button onClick={() => setShowExamModal(false)} className="text-[#6e766b] hover:text-[#1a1d1a] cursor-pointer"><X className="size-5" /></button>
            </div>
            <div className="space-y-3.5">
              <div>
                <Label>Student</Label>
                <select value={examForm.student_id} onChange={(e) => setExamForm({ ...examForm, student_id: Number(e.target.value) })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                  <option value={0}>Select student</option>
                  {dossiers.map((d) => (<option key={d.student_id} value={d.student_id}>{d.student_name}</option>))}
                </select>
              </div>
              <div>
                <Label>Exam Component / Paper Part</Label>
                <Input value={examForm.paper_part || ''} onChange={(e) => setExamForm({ ...examForm, paper_part: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Exam Date</Label><Input type="date" value={examForm.exam_date} onChange={(e) => setExamForm({ ...examForm, exam_date: e.target.value })} /></div>
                <div>
                  <Label>Attempt</Label>
                  <select value={examForm.attempt_number} onChange={(e) => setExamForm({ ...examForm, attempt_number: Number(e.target.value) })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                    <option value={1}>Attempt 1</option>
                    <option value={2}>Attempt 2</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Result</Label>
                  <select value={examForm.result} onChange={(e) => setExamForm({ ...examForm, result: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                    <option value="Pass">Pass (Unlocks PhD Candidacy &amp; Supervisor)</option>
                    <option value="Conditional Pass">Conditional Pass</option>
                    <option value="Fail">Fail</option>
                  </select>
                </div>
                <div>
                  <Label>Score (%)</Label>
                  <Input type="number" min={0} max={100} value={examForm.score ?? 0} onChange={(e) => setExamForm({ ...examForm, score: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Assessor Remarks / Remedial Instructions</Label>
                <textarea rows={2} value={examForm.remedial_instructions || ''} onChange={(e) => setExamForm({ ...examForm, remedial_instructions: e.target.value })} className="w-full p-2.5 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]" />
              </div>
            </div>
            <Button
              className="w-full h-11 font-bold"
              onClick={async () => {
                if (!examForm.student_id) return
                try {
                  await apiRecordComprehensiveExam(token, examForm)
                  setShowExamModal(false)
                  setFeedbackBanner({
                    type: 'success',
                    text:
                      examForm.result === 'Pass'
                        ? 'Comprehensive Exam PASSED! PhD Candidacy achieved — Dissertation Supervisor Assignment is now unlocked.'
                        : 'Comprehensive Exam result recorded.',
                  })
                  await loadAll(examForm.student_id)
                } catch (err) {
                  setFeedbackBanner({ type: 'error', text: extractError(err) })
                }
              }}
            >
              Save Exam Grade
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: Record Teaching Practice                            */}
      {/* ────────────────────────────────────────────────────────── */}
      {showTeachingModal && (
        <div className="fixed inset-0 z-50 bg-[#1a1d1a]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="fp-card max-w-lg w-full space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-[#1a1d1a]">Record Teaching Practice</h3>
              <button onClick={() => setShowTeachingModal(false)} className="text-[#6e766b] hover:text-[#1a1d1a] cursor-pointer"><X className="size-5" /></button>
            </div>
            <div className="space-y-3.5">
              {!isStudent && (
                <div>
                  <Label>Student</Label>
                  <select value={teachingForm.student_id} onChange={(e) => setTeachingForm({ ...teachingForm, student_id: Number(e.target.value) })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                    <option value={0}>Select student</option>
                    {dossiers.map((d) => (<option key={d.student_id} value={d.student_id}>{d.student_name}</option>))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Course Code</Label><Input placeholder="e.g. MGT 301" value={teachingForm.course_code} onChange={(e) => setTeachingForm({ ...teachingForm, course_code: e.target.value })} /></div>
                <div><Label>Contact Hours</Label><Input type="number" value={teachingForm.contact_hours || 45} onChange={(e) => setTeachingForm({ ...teachingForm, contact_hours: Number(e.target.value) })} /></div>
              </div>
              <div><Label>Course Title</Label><Input placeholder="e.g. Organizational Leadership" value={teachingForm.course_title} onChange={(e) => setTeachingForm({ ...teachingForm, course_title: e.target.value })} /></div>
            </div>
            <Button
              className="w-full h-11 font-bold"
              onClick={async () => {
                const targetStudentId = isStudent ? (user?.id || 0) : teachingForm.student_id
                if (!targetStudentId || !teachingForm.course_code.trim()) return
                try {
                  await apiRecordTeachingRequirement(token, { ...teachingForm, student_id: targetStudentId })
                  setShowTeachingModal(false)
                  setFeedbackBanner({ type: 'success', text: 'Teaching practice record saved.' })
                  await loadAll()
                } catch (err) {
                  setFeedbackBanner({ type: 'error', text: extractError(err) })
                }
              }}
            >
              Save Teaching Practice
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: 6-Month Review                                      */}
      {/* ────────────────────────────────────────────────────────── */}
      {showEvalModal && (
        <div className="fixed inset-0 z-50 bg-[#1a1d1a]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="fp-card max-w-lg w-full space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-[#1a1d1a]">Conduct 6-Month Review</h3>
              <button onClick={() => setShowEvalModal(false)} className="text-[#6e766b] hover:text-[#1a1d1a] cursor-pointer"><X className="size-5" /></button>
            </div>
            <div className="space-y-3.5">
              <div>
                <Label>Student</Label>
                <select value={evalForm.student_id} onChange={(e) => setEvalForm({ ...evalForm, student_id: Number(e.target.value) })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                  <option value={0}>Select student</option>
                  {dossiers.map((d) => (<option key={d.student_id} value={d.student_id}>{d.student_name}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Review Period</Label><Input value={evalForm.evaluation_period} onChange={(e) => setEvalForm({ ...evalForm, evaluation_period: e.target.value })} /></div>
                <div>
                  <Label>Overall Rating</Label>
                  <select value={evalForm.overall_rating} onChange={(e) => setEvalForm({ ...evalForm, overall_rating: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]">
                    <option value="Exceptional">Exceptional</option>
                    <option value="Satisfactory">Satisfactory</option>
                    <option value="Needs Improvement">Needs Improvement</option>
                    <option value="Unsatisfactory">Unsatisfactory</option>
                  </select>
                </div>
              </div>
              <div><Label>Action Plan</Label><textarea rows={3} value={evalForm.action_plan || ''} onChange={(e) => setEvalForm({ ...evalForm, action_plan: e.target.value })} className="w-full p-2.5 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]" /></div>
            </div>
            <Button
              className="w-full h-11 font-bold"
              onClick={async () => {
                if (!evalForm.student_id) return
                try {
                  await apiRecordProgressEvaluation(token, evalForm)
                  setShowEvalModal(false)
                  setFeedbackBanner({ type: 'success', text: '6-month progress review recorded.' })
                  await loadAll()
                } catch (err) {
                  setFeedbackBanner({ type: 'error', text: extractError(err) })
                }
              }}
            >
              Save Review
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* MODAL: Upload Reaccreditation Document                     */}
      {/* ────────────────────────────────────────────────────────── */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 bg-[#1a1d1a]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="fp-card max-w-lg w-full space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-[#1a1d1a]">Upload Accreditation Evidence</h3>
              <button onClick={() => setShowFolderModal(false)} className="text-[#6e766b] hover:text-[#1a1d1a] cursor-pointer"><X className="size-5" /></button>
            </div>
            <div className="space-y-3.5">
              <div>
                <Label>Target Folder</Label>
                <select
                  value={folderForm.folder_number}
                  onChange={(e) => {
                    const num = Number(e.target.value)
                    const found = REACCREDITATION_FOLDERS.find((f) => f.num === num)
                    setFolderForm({ ...folderForm, folder_number: num, folder_name: found ? found.name : folderForm.folder_name })
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]"
                >
                  {REACCREDITATION_FOLDERS.map((f) => (<option key={f.num} value={f.num}>Folder #{f.num}: {f.name}</option>))}
                </select>
              </div>
              <div><Label>Document Title / File Name</Label><Input placeholder="e.g. GTEC_Accreditation_2026.pdf" value={folderForm.file_name} onChange={(e) => setFolderForm({ ...folderForm, file_name: e.target.value })} /></div>
              <div><Label>File URL / Path</Label><Input placeholder="/uploads/reaccreditation/folder_1/doc.pdf" value={folderForm.file_url} onChange={(e) => setFolderForm({ ...folderForm, file_url: e.target.value })} /></div>
              <div><Label>Description</Label><textarea rows={2} value={folderForm.description || ''} onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })} className="w-full p-2.5 rounded-lg border border-[#e2e5dc] bg-white text-[13px] text-[#1a1d1a]" /></div>
            </div>
            <Button
              className="w-full h-11 font-bold"
              onClick={async () => {
                if (!folderForm.file_name.trim()) return
                try {
                  await apiUploadReaccreditationFolderDoc(token, {
                    ...folderForm,
                    file_url: folderForm.file_url || `/uploads/reaccreditation/folder_${folderForm.folder_number}/${folderForm.file_name}`,
                  })
                  setShowFolderModal(false)
                  setFeedbackBanner({ type: 'success', text: 'Accreditation evidence document added.' })
                  await loadAll()
                } catch (err) {
                  setFeedbackBanner({ type: 'error', text: extractError(err) })
                }
              }}
            >
              Upload Evidence
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
