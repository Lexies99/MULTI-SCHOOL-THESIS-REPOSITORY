import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Download,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  apiCreateDepartment,
  apiDeleteDepartment,
  apiDeleteInstitutionLogo,
  apiExportInstitutionData,
  apiGetCurrentInstitution,
  apiGetInstitutionAuditLogs,
  apiListDepartments,
  apiUpdateCurrentInstitutionBranding,
  apiUpdateDepartment,
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

  // New department creator & inline editor
  const [newDeptName, setNewDeptName] = useState("");
  const [newFacultyName, setNewFacultyName] = useState("");
  const [newProgramsText, setNewProgramsText] = useState("");
  const [editingDeptId, setEditingDeptId] = useState<number | null>(null);
  const [editFacultyName, setEditFacultyName] = useState("");
  const [editDeptName, setEditDeptName] = useState("");
  const [editProgramsText, setEditProgramsText] = useState("");

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
      const programs = newProgramsText
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      await apiCreateDepartment(
        {
          name: newDeptName.trim(),
          faculty_name: newFacultyName.trim() || undefined,
          programs,
        },
        token,
      );
      setNewDeptName("");
      setNewFacultyName("");
      setNewProgramsText("");
      setMessage("School / Department added to your institution!");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create department");
    }
  };

  const startEditDept = (d: ApiDepartment) => {
    setEditingDeptId(d.id);
    setEditFacultyName(d.faculty_name || d.institution_name || "");
    setEditDeptName(d.name || "");
    setEditProgramsText((d.programs || []).join(", "));
  };

  const handleSaveDeptEdit = async (deptId: number) => {
    setError("");
    setMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      const programs = editProgramsText
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      await apiUpdateDepartment(
        deptId,
        {
          name: editDeptName.trim(),
          faculty_name: editFacultyName.trim(),
          programs,
        },
        token,
      );
      setEditingDeptId(null);
      setMessage("Department & programs updated.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update department");
    }
  };

  const handleDeleteDept = async (d: ApiDepartment) => {
    if (!window.confirm(`Delete department "${d.name}" from ${institution?.short_name || "your institution"}?`)) return;
    setError("");
    setMessage("");
    try {
      const token = await getValidAccessToken();
      if (!token) return;
      await apiDeleteDepartment(d.id, token);
      setMessage(`Deleted department "${d.name}".`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete department");
    }
  };

  const departmentsByFaculty = useMemo(() => {
    const groups = new Map<string, ApiDepartment[]>();
    for (const d of departments) {
      const fac = (d.faculty_name || d.institution_name || institution?.short_name || "General").trim();
      const arr = groups.get(fac) || [];
      arr.push(d);
      groups.set(fac, arr);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [departments, institution?.short_name]);

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

      {/* Institution Schools, Departments & Programs Configuration */}
      <section className="fp-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Building2 style={{ width: 19, height: 19, color: "var(--fp-olive)" }} />
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                Schools / Faculties, Departments & Programs ({departments.length})
              </h3>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                These schools, departments, and programs immediately power your Public Catalog, Search Filters, Account Creation, and Proposal Submission screens.
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleAddDepartment} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 20 }}>
          <input
            value={newFacultyName}
            onChange={(e) => setNewFacultyName(e.target.value)}
            placeholder="School / College / Faculty (e.g. College of Humanities)"
            style={{ padding: "9px 12px", fontSize: 13 }}
          />
          <input
            required
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            placeholder="Department Name * (e.g. Economics)"
            style={{ padding: "9px 12px", fontSize: 13 }}
          />
          <input
            value={newProgramsText}
            onChange={(e) => setNewProgramsText(e.target.value)}
            placeholder="Programs (comma-separated, e.g. BA Economics, MPhil Economics)"
            style={{ padding: "9px 12px", fontSize: 13 }}
          />
          <button type="submit" className="btn-fp-olive" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 16px", fontSize: 13 }}>
            <Plus style={{ width: 14, height: 14 }} />
            <span>Add School / Dept</span>
          </button>
        </form>

        {departmentsByFaculty.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            No schools or departments configured yet. Add your first school and department above.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {departmentsByFaculty.map(([facultyLabel, facDepts]) => (
              <div
                key={facultyLabel}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  padding: 14,
                  background: "var(--bg-main)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{facultyLabel}</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 500 }}>
                    {facDepts.length} department{facDepts.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {facDepts.map((d) =>
                    editingDeptId === d.id ? (
                      <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.2fr auto auto", gap: 8, alignItems: "center" }}>
                        <input
                          value={editFacultyName}
                          onChange={(e) => setEditFacultyName(e.target.value)}
                          placeholder="School / Faculty"
                          style={{ padding: "7px 9px", fontSize: 12.5 }}
                        />
                        <input
                          value={editDeptName}
                          onChange={(e) => setEditDeptName(e.target.value)}
                          placeholder="Department"
                          style={{ padding: "7px 9px", fontSize: 12.5 }}
                        />
                        <input
                          value={editProgramsText}
                          onChange={(e) => setEditProgramsText(e.target.value)}
                          placeholder="Programs (comma-separated)"
                          style={{ padding: "7px 9px", fontSize: 12.5 }}
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveDeptEdit(d.id)}
                          className="btn-fp-olive"
                          style={{ padding: "6px 10px", fontSize: 12 }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDeptId(null)}
                          className="btn-fp-outline"
                          style={{ padding: "6px 8px" }}
                        >
                          <X style={{ width: 13, height: 13 }} />
                        </button>
                      </div>
                    ) : (
                      <div
                        key={d.id}
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.name}</div>
                          {d.programs && d.programs.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                              {d.programs.map((prog) => (
                                <span
                                  key={prog}
                                  style={{
                                    fontSize: 11,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: "var(--fp-sage)",
                                    color: "var(--fp-sage-text)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {prog}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => startEditDept(d)}
                            className="btn-fp-outline"
                            style={{ padding: "5px 9px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            <Pencil style={{ width: 12, height: 12 }} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteDept(d)}
                            className="btn-fp-outline"
                            style={{ padding: "5px 9px", fontSize: 12, color: "#c93b2b", display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            <Trash2 style={{ width: 12, height: 12 }} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
