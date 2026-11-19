import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe,
  Moon,
  Palette,
  PlusCircle,
  Search,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { apiListPublicInstitutions, type ApiInstitutionPublic } from "../lib/api";
import { useTenant } from "../context/TenantContext";
import { getAccessibleTextColor } from "../lib/branding";

export function meta() {
  return [
    { title: "Multi-School Thesis Repository Cloud" },
    {
      name: "description",
      content: "Shared multi-tenant cloud thesis repository with dedicated branded workspaces for every university and college.",
    },
  ];
}

export default function PlatformLandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTenant();
  const [institutions, setInstitutions] = useState<ApiInstitutionPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const list = await apiListPublicInstitutions();
        if (!cancelled) setInstitutions(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load institutions directory");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return institutions;
    return institutions.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.short_name.toLowerCase().includes(q) ||
        i.slug.toLowerCase().includes(q),
    );
  }, [institutions, search]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)", color: "var(--text-main)" }}>
      {/* Top Bar */}
      <header
        style={{
          background: "var(--bg-header)",
          borderBottom: "1px solid var(--border-header)",
          padding: "0 32px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--fp-olive)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Globe style={{ width: 19, height: 19 }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.15 }}>ThesisCloud</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Multi-School Thesis Repository SaaS</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-main)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {theme === "dark" ? <Sun style={{ width: 14, height: 14 }} /> : <Moon style={{ width: 14, height: 14 }} />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/platform")}
            className="btn-fp-outline"
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            Platform Admin
          </button>

          <button
            type="button"
            onClick={() => navigate("/onboard")}
            className="btn-fp-olive"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 13 }}
          >
            <PlusCircle style={{ width: 15, height: 15 }} />
            <span>Register Institution</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "56px 24px 36px" }}>
        <div
          className="fp-card"
          style={{
            padding: "42px 40px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: 32,
            alignItems: "center",
          }}
        >
          <div>
            <span className="fp-tag-sage" style={{ display: "inline-block", marginBottom: 14 }}>
              Multi-Tenant Academic Cloud Platform
            </span>
            <h1 style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15, margin: "0 0 14px", letterSpacing: "-0.02em" }}>
              One Shared Cloud Platform. A Branded Thesis Space for Every School.
            </h1>
            <p style={{ fontSize: 15, color: "var(--text-muted)", lineHeight: 1.65, margin: "0 0 24px" }}>
              Onboard your university or college with its own unique web address, institutional logo, accessible colour
              palette, and strictly isolated workspace for proposals, supervision, examination, and public thesis publishing.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button
                type="button"
                onClick={() => navigate("/onboard")}
                className="btn-fp-olive"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", fontSize: 14 }}
              >
                <PlusCircle style={{ width: 17, height: 17 }} />
                <span>Onboard Your Institution</span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/gimpa")}
                className="btn-fp-sage"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", fontSize: 14 }}
              >
                <span>Open GIMPA Pilot Workspace</span>
                <ArrowRight style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, padding: 16, borderRadius: 12, background: "var(--bg-main)", border: "1px solid var(--border-color)" }}>
              <ShieldCheck style={{ width: 22, height: 22, color: "var(--fp-olive)", flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Strict Multi-Tenant Isolation</div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  Server-enforced tenant scoping across users, departments, theses, files, and OnlyOffice callbacks.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, padding: 16, borderRadius: 12, background: "var(--bg-main)", border: "1px solid var(--border-color)" }}>
              <Palette style={{ width: 22, height: 22, color: "var(--fp-olive)", flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Institution Logo & Colour Branding</div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  Custom primary, secondary, accent, and neutral colours with live preview and WCAG contrast checks.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, padding: 16, borderRadius: 12, background: "var(--bg-main)", border: "1px solid var(--border-color)" }}>
              <CheckCircle2 style={{ width: 22, height: 22, color: "var(--fp-olive)", flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Dedicated Institution Links</div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                  Each approved institution gets its own URL path (<code>/your-school</code>) plus optional custom domain routing.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Approved Institutions Directory */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "12px 24px 72px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 22,
          }}
        >
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Active Institution Workspaces</h2>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Select your university or college to enter its branded thesis repository and sign-in portal.
            </p>
          </div>
          <div style={{ position: "relative", minWidth: 260 }}>
            <Search
              style={{
                width: 15,
                height: 15,
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search institutions..."
              style={{ width: "100%", padding: "9px 14px 9px 36px", fontSize: 13.5 }}
            />
          </div>
        </div>

        {error && (
          <div className="fp-card" style={{ borderColor: "#c93b2b", color: "#c93b2b", marginBottom: 18 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="fp-card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
            Loading active institutions...
          </div>
        ) : filtered.length === 0 ? (
          <div className="fp-card" style={{ textAlign: "center", padding: 48 }}>
            <Building2 style={{ width: 32, height: 32, margin: "0 auto 10px", color: "var(--text-muted)" }} />
            <div style={{ fontWeight: 700, fontSize: 16 }}>No matching institutions found</div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
              Want to bring your school onto the platform? Submit an onboarding application.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 20 }}>
            {filtered.map((inst) => {
              const primaryText = getAccessibleTextColor(inst.primary_color || "#5A6552");
              return (
                <div
                  key={inst.id}
                  className="fp-card"
                  style={{
                    padding: 0,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  {/* Branded Banner Strip */}
                  <div
                    style={{
                      background: inst.secondary_color || "#DCE7D0",
                      padding: "18px 20px",
                      borderBottom: "1px solid var(--border-color)",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    {inst.logo_url ? (
                      <img
                        src={inst.logo_url}
                        alt={inst.short_name}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          objectFit: "contain",
                          background: "#ffffff",
                          padding: 4,
                          border: "1px solid rgba(0,0,0,0.08)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          background: inst.primary_color || "#5A6552",
                          color: primaryText,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: 15,
                          flexShrink: 0,
                        }}
                      >
                        {(inst.short_name || inst.name).slice(0, 3).toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 16,
                          color: getAccessibleTextColor(inst.secondary_color || "#DCE7D0"),
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {inst.short_name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: getAccessibleTextColor(inst.secondary_color || "#DCE7D0"),
                          opacity: 0.8,
                        }}
                      >
                        /{inst.slug}
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: "18px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4 }}>{inst.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        title={`Primary ${inst.primary_color}`}
                        style={{ width: 18, height: 18, borderRadius: 999, background: inst.primary_color, border: "1px solid rgba(0,0,0,0.12)" }}
                      />
                      <span
                        title={`Secondary ${inst.secondary_color}`}
                        style={{ width: 18, height: 18, borderRadius: 999, background: inst.secondary_color, border: "1px solid rgba(0,0,0,0.12)" }}
                      />
                      <span
                        title={`Accent ${inst.accent_color}`}
                        style={{ width: 18, height: 18, borderRadius: 999, background: inst.accent_color, border: "1px solid rgba(0,0,0,0.12)" }}
                      />
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: 4 }}>
                        {inst.academic_year || "2025/2026"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 6 }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/${inst.slug}`)}
                        style={{
                          flex: 1,
                          padding: "9px 14px",
                          borderRadius: 8,
                          border: "none",
                          background: inst.primary_color || "#5A6552",
                          color: primaryText,
                          fontSize: 13,
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        <span>Open Repository</span>
                        <ArrowRight style={{ width: 14, height: 14 }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/${inst.slug}/login`)}
                        className="btn-fp-outline"
                        style={{ padding: "9px 14px", fontSize: 13 }}
                      >
                        Sign in
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
