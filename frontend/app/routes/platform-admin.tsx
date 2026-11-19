import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Copy,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  Shield,
  XCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  apiGetPlatformOverview,
  apiPlatformApproveInstitution,
  apiPlatformAuditLogs,
  apiPlatformListInstitutions,
  apiPlatformRejectInstitution,
  apiPlatformUpdateInstitutionStatus,
  getValidAccessToken,
  type ApiInstitutionAdmin,
  type ApiInstitutionApprovalResponse,
  type ApiPlatformOverview,
  type ApiTenantAuditLog,
} from "../lib/api";

export function meta() {
  return [{ title: "Platform Administration — Multi-School Thesis Repository" }];
}

export default function PlatformAdminPage() {
  const navigate = useNavigate();
  const { user, login, logout } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [overview, setOverview] = useState<ApiPlatformOverview | null>(null);
  const [institutions, setInstitutions] = useState<ApiInstitutionAdmin[]>([]);
  const [auditLogs, setAuditLogs] = useState<ApiTenantAuditLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [provisionedModal, setProvisionedModal] = useState<ApiInstitutionApprovalResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error("Sign in as Platform Operator first.");
      const [ov, insts, logs] = await Promise.all([
        apiGetPlatformOverview(token),
        apiPlatformListInstitutions(token, statusFilter === "all" ? undefined : statusFilter),
        apiPlatformAuditLogs(token),
      ]);
      setOverview(ov);
      setInstitutions(insts);
      setAuditLogs(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) {
      void loadData();
    }
  }, [isPlatformAdmin, statusFilter]);

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    const res = await login(email.trim(), password, "system_admin");
    setAuthLoading(false);
    if (!res.ok) {
      setAuthError(res.error || "Invalid Platform Operator credentials");
    }
  };

  const handleApprove = async (inst: ApiInstitutionAdmin) => {
    const notes = window.prompt(`Optional approval notes for ${inst.name}:`, "Verified institutional request");
    if (notes === null) return;
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const result = await apiPlatformApproveInstitution(inst.id, { approval_notes: notes }, token);
      setProvisionedModal(result);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  };

  const handleReject = async (inst: ApiInstitutionAdmin) => {
    const reason = window.prompt(`Enter rejection reason for ${inst.name}:`);
    if (!reason || reason.trim().length < 3) return;
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      await apiPlatformRejectInstitution(inst.id, reason.trim(), token);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed");
    }
  };

  const handleToggleSuspend = async (inst: ApiInstitutionAdmin) => {
    const nextStatus = inst.status === "suspended" ? "approved" : "suspended";
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      await apiPlatformUpdateInstitutionStatus(
        inst.id,
        { status: nextStatus, is_active: nextStatus === "approved" },
        token,
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    }
  };

  if (!isPlatformAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-main)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="fp-card" style={{ width: "100%", maxWidth: 420, padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <Shield style={{ width: 24, height: 24, color: "var(--fp-olive)" }} />
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Platform Operator Sign-In</h1>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
            Sign in with a Platform Administrator account to approve new schools, manage tenants, and monitor service health.
          </p>
          {user && !user.isPlatformAdmin && (
            <div style={{ padding: 12, borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 12.5, marginBottom: 16 }}>
              Currently signed in as <strong>{user.email}</strong> (tenant account). Please sign out and sign in with a Platform Operator account.
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={() => void logout()} className="btn-fp-outline" style={{ padding: "5px 10px", fontSize: 12 }}>
                  Sign out
                </button>
              </div>
            </div>
          )}
          {authError && (
            <div style={{ padding: 10, borderRadius: 8, background: "#fdf2f0", color: "#c93b2b", fontSize: 12.5, marginBottom: 14 }}>
              {authError}
            </div>
          )}
          <form onSubmit={handleOperatorLogin} style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>Operator Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="platform-admin@thesiscloud.org"
                style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
              />
            </div>
            <button type="submit" disabled={authLoading} className="btn-fp-olive" style={{ padding: "11px 16px", fontSize: 14 }}>
              {authLoading ? "Signing in..." : "Sign in to Platform Console"}
            </button>
            <button type="button" onClick={() => navigate("/")} className="btn-fp-outline" style={{ padding: "9px 14px", fontSize: 13 }}>
              Back to Directory
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)", color: "var(--text-main)" }}>
      <header
        style={{
          background: "var(--bg-header)",
          borderBottom: "1px solid var(--border-header)",
          padding: "0 28px",
          height: 62,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{ background: "none", border: "none", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--text-main)" }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            <span>Directory</span>
          </button>
          <span style={{ fontWeight: 800, fontSize: 16 }}>Platform Administration Console</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{user?.email}</span>
          <button type="button" onClick={() => void logout()} className="btn-fp-outline" style={{ padding: "6px 12px", fontSize: 12.5 }}>
            Log out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 64px", display: "flex", flexDirection: "column", gap: 28 }}>
        {error && (
          <div style={{ padding: 14, borderRadius: 10, background: "#fdf2f0", color: "#c93b2b", border: "1px solid #f5d0ca" }}>
            {error}
          </div>
        )}

        {/* Provisioned Credentials Modal Banner */}
        {provisionedModal && (
          <div className="fp-card" style={{ borderColor: "var(--fp-green)", borderWidth: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16 }}>
              <div>
                <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: "var(--fp-green)" }}>
                  Workspace Provisioned: {provisionedModal.institution.name}
                </h3>
                <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--text-muted)" }}>{provisionedModal.message}</p>
                <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <div>
                    <strong>Workspace URL:</strong>{" "}
                    <a href={`/${provisionedModal.institution.slug}`} style={{ color: "var(--fp-olive)", fontWeight: 700 }}>
                      {provisionedModal.workspace_url}
                    </a>
                  </div>
                  <div>
                    <strong>Admin Email:</strong> <code>{provisionedModal.admin_email}</code>
                  </div>
                  {provisionedModal.temporary_password && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong>Temporary Admin Password:</strong>
                      <code style={{ padding: "3px 8px", background: "var(--bg-subtle)", borderRadius: 6 }}>
                        {provisionedModal.temporary_password}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(provisionedModal.temporary_password || "");
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="btn-fp-outline"
                        style={{ padding: "4px 8px", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <Copy style={{ width: 12, height: 12 }} />
                        <span>{copied ? "Copied!" : "Copy"}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setProvisionedModal(null)} className="btn-fp-outline" style={{ padding: "6px 12px", fontSize: 12 }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Service Health & KPI Cards */}
        {overview && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            {[
              { label: "Service Health", value: overview.status.toUpperCase(), sub: `Storage: ${overview.storage_backend}` },
              { label: "Approved Tenants", value: overview.approved_institutions, sub: `${overview.total_institutions} total registered` },
              { label: "Pending Approvals", value: overview.pending_institutions, sub: "Awaiting review" },
              { label: "Total Users", value: overview.total_users, sub: `${overview.total_departments} departments` },
              { label: "Total Papers", value: overview.total_papers, sub: "Across all schools" },
            ].map((kpi) => (
              <div key={kpi.label} className="fp-card" style={{ padding: 18 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>{kpi.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, margin: "4px 0" }}>{kpi.value}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{kpi.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Institutions Table */}
        <section className="fp-card">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Building2 style={{ width: 20, height: 20, color: "var(--fp-olive)" }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Institutions & Onboarding Requests</h2>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {["all", "pending", "approved", "suspended", "rejected"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={statusFilter === st ? "btn-fp-olive" : "btn-fp-outline"}
                  style={{ padding: "6px 12px", fontSize: 12, textTransform: "capitalize" }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Loading tenants...</div>
          ) : institutions.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No institutions in this status.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Institution</th>
                    <th>Slug / Link</th>
                    <th>Branding</th>
                    <th>Admin Contact</th>
                    <th>Usage</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {institutions.map((inst) => (
                    <tr key={inst.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{inst.short_name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{inst.name}</div>
                      </td>
                      <td>
                        <code>/{inst.slug}</code>
                        {inst.custom_domain && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{inst.custom_domain}</div>}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {[inst.primary_color, inst.secondary_color, inst.accent_color].map((hex) => (
                            <span key={hex} title={hex} style={{ width: 16, height: 16, borderRadius: 4, background: hex, border: "1px solid rgba(0,0,0,0.12)" }} />
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5 }}>{inst.admin_email || inst.contact_email || "-"}</div>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{inst.admin_full_name || inst.contact_name || ""}</div>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {inst.users_count} users · {inst.papers_count} papers
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            textTransform: "capitalize",
                            background:
                              inst.status === "approved"
                                ? "#dcfce7"
                                : inst.status === "pending"
                                  ? "#fef3c7"
                                  : "#fee2e2",
                            color:
                              inst.status === "approved"
                                ? "#166534"
                                : inst.status === "pending"
                                  ? "#92400e"
                                  : "#991b1b",
                          }}
                        >
                          {inst.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {inst.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleApprove(inst)}
                                className="btn-fp-olive"
                                style={{ padding: "5px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                              >
                                <CheckCircle2 style={{ width: 13, height: 13 }} />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReject(inst)}
                                className="btn-fp-outline"
                                style={{ padding: "5px 10px", fontSize: 12, color: "#c93b2b", display: "inline-flex", alignItems: "center", gap: 4 }}
                              >
                                <XCircle style={{ width: 13, height: 13 }} />
                                <span>Reject</span>
                              </button>
                            </>
                          )}
                          {inst.status === "approved" && (
                            <>
                              <button
                                type="button"
                                onClick={() => navigate(`/${inst.slug}`)}
                                className="btn-fp-sage"
                                style={{ padding: "5px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                              >
                                <ExternalLink style={{ width: 12, height: 12 }} />
                                <span>Open</span>
                              </button>
                              {inst.slug !== "gimpa" && (
                                <button
                                  type="button"
                                  onClick={() => void handleToggleSuspend(inst)}
                                  className="btn-fp-outline"
                                  style={{ padding: "5px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                                >
                                  <PauseCircle style={{ width: 13, height: 13 }} />
                                  <span>Suspend</span>
                                </button>
                              )}
                            </>
                          )}
                          {inst.status === "suspended" && (
                            <button
                              type="button"
                              onClick={() => void handleToggleSuspend(inst)}
                              className="btn-fp-olive"
                              style={{ padding: "5px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                            >
                              <PlayCircle style={{ width: 13, height: 13 }} />
                              <span>Reactivate</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Platform Audit Trail */}
        <section className="fp-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <Activity style={{ width: 19, height: 19, color: "var(--fp-olive)" }} />
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Platform Security & Governance Audit Log</h2>
          </div>
          {auditLogs.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No administrative events recorded yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.slice(0, 25).map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                        {log.created_at ? new Date(log.created_at).toLocaleString() : "-"}
                      </td>
                      <td>
                        <code style={{ fontSize: 12 }}>{log.action}</code>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{log.actor_email || "System / Applicant"}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 400, wordBreak: "break-word" }}>
                        {log.details || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
