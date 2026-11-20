import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileEdit,
  FileText,
  GraduationCap,
  Lock,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  apiDownloadPaperFile,
  apiGetMyPapers,
  apiGetSubmissionEligibility,
  apiStudentUpdateChecklist,
  apiSubmitInSystemCorrections,
  apiUploadCombinedThesis,
  apiUploadCorrections,
  getValidAccessToken,
  type ApiPaper,
  type ApiSubmissionEligibility,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";

const COMPLETED_STATUSES = new Set([
  "approved",
  "published",
  "phase5_published",
  "phase5_certified",
]);

const TERMINAL_STATUSES = new Set([
  ...COMPLETED_STATUSES,
  "rejected",
  "phase1_topic_rejected",
  "withdrawn",
]);

function getPhaseNumber(status: string): number {
  const s = (status || "").toLowerCase();
  if (COMPLETED_STATUSES.has(s) || s.startsWith("phase5") || s === "approved_for_library") return 5;
  if (s.startsWith("phase4") || s.includes("examin")) return 4;
  if (s.startsWith("phase3") || s.includes("chapter")) return 3;
  if (s.startsWith("phase2") || s.includes("supervisor") || s.includes("coordinator")) return 2;
  return 1;
}

function formatStatusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  if (COMPLETED_STATUSES.has(s)) return "Completed & Published";
  if (s === "phase1_topic_rejected" || s === "rejected") return "Topic Rejected";
  return (status || "submitted").replace(/_/g, " ");
}

const PHASES = [
  { num: 1, label: "Topic & Proposal" },
  { num: 2, label: "Supervisor Allocation" },
  { num: 3, label: "Chapters (1–5)" },
  { num: 4, label: "Examination" },
  { num: 5, label: "Certification & Archive" },
];

