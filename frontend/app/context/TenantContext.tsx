import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import {
  apiResolveInstitution,
  setActiveTenantSlug,
  type ApiInstitutionPublic,
} from "../lib/api";
import {
  applyInstitutionBrandingCss,
  DEFAULT_INSTITUTION_BRANDING,
} from "../lib/branding";

const PLATFORM_RESERVED_PREFIXES = new Set([
  "",
  "onboard",
  "platform",
  "login",
  "signup",
  "editor",
  "paper",
  "submit-proposal",
  "api",
]);

export function extractTenantSlugFromPath(pathname: string): string | null {
  const segments = (pathname || "/").split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0].toLowerCase();
  if (PLATFORM_RESERVED_PREFIXES.has(first)) return null;
  return first;
}

interface TenantContextValue {
  tenant: ApiInstitutionPublic | null;
  tenantSlug: string | null;
  loading: boolean;
  error: string | null;
  isPlatformRoute: boolean;
  theme: "light" | "dark";
  setTheme: (mode: "light" | "dark") => void;
  toggleTheme: () => void;
  tenantPath: (subpath?: string) => string;
  refreshTenant: (overrideSlug?: string) => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

const DEFAULT_FALLBACK_TENANT: ApiInstitutionPublic = {
  id: 0,
  name: "Multi-School Thesis Repository",
  short_name: "ThesisCloud",
  slug: "gimpa",
  status: "approved",
  is_active: true,
  allow_public_catalog: true,
  primary_color: DEFAULT_INSTITUTION_BRANDING.primary_color,
  secondary_color: DEFAULT_INSTITUTION_BRANDING.secondary_color,
  accent_color: DEFAULT_INSTITUTION_BRANDING.accent_color,
  neutral_color: DEFAULT_INSTITUTION_BRANDING.neutral_color,
  default_theme: "light",
};

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const pathSlug = useMemo(() => extractTenantSlugFromPath(location.pathname), [location.pathname]);
  const isPlatformRoute = useMemo(() => {
    const p = location.pathname || "/";
    return p === "/" || p.startsWith("/onboard") || p.startsWith("/platform");
  }, [location.pathname]);

  const [tenant, setTenant] = useState<ApiInstitutionPublic | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("thesiscloud_theme") || localStorage.getItem("gimpa_theme");
      if (saved === "dark" || saved === "light") return saved;
    }
    return "light";
  });

  const setTheme = useCallback((mode: "light" | "dark") => {
    setThemeState(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("thesiscloud_theme", mode);
      localStorage.setItem("gimpa_theme", mode);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  const refreshTenant = useCallback(
    async (overrideSlug?: string) => {
      const targetSlug = (overrideSlug ?? pathSlug ?? "").trim().toLowerCase() || null;

      if (isPlatformRoute && !targetSlug) {
        setActiveTenantSlug(null);
        setTenant(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // If no slug in URL on legacy routes (/login, /paper/1), resolve default tenant (gimpa or domain)
        const resolved = await apiResolveInstitution(targetSlug || undefined);
        setTenant(resolved);
        setActiveTenantSlug(resolved.slug);
        if (typeof window !== "undefined") {
          const userSavedTheme = localStorage.getItem("thesiscloud_theme");
          if (!userSavedTheme && (resolved.default_theme === "dark" || resolved.default_theme === "light")) {
            setThemeState(resolved.default_theme);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Institution workspace could not be loaded.";
        setError(msg);
        if (targetSlug) {
          setTenant(null);
          setActiveTenantSlug(targetSlug);
        } else {
          setTenant(DEFAULT_FALLBACK_TENANT);
          setActiveTenantSlug("gimpa");
        }
      } finally {
        setLoading(false);
      }
    },
    [pathSlug, isPlatformRoute],
  );

  useEffect(() => {
    void refreshTenant();
  }, [refreshTenant]);

  // Apply dynamic institution CSS variables whenever tenant or light/dark mode changes
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    applyInstitutionBrandingCss(tenant, theme);
    if (tenant && !isPlatformRoute) {
      document.title = `${tenant.short_name || tenant.name} Thesis Repository`;
    } else if (location.pathname === "/") {
      document.title = "Multi-School Thesis Repository Cloud";
    }
  }, [tenant, theme, isPlatformRoute, location.pathname]);

  const tenantSlug = pathSlug || tenant?.slug || null;

  const tenantPath = useCallback(
    (subpath = "") => {
      const cleanSub = subpath.startsWith("/") ? subpath : subpath ? `/${subpath}` : "";
      if (pathSlug) {
        return `/${pathSlug}${cleanSub}`;
      }
      if (tenant?.slug && !isPlatformRoute) {
        return `/${tenant.slug}${cleanSub}`;
      }
      return cleanSub || "/";
    },
    [pathSlug, tenant?.slug, isPlatformRoute],
  );

  return (
    <TenantContext.Provider
      value={{
        tenant,
        tenantSlug,
        loading,
        error,
        isPlatformRoute,
        theme,
        setTheme,
        toggleTheme,
        tenantPath,
        refreshTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used inside TenantProvider");
  }
  return ctx;
}
