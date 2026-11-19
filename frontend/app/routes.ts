import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Central Multi-School SaaS Portal, Onboarding & Platform Operator Console
  index("routes/platform-landing.tsx"),
  route("onboard", "routes/onboard.tsx"),
  route("platform", "routes/platform-admin.tsx"),

  // Legacy root routes (resolve to default pilot tenant e.g. GIMPA)
  route("login", "routes/login.tsx", { id: "root-login" }),
  route("signup", "routes/signup.tsx", { id: "root-signup" }),
  route("editor", "routes/editor.tsx", { id: "root-editor" }),
  route("paper/:id", "routes/paper.$id.tsx", { id: "root-paper" }),
  route("submit-proposal", "routes/submit-proposal.tsx", { id: "root-submit-proposal" }),

  // Dedicated Institution-Specific Branded Workspace Routes (/:tenantSlug/...)
  route(":tenantSlug", "routes/home.tsx", { id: "tenant-home" }),
  route(":tenantSlug/login", "routes/login.tsx", { id: "tenant-login" }),
  route(":tenantSlug/signup", "routes/signup.tsx", { id: "tenant-signup" }),
  route(":tenantSlug/editor", "routes/editor.tsx", { id: "tenant-editor" }),
  route(":tenantSlug/paper/:id", "routes/paper.$id.tsx", { id: "tenant-paper" }),
  route(":tenantSlug/submit-proposal", "routes/submit-proposal.tsx", { id: "tenant-submit-proposal" }),
] satisfies RouteConfig;
