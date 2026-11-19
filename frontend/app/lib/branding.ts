export interface InstitutionBrandingPalette {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  neutral_color: string;
  default_theme?: "light" | "dark" | string;
}

export interface PresetPalette {
  id: string;
  name: string;
  description: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  neutral_color: string;
}

export const DEFAULT_INSTITUTION_BRANDING: InstitutionBrandingPalette = {
  primary_color: "#5A6552",
  secondary_color: "#DCE7D0",
  accent_color: "#3B7A57",
  neutral_color: "#FAFBF8",
  default_theme: "light",
};

export const PRESET_INSTITUTION_PALETTES: PresetPalette[] = [
  {
    id: "sage-academic",
    name: "Academic Sage (Default)",
    description: "Calm olive & sage green classic institutional look",
    primary_color: "#5A6552",
    secondary_color: "#DCE7D0",
    accent_color: "#3B7A57",
    neutral_color: "#FAFBF8",
  },
  {
    id: "royal-navy",
    name: "Royal University Navy",
    description: "Deep collegiate navy with soft sky tint & gold accent",
    primary_color: "#17365D",
    secondary_color: "#D9E4F2",
    accent_color: "#0F6CBD",
    neutral_color: "#F8FAFC",
  },
  {
    id: "crimson-gold",
    name: "Heritage Crimson",
    description: "Prestigious academic burgundy with warm parchment tint",
    primary_color: "#7A1C1C",
    secondary_color: "#F5E2DE",
    accent_color: "#9A6B12",
    neutral_color: "#FBF9F7",
  },
  {
    id: "emerald-forest",
    name: "Forest Scholar",
    description: "Deep emerald green with fresh mint highlights",
    primary_color: "#14532D",
    secondary_color: "#D1FAE5",
    accent_color: "#047857",
    neutral_color: "#F7FCF9",
  },
  {
    id: "indigo-slate",
    name: "Modern Indigo",
    description: "Contemporary research institute indigo & cool mist",
    primary_color: "#312E81",
    secondary_color: "#E0E7FF",
    accent_color: "#4338CA",
    neutral_color: "#F8F9FE",
  },
  {
    id: "teal-ocean",
    name: "Coastal Teal",
    description: "Crisp maritime teal with light aqua surface",
    primary_color: "#115E59",
    secondary_color: "#CCFBF1",
    accent_color: "#0D9488",
    neutral_color: "#F6FCFB",
  },
];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function normalizeHex(raw: string | undefined | null, fallback: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return fallback;
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return HEX_RE.test(withHash) ? withHash.toUpperCase() : fallback;
}