export function MyThesisSubmissions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenant, tenantPath, theme } = useTenant();
  const isDark = theme === "dark";

  const [papers, setPapers] = useState<ApiPaper[]>([]);
  const [eligibility, setEligibility] = useState<ApiSubmissionEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyPaperId, setBusyPaperId] = useState<number | null>(null);

  const [combinedFile, setCombinedFile] = useState<File | null>(null);
  const [correctionsFile, setCorrectionsFile] = useState<File | null>(null);

  const isStudent = user?.role === "student" || user?.role === "member";

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getValidAccessToken();
      if (!token) {
        setPapers([]);
        setEligibility(null);
        return;
      }
      const [myList, elig] = await Promise.all([
        apiGetMyPapers(token),
        apiGetSubmissionEligibility(token),
      ]);
      setPapers(myList);
      setEligibility(elig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your thesis submissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions, tenant?.slug]);

  const activePapers = useMemo(
    () => papers.filter((p) => !TERMINAL_STATUSES.has((p.status || "").toLowerCase())),
    [papers],
  );

  const completedPapers = useMemo(
    () => papers.filter((p) => COMPLETED_STATUSES.has((p.status || "").toLowerCase())),
    [papers],
  );

  const closedNonCompletedPapers = useMemo(
    () =>
      papers.filter((p) => {
        const s = (p.status || "").toLowerCase();
        return TERMINAL_STATUSES.has(s) && !COMPLETED_STATUSES.has(s);
      }),
    [papers],
  );

  const canStartNew = eligibility ? eligibility.can_submit_new : !isStudent || activePapers.length === 0;

  const handleChapterToggle = async (paper: ApiPaper, chapterKey: string, checked: boolean) => {
    setActionError("");
    setActionMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      await apiStudentUpdateChecklist(paper.id, chapterKey, checked, token);
      await loadSubmissions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update chapter progress");
    }
  };

  const handleUploadCombined = async (e: React.FormEvent, paperId: number) => {
    e.preventDefault();
    if (!combinedFile) return;
    setBusyPaperId(paperId);
    setActionError("");
    setActionMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      await apiUploadCombinedThesis(paperId, combinedFile, token);
      setCombinedFile(null);
      setActionMessage("Combined thesis (Chapters 1–5) uploaded successfully!");
      await loadSubmissions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusyPaperId(null);
    }
  };

  const handleSubmitCorrections = async (e: React.FormEvent, paperId: number) => {
    e.preventDefault();
    setBusyPaperId(paperId);
    setActionError("");
    setActionMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      if (correctionsFile) {
        await apiUploadCorrections(paperId, correctionsFile, token);
        setCorrectionsFile(null);
        setActionMessage("Revised thesis corrections uploaded for supervisor review.");
      } else {
        await apiSubmitInSystemCorrections(paperId, token);
        setActionMessage("In-system ONLYOFFICE corrections submitted for review.");
      }
      await loadSubmissions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to submit corrections");
    } finally {
      setBusyPaperId(null);
    }
  };

  const handleDownload = async (paper: ApiPaper) => {
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const { blob, filename } = await apiDownloadPaperFile(paper.id, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Page Header & New Submission CTA */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
            My Thesis Submissions
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--text-muted)" }}>
            Track your active thesis workflow and archive of completed degree submissions at{" "}
            <strong>{tenant?.short_name || tenant?.name || "your institution"}</strong>.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void loadSubmissions()}
            className="btn-fp-outline"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", fontSize: 13 }}
          >
            <RefreshCw style={{ width: 14, height: 14 }} />
            <span>Refresh</span>
          </button>

          {canStartNew ? (
            <button
              type="button"
              onClick={() => navigate(tenantPath("/submit-proposal"))}
              className="btn-fp-olive"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 18px", fontSize: 13.5 }}
            >
              <Plus style={{ width: 15, height: 15 }} />
              <span>
                {completedPapers.length > 0 ? "Start Next Degree Submission" : "New Thesis Submission"}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="btn-fp-outline"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "10px 16px",
                fontSize: 13,
                opacity: 0.65,
                cursor: "not-allowed",
              }}
              title="Complete your active submission before starting a new one"
            >
              <Lock style={{ width: 14, height: 14 }} />
              <span>1 Submission At A Time</span>
            </button>
          )}
        </div>
      </div>

      {/* Single-Active-Submission Policy Banner */}
      {isStudent && (
        <div
          className="fp-card"
          style={{
            padding: "16px 20px",
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            borderColor: canStartNew ? "var(--fp-green)" : "var(--fp-olive)",
            background: "var(--bg-card)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: canStartNew ? "var(--fp-sage)" : "var(--fp-olive)",
              color: canStartNew ? "var(--fp-sage-text)" : "var(--fp-olive-text, #ffffff)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {canStartNew ? <GraduationCap style={{ width: 19, height: 19 }} /> : <Lock style={{ width: 18, height: 18 }} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>
              {canStartNew
                ? completedPapers.length > 0
                  ? `Ready for Your Next Degree Submission (${completedPapers.length} Completed)`
                  : "Eligible to Start Your Thesis Submission"
                : "Active Submission In Progress — New Submissions Locked"}
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>
              {canStartNew
                ? completedPapers.length > 0
                  ? "Your previous submission is complete and archived. Using your same student account/ID, you may now begin your next academic submission (for example, progressing from Undergraduate to Master's or PhD)."
                  : "Students work on one thesis submission at a time. Once you submit a topic/proposal, complete all phases through final library publication before starting another degree submission."
                : eligibility?.message ||
                  "You currently have an active thesis submission in progress. Complete your current submission through final approval/publication before starting a new submission (e.g., for your next degree programme)."}
            </p>
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        <div className="fp-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Active Submission</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{activePapers.length} / 1</div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            {activePapers.length > 0 ? "Currently in workflow" : "Slot open"}
          </div>
        </div>
        <div className="fp-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Completed & Published</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: "var(--fp-green)" }}>
            {completedPapers.length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Archived degree works</div>
        </div>
        <div className="fp-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Total Submissions</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{papers.length}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Across all academic levels</div>
        </div>
      </div>

      {error && (
        <div style={{ padding: 14, borderRadius: 10, background: isDark ? "rgba(239, 68, 68, 0.15)" : "#fdf2f0", border: `1px solid ${isDark ? "rgba(239, 68, 68, 0.32)" : "#f5d0ca"}`, color: isDark ? "#fca5a5" : "#c93b2b", fontSize: 13.5 }}>
          {error}
        </div>
      )}
      {actionMessage && (
        <div style={{ padding: 14, borderRadius: 10, background: isDark ? "rgba(34, 197, 94, 0.14)" : "#dcfce7", border: isDark ? "1px solid rgba(34, 197, 94, 0.3)" : "none", color: isDark ? "#86efac" : "#166534", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 style={{ width: 16, height: 16 }} />
          <span>{actionMessage}</span>
        </div>
      )}
      {actionError && (
        <div style={{ padding: 14, borderRadius: 10, background: isDark ? "rgba(239, 68, 68, 0.15)" : "#fdf2f0", border: isDark ? "1px solid rgba(239, 68, 68, 0.32)" : "none", color: isDark ? "#fca5a5" : "#c93b2b", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle style={{ width: 16, height: 16 }} />
          <span>{actionError}</span>
        </div>
      )}

      {loading ? (
        <div className="fp-card" style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
          Loading your thesis submissions...
        </div>
      ) : papers.length === 0 ? (
        <div className="fp-card" style={{ padding: 52, textAlign: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--fp-sage)",
              color: "var(--fp-sage-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px",
            }}
          >
            <BookOpen style={{ width: 26, height: 26 }} />
          </div>
          <h3 style={{ margin: "0 0 6px", fontSize: 19, fontWeight: 800 }}>No Thesis Submissions Yet</h3>
          <p style={{ margin: "0 auto 20px", maxWidth: 460, fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Submit your topic proposal to kick off the 5-phase thesis workflow—from supervisor allocation and chapter writing to examination and library publication.
          </p>
          <button
            type="button"
            onClick={() => navigate(tenantPath("/submit-proposal"))}
            className="btn-fp-olive"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 22px", fontSize: 14 }}
          >
            <Upload style={{ width: 15, height: 15 }} />
            <span>Submit Your First Proposal</span>
          </button>
        </div>
      ) : (
        <>
          {/* SECTION 1: ACTIVE IN-PROGRESS SUBMISSION */}
          {activePapers.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Clock style={{ width: 18, height: 18, color: "var(--fp-olive)" }} />
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>Active Submission In Progress</h2>
              </div>

              {activePapers.map((paper) => {
                const currentPhase = getPhaseNumber(paper.status);
                const statusLower = (paper.status || "").toLowerCase();
                const inChaptersPhase =
                  statusLower === "phase3_chapters_in_progress" ||
                  statusLower === "phase3_in_progress" ||
                  statusLower === "phase3_chapters" ||
                  statusLower === "phase3_steps_in_progress";
                const inCorrectionsPhase = statusLower === "phase5_corrections";

                return (
                  <div key={paper.id} className="fp-card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {/* Card Header */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        paddingBottom: 14,
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                          <span className="fp-tag-olive">Active · Phase {currentPhase} of 5</span>
                          {paper.degree_level && <span className="fp-tag-sage">{paper.degree_level}</span>}
                          <span className="fp-tag-sage">{paper.year}</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{paper.title}</h3>
                        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>
                          Submission #{paper.id} · Discipline: {paper.discipline || "General"} · Status:{" "}
                          <strong style={{ textTransform: "capitalize" }}>{formatStatusLabel(paper.status)}</strong>
                        </p>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => navigate(tenantPath(`/paper/${paper.id}`))}
                          className="btn-fp-outline"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 12.5 }}
                        >
                          <ExternalLink style={{ width: 13, height: 13 }} />
                          <span>View Details</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(tenantPath(`/editor?paperId=${paper.id}`))}
                          className="btn-fp-sage"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 12.5 }}
                        >
                          <FileEdit style={{ width: 13, height: 13 }} />
                          <span>Open Document</span>
                        </button>
                        {paper.file_name && (
                          <button
                            type="button"
                            onClick={() => void handleDownload(paper)}
                            className="btn-fp-outline"
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 12.5 }}
                          >
                            <Download style={{ width: 13, height: 13 }} />
                            <span>Download</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 5-Phase Visual Progress Stepper */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                      {PHASES.map((ph) => {
                        const done = ph.num < currentPhase;
                        const active = ph.num === currentPhase;
                        return (
                          <div
                            key={ph.num}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: active ? "2px solid var(--fp-olive)" : "1px solid var(--border-color)",
                              background: done ? "var(--fp-sage)" : active ? "var(--bg-subtle)" : "var(--bg-main)",
                            }}
                          >
                            <div style={{ fontSize: 11, fontWeight: 700, color: done || active ? "var(--text-main)" : "var(--text-muted)" }}>
                              {done ? "✓ " : ""}Phase {ph.num}
                            </div>
                            <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, marginTop: 2 }}>{ph.label}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Review / Examiner Feedback */}
                    {(paper.review_comments || paper.examiner_corrections) && (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 10,
                          background: "var(--bg-main)",
                          border: "1px solid var(--border-color)",
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Reviewer & Examiner Feedback</div>
                        <div style={{ whiteSpace: "pre-wrap", color: "var(--text-sub)" }}>
                          {paper.examiner_corrections || paper.review_comments}
                        </div>
                      </div>
                    )}

                    {/* Phase 3: Chapter Checklist & Combined Thesis Upload */}
                    {inChaptersPhase && (
                      <div
                        style={{
                          padding: 16,
                          borderRadius: 10,
                          background: "var(--bg-main)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 14,
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}>
                          <CheckCircle2 style={{ width: 15, height: 15, color: "var(--fp-green)" }} />
                          <span>Milestone Chapter Checklist (Chapters 1–5)</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                          {[
                            { key: "ch1", label: "Chapter 1: Intro", done: !!paper.ch1_student_done, sup: !!paper.ch1_supervisor_approved },
                            { key: "ch2", label: "Chapter 2: Lit Review", done: !!paper.ch2_student_done, sup: !!paper.ch2_supervisor_approved },
                            { key: "ch3", label: "Chapter 3: Methodology", done: !!paper.ch3_student_done, sup: !!paper.ch3_supervisor_approved },
                            { key: "ch4", label: "Chapter 4: Results", done: !!paper.ch4_student_done, sup: !!paper.ch4_supervisor_approved },
                            { key: "ch5", label: "Chapter 5: Conclusion", done: !!paper.ch5_student_done, sup: !!paper.ch5_supervisor_approved },
                          ].map((ch) => (
                            <label
                              key={ch.key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 10px",
                                borderRadius: 8,
                                border: "1px solid var(--border-color)",
                                background: "var(--bg-card)",
                                cursor: "pointer",
                                fontSize: 12,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={ch.done}
                                onChange={(e) => void handleChapterToggle(paper, ch.key, e.target.checked)}
                              />
                              <span>
                                {ch.label} {ch.sup ? "✓" : ""}
                              </span>
                            </label>
                          ))}
                        </div>

                        <form
                          onSubmit={(e) => void handleUploadCombined(e, paper.id)}
                          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, paddingTop: 10, borderTop: "1px solid var(--border-color)" }}
                        >
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => setCombinedFile(e.target.files?.[0] || null)}
                            style={{ fontSize: 12.5, padding: "6px 8px" }}
                            required
                          />
                          <button
                            type="submit"
                            disabled={busyPaperId === paper.id || !combinedFile}
                            className="btn-fp-olive"
                            style={{ padding: "8px 14px", fontSize: 12.5 }}
                          >
                            {busyPaperId === paper.id ? "Uploading..." : "Submit Complete Thesis (Chapters 1–5)"}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* Phase 5: Post-Defense Corrections */}
                    {inCorrectionsPhase && (
                      <form
                        onSubmit={(e) => void handleSubmitCorrections(e, paper.id)}
                        style={{
                          padding: 16,
                          borderRadius: 10,
                          background: "var(--bg-main)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div style={{ width: "100%", fontWeight: 700, fontSize: 13.5, color: "#c93b2b" }}>
                          Submit Post-Defense Revised Thesis
                        </div>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => setCorrectionsFile(e.target.files?.[0] || null)}
                          style={{ fontSize: 12.5, padding: "6px 8px" }}
                        />
                        <button
                          type="submit"
                          disabled={busyPaperId === paper.id}
                          className="btn-fp-olive"
                          style={{ padding: "8px 14px", fontSize: 12.5 }}
                        >
                          {busyPaperId === paper.id
                            ? "Submitting..."
                            : correctionsFile
                              ? "Upload Corrected Thesis"
                              : "Submit In-System Corrections"}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {/* SECTION 2: COMPLETED & ARCHIVED SUBMISSIONS (Previous Degrees) */}
          {completedPapers.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Award style={{ width: 18, height: 18, color: "var(--fp-green)" }} />
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>
                  Completed & Archived Submissions ({completedPapers.length})
                </h2>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {completedPapers.map((paper) => (
                  <div key={paper.id} className="fp-entity-row" style={{ flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
                      <div className="fp-avatar">
                        <FileText style={{ width: 18, height: 18 }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 3 }}>
                          <span
                            className="badge"
                            style={{ background: isDark ? "rgba(34, 197, 94, 0.18)" : "#dcfce7", color: isDark ? "#86efac" : "#166534" }}
                          >
                            ✓ Completed & Published
                          </span>
                          {paper.degree_level && <span className="fp-tag-sage">{paper.degree_level}</span>}
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{paper.year}</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{paper.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                          {paper.discipline || "General"}
                          {paper.doi ? ` · DOI: ${paper.doi}` : ""}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => navigate(tenantPath(`/paper/${paper.id}`))}
                        className="btn-fp-outline"
                        style={{ padding: "7px 12px", fontSize: 12.5 }}
                      >
                        View
                      </button>
                      {paper.file_name && (
                        <button
                          type="button"
                          onClick={() => void handleDownload(paper)}
                          className="btn-fp-sage"
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 12.5 }}
                        >
                          <Download style={{ width: 13, height: 13 }} />
                          <span>PDF</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SECTION 3: CLOSED / REJECTED TOPICS */}
          {closedNonCompletedPapers.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text-muted)" }}>
                Previous Closed / Rejected Proposals ({closedNonCompletedPapers.length})
              </h3>
              <div style={{ display: "grid", gap: 10 }}>
                {closedNonCompletedPapers.map((paper) => (
                  <div key={paper.id} className="fp-entity-row" style={{ padding: "14px 18px" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{paper.title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        #{paper.id} · {paper.year} · {formatStatusLabel(paper.status)}
                      </div>
                    </div>
                    <span className="badge" style={{ background: "#fee2e2", color: "#991b1b" }}>
                      {formatStatusLabel(paper.status)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
