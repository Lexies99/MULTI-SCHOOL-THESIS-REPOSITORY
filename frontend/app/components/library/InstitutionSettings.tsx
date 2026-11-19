import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Download,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Trash2,
  Upload,
} from "lucide-react";
import {
  apiCreateDepartment,
  apiDeleteInstitutionLogo,
  apiExportInstitutionData,
  apiGetCurrentInstitution,
  apiGetInstitutionAuditLogs,
  apiListDepartments,
  apiUpdateCurrentInstitutionBranding,
  apiUploadInstitutionLogo,
  getValidAccessToken,
  type ApiDepartment,
  type ApiInstitutionAdmin,
  type ApiTenantAuditLog,
} from "../../lib/api";
import {
  DEFAULT_INSTITUTION_BRANDING,
  evaluatePaletteContrast,
  getAccessibleTextColor,
  isValidHex,
  PRESET_INSTITUTION_PALETTES,
} from "../../lib/branding";
import { useTenant } from "../../context/TenantContext";

export function InstitutionSettings() {
  const { refreshTenant } = useTenant();
  const [institution, setInstitution] = useState<ApiInstitutionAdmin | null>(null);
  const [departments, setDepartments] = useState<ApiDepartment[]>([]);
  const [auditLogs, setAuditLogs] = useState<ApiTenantAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Editable fields
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [academicYear, setAcademicYear] = useState("2025/2026");
  const [allowPublicCatalog, setAllowPublicCatalog] = useState(true);

  const [primaryColor, setPrimaryColor] = useState(DEFAULT_INSTITUTION_BRANDING.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_INSTITUTION_BRANDING.secondary_color);
  const [accentColor, setAccentColor] = useState(DEFAULT_INSTITUTION_BRANDING.accent_color);
  const [neutralColor, setNeutralColor] = useState(DEFAULT_INSTITUTION_BRANDING.neutral_color);
  const [defaultTheme, setDefaultTheme] = useState<"light" | "dark">("light");

  // New department creator
  const [newDeptName, setNewDeptName] = useState("");
  const [newFacultyName, setNewFacultyName] = useState("");

  const syncForm = (inst: ApiInstitutionAdmin) => {
    setInstitution(inst);
    setName(inst.name || "");
    setShortName(inst.short_name || "");
    setWebsite(inst.website || "");
    setAddress(inst.address || "");
    setAllowedDomains(inst.allowed_email_domains || "");
    setAcademicYear(inst.academic_year || "2025/2026");
    setAllowPublicCatalog(inst.allow_public_catalog);
    setPrimaryColor(inst.primary_color || DEFAULT_INSTITUTION_BRANDING.primary_color);
    setSecondaryColor(inst.secondary_color || DEFAULT_INSTITUTION_BRANDING.secondary_color);
    setAccentColor(inst.accent_color || DEFAULT_INSTITUTION_BRANDING.accent_color);
    setNeutralColor(inst.neutral_color || DEFAULT_INSTITUTION_BRANDING.neutral_color);
    setDefaultTheme(inst.default_theme === "dark" ? "dark" : "light");
  };

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const [inst, depts, logs] = await Promise.all([
        apiGetCurrentInstitution(token),
        apiListDepartments(token),
        apiGetInstitutionAuditLogs(token, 40),
      ]);
      syncForm(inst);
      setDepartments(depts);
      setAuditLogs(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load institution settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const contrast = useMemo(
    () =>
      evaluatePaletteContrast({
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        accent_color: accentColor,
        neutral_color: neutralColor,
      }),
    [primaryColor, secondaryColor, accentColor, neutralColor],
  );

  const handleSaveBranding = async (resetToDefault = false) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) throw new Error("Authentication required");
      const updated = await apiUpdateCurrentInstitutionBranding(
        resetToDefault
          ? { reset_to_default: true }
          : {
              name: name.trim(),
              short_name: shortName.trim(),
              website: website.trim(),
              address: address.trim(),
              allowed_email_domains: allowedDomains.trim(),
              academic_year: academicYear.trim(),
              allow_public_catalog: allowPublicCatalog,
              primary_color: primaryColor.toUpperCase(),
              secondary_color: secondaryColor.toUpperCase(),
              accent_color: accentColor.toUpperCase(),
              neutral_color: neutralColor.toUpperCase(),
              default_theme: defaultTheme,
            },
        token,
      );
      syncForm(updated);
      await refreshTenant(updated.slug);
      setMessage(resetToDefault ? "Branding reset to default palette." : "Institution branding and settings saved!");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save branding settings");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const updated = await apiUploadInstitutionLogo(file, token);
      syncForm(updated);
      await refreshTenant(updated.slug);
      setMessage("Institution logo updated!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    }
  };

  const handleRemoveLogo = async () => {
    setError("");
    setMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const updated = await apiDeleteInstitutionLogo(token);
      syncForm(updated);
      await refreshTenant(updated.slug);
      setMessage("Institution logo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove logo");
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setError("");
    setMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      await apiCreateDepartment(
        {
          name: newDeptName.trim(),
          faculty_name: newFacultyName.trim() || undefined,
        },
        token,
      );
      setNewDeptName("");
      setNewFacultyName("");
      setMessage("Department added to your institution!");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create department");
    }
  };

  const handleExport = async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const { blob, filename } = await apiExportInstitutionData(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("Exported institutional dataset.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  };

  if (loading) {
    return <div className="fp-card" style={{ padding: 36, textAlign: "center", color: "var(--text-muted)" }}>Loading institution settings...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Institution Branding & Settings</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--text-muted)" }}>
            Configure {institution?.short_name}'s visual identity, logo, departments, email domain rules, and data export. Changes apply exclusively to your workspace (<code>/{institution?.slug}</code>).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleExport()}
          className="btn-fp-outline"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", fontSize: 13 }}
        >
          <Download style={{ width: 15, height: 15 }} />
          <span>Export Tenant Data (JSON)</span>
        </button>
      </div>

      {message && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#dcfce7", color: "#166534", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 style={{ width: 16, height: 16 }} />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fdf2f0", color: "#c93b2b", fontSize: 13.5 }}>
          {error}
        </div>
      )}

      {/* Logo & Visual Identity */}
      <section className="fp-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Palette style={{ width: 20, height: 20, color: "var(--fp-olive)" }} />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Logo & Colour Palette</h3>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void handleSaveBranding(true)}
              disabled={saving}
              className="btn-fp-outline"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", fontSize: 12.5 }}
            >
              <RotateCcw style={{ width: 13, height: 13 }} />
              <span>Reset to Default</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSaveBranding(false)}
              disabled={saving}
              className="btn-fp-olive"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", fontSize: 13 }}
            >
              <Save style={{ width: 14, height: 14 }} />
              <span>{saving ? "Saving..." : "Save Branding & Settings"}</span>
            </button>
          </div>
        </div>

        {/* Logo Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22, paddingBottom: 18, borderBottom: "1px solid var(--border-color)" }}>
          {institution?.logo_url ? (
            <img
              src={`${institution.logo_url}?v=${institution.updated_at || ""}`}
              alt={institution.short_name}
              style={{ height: 54, maxWidth: 160, objectFit: "contain", background: "#fff", padding: 6, borderRadius: 10, border: "1px solid var(--border-color)" }}
            />
          ) : (
            <div style={{ width: 54, height: 54, borderRadius: 10, background: primaryColor, color: getAccessibleTextColor(primaryColor), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
              {(shortName || "UNI").slice(0, 3).toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label className="btn-fp-sage" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" }}>
              <Upload style={{ width: 14, height: 14 }} />
              <span>Upload Logo</span>
              <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" onChange={handleUploadLogo} style={{ display: "none" }} />
            </label>
            {institution?.logo_url && (
              <button type="button" onClick={() => void handleRemoveLogo()} className="btn-fp-outline" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 12.5, color: "#c93b2b" }}>
                <Trash2 style={{ width: 13, height: 13 }} />
                <span>Remove</span>
              </button>
            )}
          </div>
        </div>

        {/* Presets */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {PRESET_INSTITUTION_PALETTES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setPrimaryColor(preset.primary_color);
                setSecondaryColor(preset.secondary_color);
                setAccentColor(preset.accent_color);
                setNeutralColor(preset.neutral_color);
              }}
              className="btn-fp-outline"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", fontSize: 12 }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 999, background: preset.primary_color }} />
              <span style={{ width: 12, height: 12, borderRadius: 999, background: preset.secondary_color }} />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>

        {/* Colour Pickers + Contrast Status */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 14, marginBottom: 16 }}>
          {[
            { label: "Primary Colour", val: primaryColor, set: setPrimaryColor },
            { label: "Secondary Colour", val: secondaryColor, set: setSecondaryColor },
            { label: "Accent Colour", val: accentColor, set: setAccentColor },
            { label: "Neutral Surface", val: neutralColor, set: setNeutralColor },
          ].map((c) => (
            <div key={c.label}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>{c.label}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="color" value={isValidHex(c.val) ? c.val : "#5A6552"} onChange={(e) => c.set(e.target.value.toUpperCase())} style={{ width: 40, height: 36, padding: 2 }} />
                <input value={c.val} onChange={(e) => c.set(e.target.value.toUpperCase())} maxLength={7} style={{ flex: 1, padding: "7px 10px", fontSize: 13, fontFamily: "monospace" }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12.5, padding: 12, borderRadius: 8, background: contrast.accessible ? "#f0fdf4" : "#fffbeb", border: "1px solid var(--border-color)", color: contrast.accessible ? "#166534" : "#92400e", marginBottom: 20 }}>
          <strong>Contrast Audit:</strong> Primary {contrast.primaryRatio}:1 · Secondary {contrast.secondaryRatio}:1 · Accent {contrast.accentRatio}:1 —{" "}
          {contrast.accessible ? "Passes WCAG AA readability checks." : contrast.warnings.join(" ")}
        </div>

        {/* Profile & Domain Settings */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Official Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: 13.5 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Short Display Name</label>
            <input value={shortName} onChange={(e) => setShortName(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: 13.5 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Allowed Email Domains (comma-separated)</label>
            <input value={allowedDomains} onChange={(e) => setAllowedDomains(e.target.value)} placeholder="e.g. university.edu" style={{ width: "100%", padding: "9px 12px", fontSize: 13.5 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Academic Year</label>
            <input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: 13.5 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Website</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: 13.5 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Default Workspace Theme</label>
            <select value={defaultTheme} onChange={(e) => setDefaultTheme(e.target.value === "dark" ? "dark" : "light")} style={{ width: "100%", padding: "9px 12px", fontSize: 13.5 }}>
              <option value="light">Light Mode</option>
              <option value="dark">Dark Mode</option>
            </select>
          </div>
        </div>
      </section>

      {/* Institution Departments Configuration */}
      <section className="fp-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Building2 style={{ width: 19, height: 19, color: "var(--fp-olive)" }} />
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Departments & Faculties ({departments.length})</h3>
        </div>
        <form onSubmit={handleAddDepartment} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <input
            value={newFacultyName}
            onChange={(e) => setNewFacultyName(e.target.value)}
            placeholder="Faculty / School (optional)"
            style={{ flex: "1 1 200px", padding: "9px 12px", fontSize: 13 }}
          />
          <input
            required
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            placeholder="New Department Name *"
            style={{ flex: "1 1 240px", padding: "9px 12px", fontSize: 13 }}
          />
          <button type="submit" className="btn-fp-olive" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13 }}>
            <Plus style={{ width: 14, height: 14 }} />
            <span>Add Department</span>
          </button>
        </form>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {departments.map((d) => (
            <span key={d.id} className="fp-tag-sage" style={{ fontSize: 12.5 }}>
              {d.name}
              {d.institution_name && d.institution_name !== d.name ? ` (${d.institution_name})` : ""}
            </span>
          ))}
        </div>
      </section>

      {/* Institution Audit Log */}
      <section className="fp-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Shield style={{ width: 18, height: 18, color: "var(--fp-olive)" }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Recent Institutional Audit Trail</h3>
        </div>
        {auditLogs.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No administrative actions recorded yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.slice(0, 15).map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 12 }}>{log.created_at ? new Date(log.created_at).toLocaleString() : "-"}</td>
                    <td><code style={{ fontSize: 12 }}>{log.action}</code></td>
                    <td style={{ fontSize: 12.5 }}>{log.actor_email || "System"}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{log.details || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