export function isValidHex(raw: string): boolean {
  const trimmed = (raw || "").trim();
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return HEX_RE.test(withHash);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = normalizeHex(hex, "#5A6552").slice(1);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function mixHex(hexA: string, hexB: string, ratioB: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const t = Math.max(0, Math.min(1, ratioB));
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

function channelLum(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

export function getAccessibleTextColor(bgHex: string): "#FFFFFF" | "#1A1D1A" {
  const whiteRatio = contrastRatio(bgHex, "#FFFFFF");
  const darkRatio = contrastRatio(bgHex, "#1A1D1A");
  return whiteRatio >= darkRatio ? "#FFFFFF" : "#1A1D1A";
}

export interface ClientContrastReport {
  primaryText: string;
  primaryRatio: number;
  primaryPassesAA: boolean;
  secondaryText: string;
  secondaryRatio: number;
  secondaryPassesAA: boolean;
  accentText: string;
  accentRatio: number;
  accentPassesAA: boolean;
  warnings: string[];
  accessible: boolean;
}

export function evaluatePaletteContrast(palette: InstitutionBrandingPalette): ClientContrastReport {
  const primary = normalizeHex(palette.primary_color, DEFAULT_INSTITUTION_BRANDING.primary_color);
  const secondary = normalizeHex(palette.secondary_color, DEFAULT_INSTITUTION_BRANDING.secondary_color);
  const accent = normalizeHex(palette.accent_color, DEFAULT_INSTITUTION_BRANDING.accent_color);

  const primaryText = getAccessibleTextColor(primary);
  const secondaryText = getAccessibleTextColor(secondary);
  const accentText = getAccessibleTextColor(accent);

  const primaryRatio = contrastRatio(primary, primaryText);
  const secondaryRatio = contrastRatio(secondary, secondaryText);
  const accentRatio = contrastRatio(accent, accentText);

  const warnings: string[] = [];
  if (primaryRatio < 4.5) {
    warnings.push(`Primary colour (${primary}) has contrast ${primaryRatio}:1 — choose a deeper or lighter tone for WCAG AA (4.5:1).`);
  }
  if (secondaryRatio < 4.5) {
    warnings.push(`Secondary colour (${secondary}) has contrast ${secondaryRatio}:1 — adjust tint for readable text (4.5:1).`);
  }
  if (accentRatio < 4.5) {
    warnings.push(`Accent colour (${accent}) has contrast ${accentRatio}:1 — adjust tone for WCAG AA (4.5:1).`);
  }

  return {
    primaryText,
    primaryRatio,
    primaryPassesAA: primaryRatio >= 4.5,
    secondaryText,
    secondaryRatio,
    secondaryPassesAA: secondaryRatio >= 4.5,
    accentText,
    accentRatio,
    accentPassesAA: accentRatio >= 4.5,
    warnings,
    accessible: warnings.length === 0,
  };
}

/**
 * Dynamically inject an institution's branding colours into CSS custom properties on :root.
 * Supports both light and dark modes while preserving readable contrast.
 */
export function applyInstitutionBrandingCss(
  palette: InstitutionBrandingPalette | null,
  themeMode: "light" | "dark",
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const p = palette || DEFAULT_INSTITUTION_BRANDING;
  const primary = normalizeHex(p.primary_color, DEFAULT_INSTITUTION_BRANDING.primary_color);
  const secondary = normalizeHex(p.secondary_color, DEFAULT_INSTITUTION_BRANDING.secondary_color);
  const accent = normalizeHex(p.accent_color, DEFAULT_INSTITUTION_BRANDING.accent_color);
  const neutral = normalizeHex(p.neutral_color, DEFAULT_INSTITUTION_BRANDING.neutral_color);

  if (themeMode === "dark") {
    const darkBg = mixHex("#111413", primary, 0.12);
    const darkHeader = mixHex("#171c19", primary, 0.24);
    const darkBorder = mixHex("#262d29", primary, 0.28);
    const darkSage = mixHex("#1f2824", primary, 0.34);
    const darkSageHover = mixHex("#293630", primary, 0.42);
    const darkPrimary = mixHex(primary, "#FFFFFF", 0.14);
    const darkPrimaryHover = mixHex(primary, "#FFFFFF", 0.24);
    const darkAccent = mixHex(accent, "#FFFFFF", 0.28);

    root.style.setProperty("--bg-header", darkHeader);
    root.style.setProperty("--border-header", darkBorder);
    root.style.setProperty("--fp-sage", darkSage);
    root.style.setProperty("--fp-sage-hover", darkSageHover);
    root.style.setProperty("--fp-sage-text", getAccessibleTextColor(darkSage));
    root.style.setProperty("--fp-olive", darkPrimary);
    root.style.setProperty("--fp-olive-dark", darkPrimaryHover);
    root.style.setProperty("--fp-olive-text", getAccessibleTextColor(darkPrimary));
    root.style.setProperty("--fp-green", darkAccent);
    root.style.setProperty("--bg-card", mixHex(darkBg, "#FFFFFF", 0.04));
    root.style.setProperty("--color-primary", darkPrimary);
    root.style.setProperty("--color-secondary", darkSage);
    root.style.setProperty("--color-accent", darkAccent);
    root.style.setProperty("--color-ring", darkPrimary);
  } else {
    const headerBg = secondary;
    const headerBorder = mixHex(secondary, "#000000", 0.1);
    const sageHover = mixHex(secondary, "#000000", 0.07);
    const primaryHover = mixHex(primary, "#000000", 0.16);
    const headerText = getAccessibleTextColor(headerBg);

    root.style.setProperty("--bg-header", headerBg);
    root.style.setProperty("--border-header", headerBorder);
    root.style.setProperty("--header-text", headerText);
    root.style.setProperty("--fp-sage", secondary);
    root.style.setProperty("--fp-sage-hover", sageHover);
    root.style.setProperty("--fp-sage-text", getAccessibleTextColor(secondary));
    root.style.setProperty("--fp-olive", primary);
    root.style.setProperty("--fp-olive-dark", primaryHover);
    root.style.setProperty("--fp-olive-text", getAccessibleTextColor(primary));
    root.style.setProperty("--fp-green", accent);
    root.style.setProperty("--bg-card", neutral);
    root.style.setProperty("--color-primary", primary);
    root.style.setProperty("--color-secondary", secondary);
    root.style.setProperty("--color-accent", accent);
    root.style.setProperty("--color-ring", primary);
  }
}
