import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Globe,
  Palette,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  apiCheckSlugAvailability,
  apiOnboardInstitution,
  type ApiInstitutionAdmin,
  type ApiSlugAvailability,
} from "../lib/api";
import {
  DEFAULT_INSTITUTION_BRANDING,
  evaluatePaletteContrast,
  getAccessibleTextColor,
  isValidHex,
  PRESET_INSTITUTION_PALETTES,
} from "../lib/branding";

export function meta() {
  return [
    { title: "Register Your Institution — Multi-School Thesis Repository" },
    { name: "description", content: "Onboard your university or college with custom branding and a dedicated thesis repository workspace." },
  ];
}

export default function OnboardInstitutionPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<ApiSlugAvailability | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [allowedEmailDomains, setAllowedEmailDomains] = useState("");
  const [academicYear, setAcademicYear] = useState("2025/2026");

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminSchoolId, setAdminSchoolId] = useState("");

  // Branding state
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_INSTITUTION_BRANDING.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_INSTITUTION_BRANDING.secondary_color);
  const [accentColor, setAccentColor] = useState(DEFAULT_INSTITUTION_BRANDING.accent_color);
  const [neutralColor, setNeutralColor] = useState(DEFAULT_INSTITUTION_BRANDING.neutral_color);
  const [defaultTheme, setDefaultTheme] = useState<"light" | "dark">("light");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submittedInstitution, setSubmittedInstitution] = useState<ApiInstitutionAdmin | null>(null);

  // Auto-generate slug from shortName or name until user customizes it
  useEffect(() => {
    if (slugManuallyEdited) return;
    const source = shortName.trim() || name.trim();
    const auto = source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
    setSlug(auto);
  }, [shortName, name, slugManuallyEdited]);

  // Real-time slug availability check (debounced)
  useEffect(() => {
    const clean = slug.trim().toLowerCase();
    if (clean.length < 3) {
      setSlugStatus(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingSlug(true);
      try {
        const res = await apiCheckSlugAvailability(clean);
        setSlugStatus(res);
      } catch {
        setSlugStatus(null);
      } finally {
        setCheckingSlug(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [slug]);

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

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError("");
    const file = e.target.files?.[0];
    if (!file) {
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      setLogoError("Unsupported image format. Please upload PNG, JPEG, WEBP, or SVG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo file must be 2 MB or smaller.");
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const resetBrandingToDefault = () => {
    setPrimaryColor(DEFAULT_INSTITUTION_BRANDING.primary_color);
    setSecondaryColor(DEFAULT_INSTITUTION_BRANDING.secondary_color);
    setAccentColor(DEFAULT_INSTITUTION_BRANDING.accent_color);
    setNeutralColor(DEFAULT_INSTITUTION_BRANDING.neutral_color);
    setDefaultTheme("light");
    setLogoFile(null);
    setLogoPreview(null);
    setLogoError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !shortName.trim() || !slug.trim()) {
      setError("Please fill in Institution Name, Short Display Name, and Preferred Web Address.");
      return;
    }
    if (!contactName.trim() || !contactEmail.trim() || !adminFullName.trim() || !adminEmail.trim()) {
      setError("Please fill in Contact Person and Initial Administrator details.");
      return;
    }
    if (!isValidHex(primaryColor) || !isValidHex(secondaryColor) || !isValidHex(accentColor) || !isValidHex(neutralColor)) {
      setError("All brand colours must be valid 6-digit HEX values (e.g. #17365D).");
      return;
    }
    if (slugStatus && !slugStatus.available) {
      setError(slugStatus.message);
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiOnboardInstitution(
        {
          name: name.trim(),
          short_name: shortName.trim(),
          slug: slug.trim().toLowerCase(),
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim().toLowerCase(),
          contact_phone: contactPhone.trim() || undefined,
          website: website.trim() || undefined,
          address: address.trim() || undefined,
          allowed_email_domains: allowedEmailDomains.trim() || undefined,
          academic_year: academicYear.trim() || "2025/2026",
          admin_full_name: adminFullName.trim(),
          admin_email: adminEmail.trim().toLowerCase(),
          admin_school_id: adminSchoolId.trim() || undefined,
          primary_color: primaryColor.toUpperCase(),
          secondary_color: secondaryColor.toUpperCase(),
          accent_color: accentColor.toUpperCase(),
          neutral_color: neutralColor.toUpperCase(),
          default_theme: defaultTheme,
        },
        logoFile,
      );
      setSubmittedInstitution(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit onboarding application.");
    } finally {
      setSubmitting(false);
    }
  };

  const previewOrigin = typeof window !== "undefined" ? window.location.origin : "https://thesis.example.com";

  if (submittedInstitution) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-main)", padding: "48px 20px" }}>
        <div className="fp-card" style={{ maxWidth: 640, margin: "0 auto", padding: 36, textAlign: "center" }}>
          <CheckCircle2 style={{ width: 52, height: 52, color: "var(--fp-green)", margin: "0 auto 14px" }} />
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>Onboarding Request Submitted!</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 24px" }}>
            Thank you for registering <strong>{submittedInstitution.name}</strong>. Your institution workspace is currently{" "}
            <strong style={{ textTransform: "uppercase" }}>{submittedInstitution.status}</strong>. Once approved by a
            platform operator, your initial administrator (<strong>{submittedInstitution.admin_email}</strong>) will receive
            sign-in credentials and your dedicated link.
          </p>

          <div
            style={{
              background: "var(--bg-main)",
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              padding: 18,
              textAlign: "left",
              marginBottom: 24,
              display: "grid",
              gap: 8,
              fontSize: 13.5,
            }}
          >
            <div>
              <strong>Reserved Web Address:</strong>{" "}
              <code>
                {previewOrigin}/{submittedInstitution.slug}
              </code>
            </div>
            <div>
              <strong>Display Name:</strong> {submittedInstitution.short_name}
            </div>
            <div>
              <strong>Status:</strong> {submittedInstitution.status}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong>Brand Palette:</strong>
              {[submittedInstitution.primary_color, submittedInstitution.secondary_color, submittedInstitution.accent_color].map(
                (hex) => (
                  <span
                    key={hex}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid var(--border-color)",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ width: 12, height: 12, borderRadius: 999, background: hex }} />
                    {hex}
                  </span>
                ),
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => navigate("/")} className="btn-fp-olive" style={{ padding: "10px 20px", fontSize: 13.5 }}>
              Back to Institution Directory
            </button>
            <button type="button" onClick={() => navigate("/platform")} className="btn-fp-outline" style={{ padding: "10px 20px", fontSize: 13.5 }}>
              Platform Operator Approval Queue
            </button>
          </div>
        </div>
      </div>
    );
  }

  const headerText = getAccessibleTextColor(secondaryColor);
  const primaryBtnText = getAccessibleTextColor(primaryColor);
  const accentText = getAccessibleTextColor(accentColor);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)", color: "var(--text-main)" }}>
      <header
        style={{
          background: "var(--bg-header)",
          borderBottom: "1px solid var(--border-header)",
          padding: "0 28px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/")}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", fontSize: 14, fontWeight: 600, color: "var(--text-main)" }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
          <span>Back to Directory</span>
        </button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Institution Onboarding & Branding</div>
        <button type="button" onClick={() => navigate("/platform")} className="btn-fp-outline" style={{ padding: "6px 12px", fontSize: 12.5 }}>
          Platform Admin
        </button>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 20px 64px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 6px" }}>Onboard Your University or College</h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Complete your institutional profile, configure your school logo and accessible brand colours, and preview your workspace before submitting for platform approval.
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: "#fdf2f0",
              border: "1px solid #f5d0ca",
              color: "#c93b2b",
              fontSize: 13.5,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <AlertTriangle style={{ width: 17, height: 17, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.95fr)", gap: 28, alignItems: "start" }}
        >
          {/* Left Column: Form Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Section 1: Institution Identity & Web Address */}
            <section className="fp-card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <Building2 style={{ width: 20, height: 20, color: "var(--fp-olive)" }} />
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>1. Institution Details & Web Address</h2>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Official Institution Name *
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Kwame Nkrumah University of Science and Technology"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Short Display Name / Acronym *
                  </label>
                  <input
                    required
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder="e.g. KNUST"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Preferred Institution URL Slug *
                  </label>
                  <input
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                    placeholder="e.g. knust"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                  <div style={{ fontSize: 11.5, marginTop: 5, color: slugStatus ? (slugStatus.available ? "var(--fp-green)" : "#c93b2b") : "var(--text-muted)" }}>
                    {checkingSlug
                      ? "Checking availability..."
                      : slugStatus
                        ? slugStatus.message
                        : `Your URL will be: ${previewOrigin}/${slug || "your-school"}`}
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Allowed Institutional Email Domain(s)
                  </label>
                  <input
                    value={allowedEmailDomains}
                    onChange={(e) => setAllowedEmailDomains(e.target.value)}
                    placeholder="e.g. knust.edu.gh, st.knust.edu.gh"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Academic Year
                  </label>
                  <input
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2025/2026"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Institution Website
                  </label>
                  <input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://www.knust.edu.gh"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Campus Address
                  </label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="City, Country"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Contact & Initial Administrator */}
            <section className="fp-card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <ShieldCheck style={{ width: 20, height: 20, color: "var(--fp-olive)" }} />
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>2. Primary Contact & Initial Administrator</h2>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Contact Representative Name *
                  </label>
                  <input
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Registrar / Dean of Graduate Studies"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Contact Email *
                  </label>
                  <input
                    required
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="registrar@university.edu"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Contact Phone
                  </label>
                  <input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+233 ..."
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Initial Admin Full Name *
                  </label>
                  <input
                    required
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    placeholder="Dr. Jane Mensah"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Initial Admin Sign-In Email *
                  </label>
                  <input
                    required
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@university.edu"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Admin Staff ID (Optional)
                  </label>
                  <input
                    value={adminSchoolId}
                    onChange={(e) => setAdminSchoolId(e.target.value)}
                    placeholder="ADMIN-001"
                    style={{ width: "100%", padding: "10px 12px", fontSize: 13.5 }}
                  />
                </div>
              </div>
            </section>

            {/* Section 3: School Branding, Logo & Colours */}
            <section className="fp-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Palette style={{ width: 20, height: 20, color: "var(--fp-olive)" }} />
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>3. School Branding & Colour Identity</h2>
                </div>
                <button
                  type="button"
                  onClick={resetBrandingToDefault}
                  className="btn-fp-outline"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12 }}
                >
                  <RotateCcw style={{ width: 13, height: 13 }} />
                  <span>Reset to Default</span>
                </button>
              </div>

              {/* Logo Upload */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
                  Institution Logo (PNG, JPEG, WEBP, or SVG — max 2 MB)
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 14px",
                      borderRadius: 8,
                      border: "1px dashed var(--border-color)",
                      background: "var(--bg-main)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <Upload style={{ width: 15, height: 15 }} />
                    <span>{logoFile ? logoFile.name : "Choose Logo Image"}</span>
                    <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoChange} style={{ display: "none" }} />
                  </label>
                  {logoPreview && (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      style={{ height: 42, maxWidth: 140, objectFit: "contain", background: "#fff", padding: 4, borderRadius: 8, border: "1px solid var(--border-color)" }}
                    />
                  )}
                </div>
                {logoError && <div style={{ color: "#c93b2b", fontSize: 12, marginTop: 6 }}>{logoError}</div>}
              </div>

              {/* Preset Palettes */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Quick Institutional Preset Palettes</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 10 }}>
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
                      style={{
                        textAlign: "left",
                        padding: 10,
                        borderRadius: 10,
                        border:
                          primaryColor === preset.primary_color && secondaryColor === preset.secondary_color
                            ? `2px solid ${preset.primary_color}`
                            : "1px solid var(--border-color)",
                        background: "var(--bg-main)",
                      }}
                    >
                      <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                        {[preset.primary_color, preset.secondary_color, preset.accent_color, preset.neutral_color].map((c) => (
                          <span key={c} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid rgba(0,0,0,0.12)" }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-main)" }}>{preset.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Colour Pickers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
                {[
                  { label: "Primary Colour", value: primaryColor, set: setPrimaryColor, hint: "Main buttons & navigation" },
                  { label: "Secondary Colour", value: secondaryColor, set: setSecondaryColor, hint: "Top bar & soft surfaces" },
                  { label: "Accent Colour", value: accentColor, set: setAccentColor, hint: "Highlights & status badges" },
                  { label: "Neutral Surface", value: neutralColor, set: setNeutralColor, hint: "Card & panel background" },
                ].map((c) => (
                  <div key={c.label}>
                    <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}>{c.label}</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="color"
                        value={isValidHex(c.value) ? c.value : "#5A6552"}
                        onChange={(e) => c.set(e.target.value.toUpperCase())}
                        style={{ width: 42, height: 38, padding: 2, cursor: "pointer" }}
                      />
                      <input
                        type="text"
                        value={c.value}
                        onChange={(e) => c.set(e.target.value.toUpperCase())}
                        maxLength={7}
                        style={{ flex: 1, padding: "8px 10px", fontSize: 13, fontFamily: "monospace" }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{c.hint}</div>
                  </div>
                ))}
              </div>

              {/* Default Theme */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Default Theme Preference:</span>
                {(["light", "dark"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDefaultTheme(mode)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: defaultTheme === mode ? "2px solid var(--fp-olive)" : "1px solid var(--border-color)",
                      background: defaultTheme === mode ? "var(--fp-sage)" : "var(--bg-main)",
                      color: "var(--text-main)",
                      fontSize: 12.5,
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {mode} Mode
                  </button>
                ))}
              </div>
            </section>

            <button
              type="submit"
              disabled={submitting}
              className="btn-fp-olive"
              style={{ padding: "14px 24px", fontSize: 15, fontWeight: 700, width: "100%" }}
            >
              {submitting ? "Submitting Onboarding Request..." : "Submit Institution Onboarding Application"}
            </button>
          </div>

          {/* Right Column: Live Branded Workspace Preview + WCAG Contrast Audit */}
          <div style={{ position: "sticky", top: 80, display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="fp-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Live Workspace Preview</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  /{slug || "your-school"}
                </span>
              </div>

              {/* Miniature Branded Header */}
              <div
                style={{
                  background: secondaryColor,
                  color: headerText,
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {logoPreview ? (
                    <img src={logoPreview} alt="Preview" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, background: "#fff", padding: 2 }} />
                  ) : (
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: primaryColor,
                        color: primaryBtnText,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 12,
                      }}
                    >
                      <Globe style={{ width: 16, height: 16 }} />
                    </div>
                  )}
                  <span style={{ fontWeight: 700, fontSize: 14, color: headerText }}>
                    {shortName.trim() || "Your School"} Repository
                  </span>
                </div>
                <span
                  style={{
                    background: primaryColor,
                    color: primaryBtnText,
                    padding: "5px 11px",
                    borderRadius: 6,
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  Log in
                </span>
              </div>

              {/* Miniature Workspace Body */}
              <div style={{ padding: 18, background: defaultTheme === "dark" ? "#111510" : "#ffffff" }}>
                <div
                  style={{
                    background: defaultTheme === "dark" ? "#181e16" : neutralColor,
                    border: "1px solid rgba(128,128,128,0.2)",
                    borderRadius: 10,
                    padding: 16,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <span
                      style={{
                        background: secondaryColor,
                        color: headerText,
                        padding: "2px 9px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {academicYear || "2025/2026"}
                    </span>
                    <span
                      style={{
                        background: accentColor,
                        color: accentText,
                        padding: "2px 9px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      Approved Thesis
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: defaultTheme === "dark" ? "#edf2ea" : "#1a1d1a", marginBottom: 4 }}>
                    {name.trim() || "Your Official University Name"}
                  </div>
                  <p style={{ fontSize: 12, color: defaultTheme === "dark" ? "#9ba896" : "#6e766b", margin: "0 0 12px" }}>
                    Digital archive for graduate theses, dissertations, supervision workflows, and institutional research.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ background: primaryColor, color: primaryBtnText, padding: "7px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700 }}>
                      Submit Proposal
                    </span>
                    <span style={{ background: secondaryColor, color: headerText, padding: "7px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600 }}>
                      Browse Catalog
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* WCAG Contrast Accessibility Report */}
            <div className="fp-card" style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Accessibility Contrast Check</span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: contrast.accessible ? "#dcfce7" : "#fef3c7",
                    color: contrast.accessible ? "#166534" : "#92400e",
                  }}
                >
                  {contrast.accessible ? "WCAG AA Pass" : "Contrast Warning"}
                </span>
              </div>

              <div style={{ display: "grid", gap: 8, fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Primary ({primaryColor}) vs Text</span>
                  <strong style={{ color: contrast.primaryPassesAA ? "var(--fp-green)" : "#c93b2b" }}>
                    {contrast.primaryRatio}:1 {contrast.primaryPassesAA ? "✓" : "⚠"}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Secondary ({secondaryColor}) vs Text</span>
                  <strong style={{ color: contrast.secondaryPassesAA ? "var(--fp-green)" : "#c93b2b" }}>
                    {contrast.secondaryRatio}:1 {contrast.secondaryPassesAA ? "✓" : "⚠"}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Accent ({accentColor}) vs Text</span>
                  <strong style={{ color: contrast.accentPassesAA ? "var(--fp-green)" : "#c93b2b" }}>
                    {contrast.accentRatio}:1 {contrast.accentPassesAA ? "✓" : "⚠"}
                  </strong>
                </div>
              </div>

              {contrast.warnings.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
                  {contrast.warnings.map((w) => (
                    <div key={w}>• {w}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
