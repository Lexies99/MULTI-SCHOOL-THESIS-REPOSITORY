from __future__ import annotations

import io
import os
import tempfile
import unittest
from pathlib import Path

# Configure isolated SQLite test DB & storage BEFORE importing app
_TMP_DIR = tempfile.TemporaryDirectory(prefix="multi_school_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMP_DIR.name) / 'test_multi_tenant.db'}"
os.environ["SECRET_KEY"] = "test-secret-key-for-multi-tenant-verification-2026"
os.environ["LOCAL_STORAGE_DIR"] = str(Path(_TMP_DIR.name) / "uploads")
os.environ["PLATFORM_ADMIN_EMAIL"] = "operator@thesiscloud.org"
os.environ["PLATFORM_ADMIN_PASSWORD"] = "PlatformAdmin#2026!"
os.environ["SMTP_ENABLED"] = "false"

from fastapi.testclient import TestClient

from app.main import app


VALID_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb0"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


class MultiTenantSaaSSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        from app.db.session import engine

        engine.dispose()
        try:
            _TMP_DIR.cleanup()
        except Exception:
            pass

    def _login(self, email: str, password: str, tenant_slug: str | None = None) -> tuple[int, dict]:
        headers = {"X-Tenant-Slug": tenant_slug} if tenant_slug else {}
        resp = self.client.post(
            "/api/auth/login",
            data={"username": email, "password": password},
            headers=headers,
        )
        return resp.status_code, resp.json()

    def _auth_headers(self, token: str, tenant_slug: str | None = None) -> dict[str, str]:
        h = {"Authorization": f"Bearer {token}"}
        if tenant_slug:
            h["X-Tenant-Slug"] = tenant_slug
        return h

    def test_full_multi_tenant_onboarding_branding_and_isolation(self) -> None:
        # 1. Health & default GIMPA tenant resolution
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()["multi_tenant"])

        gimpa = self.client.get("/api/institutions/resolve?slug=gimpa")
        self.assertEqual(gimpa.status_code, 200)
        self.assertEqual(gimpa.json()["slug"], "gimpa")
        self.assertEqual(gimpa.json()["short_name"], "GIMPA")

        # 2. Slug validation & reserved slugs rejected
        reserved = self.client.get("/api/institutions/check-slug/platform")
        self.assertEqual(reserved.status_code, 200)
        self.assertFalse(reserved.json()["available"])

        taken = self.client.get("/api/institutions/check-slug/gimpa")
        self.assertEqual(taken.status_code, 200)
        self.assertFalse(taken.json()["available"])

        avail = self.client.get("/api/institutions/check-slug/knust-gh")
        self.assertEqual(avail.status_code, 200)
        self.assertTrue(avail.json()["available"])

        # 3. Onboard TWO new institutions (School A: KNUST, School B: UG) with logos & custom colours
        onboard_a = self.client.post(
            "/api/institutions/onboard-with-logo",
            data={
                "name": "Kwame Nkrumah University of Science and Technology",
                "short_name": "KNUST",
                "slug": "knust-gh",
                "contact_name": "Registrar KNUST",
                "contact_email": "registrar@knust.edu.gh",
                "admin_full_name": "Dr. Kwame Mensah",
                "admin_email": "admin@knust.edu.gh",
                "allowed_email_domains": "knust.edu.gh",
                "primary_color": "#7A1C1C",
                "secondary_color": "#F7E6B5",
                "accent_color": "#B8860B",
                "neutral_color": "#FAF8F5",
                "default_theme": "light",
            },
            files={"logo": ("knust.png", io.BytesIO(VALID_PNG_BYTES), "image/png")},
        )
        self.assertEqual(onboard_a.status_code, 201, onboard_a.text)
        school_a = onboard_a.json()
        self.assertEqual(school_a["status"], "pending")
        self.assertEqual(school_a["primary_color"], "#7A1C1C")
        self.assertTrue(school_a["logo_url"].endswith("/institutions/knust-gh/logo"))

        # Pending institution must NOT resolve publicly before approval
        pending_res = self.client.get("/api/institutions/resolve?slug=knust-gh")
        self.assertEqual(pending_res.status_code, 403)

        # Invalid logo upload (fake executable bytes) must be rejected
        bad_logo = self.client.post(
            "/api/institutions/onboard-with-logo",
            data={
                "name": "Bad Logo University",
                "short_name": "BLU",
                "slug": "bad-logo-uni",
                "contact_name": "Contact",
                "contact_email": "contact@blu.edu",
                "admin_full_name": "Admin",
                "admin_email": "admin@blu.edu",
            },
            files={"logo": ("evil.png", io.BytesIO(b"not a real png"), "image/png")},
        )
        self.assertEqual(bad_logo.status_code, 400)

        onboard_b = self.client.post(
            "/api/institutions/onboard",
            json={
                "name": "University of Ghana",
                "short_name": "UG",
                "slug": "ug-legon",
                "custom_domain": "ug.thesis.example.com",
                "contact_name": "UG Dean of Graduate Studies",
                "contact_email": "grad@ug.edu.gh",
                "admin_full_name": "Prof. Ama Boateng",
                "admin_email": "admin@ug.edu.gh",
                "allowed_email_domains": "ug.edu.gh",
                "primary_color": "#17365D",
                "secondary_color": "#D9E4F2",
                "accent_color": "#C99700",
                "neutral_color": "#F8FAFC",
                "default_theme": "light",
            },
        )
        self.assertEqual(onboard_b.status_code, 201, onboard_b.text)
        school_b = onboard_b.json()

        # 4. Platform Operator logs in and approves both institutions
        code, op_login = self._login("operator@thesiscloud.org", "PlatformAdmin#2026!")
        self.assertEqual(code, 200, op_login)
        op_token = op_login["access_token"]

        overview = self.client.get("/api/platform/overview", headers=self._auth_headers(op_token))
        self.assertEqual(overview.status_code, 200)
        self.assertGreaterEqual(overview.json()["pending_institutions"], 2)

        approve_a = self.client.post(
            f"/api/platform/institutions/{school_a['id']}/approve",
            json={"approval_notes": "Verified KNUST domain", "initial_departments": ["Computer Engineering"]},
            headers=self._auth_headers(op_token),
        )
        self.assertEqual(approve_a.status_code, 200, approve_a.text)
        a_temp_pass = approve_a.json()["temporary_password"]
        self.assertTrue(a_temp_pass)
        self.assertIn("/knust-gh", approve_a.json()["workspace_url"])

        approve_b = self.client.post(
            f"/api/platform/institutions/{school_b['id']}/approve",
            json={"approval_notes": "Verified UG domain", "initial_departments": ["Political Science"]},
            headers=self._auth_headers(op_token),
        )
        self.assertEqual(approve_b.status_code, 200, approve_b.text)
        b_temp_pass = approve_b.json()["temporary_password"]
        self.assertTrue(b_temp_pass)

        # 5. Approved institutions resolve via slug AND custom domain with isolated branding
        res_a = self.client.get("/api/institutions/resolve?slug=knust-gh")
        self.assertEqual(res_a.status_code, 200)
        self.assertEqual(res_a.json()["primary_color"], "#7A1C1C")

        res_b = self.client.get("/api/institutions/resolve", headers={"Host": "ug.thesis.example.com"})
        self.assertEqual(res_b.status_code, 200)
        self.assertEqual(res_b.json()["slug"], "ug-legon")
        self.assertEqual(res_b.json()["primary_color"], "#17365D")

        logo_a = self.client.get("/api/institutions/knust-gh/logo")
        self.assertEqual(logo_a.status_code, 200)
        self.assertEqual(logo_a.headers["content-type"], "image/png")

        # 6. School A admin signs in, changes initial password, configures branding & creates student + paper
        code, a_login = self._login("admin@knust.edu.gh", a_temp_pass, tenant_slug="knust-gh")
        self.assertEqual(code, 200, a_login)
        a_token = a_login["access_token"]
        self.assertTrue(a_login["must_change_password"])

        # Cross-tenant login attempt: School A admin trying to sign in on School B's URL must fail with 403
        bad_code, _ = self._login("admin@knust.edu.gh", a_temp_pass, tenant_slug="ug-legon")
        self.assertEqual(bad_code, 403)

        # Change password for School A admin & School B admin
        ch_a = self.client.post(
            "/api/users/change-password",
            json={"current_password": a_temp_pass, "new_password": "KnustAdmin#2026"},
            headers=self._auth_headers(a_token, "knust-gh"),
        )
        self.assertEqual(ch_a.status_code, 200, ch_a.text)

        code, b_login = self._login("admin@ug.edu.gh", b_temp_pass, tenant_slug="ug-legon")
        self.assertEqual(code, 200, b_login)
        b_token = b_login["access_token"]
        ch_b = self.client.post(
            "/api/users/change-password",
            json={"current_password": b_temp_pass, "new_password": "UgAdmin#2026"},
            headers=self._auth_headers(b_token, "ug-legon"),
        )
        self.assertEqual(ch_b.status_code, 200, ch_b.text)

        # Branding update for School A must NOT alter School B
        upd_a = self.client.patch(
            "/api/institutions/current/branding",
            json={"primary_color": "#6B0F1A", "accent_color": "#C59B27"},
            headers=self._auth_headers(a_token, "knust-gh"),
        )
        self.assertEqual(upd_a.status_code, 200, upd_a.text)
        self.assertEqual(upd_a.json()["primary_color"], "#6B0F1A")

        still_b = self.client.get("/api/institutions/resolve?slug=ug-legon")
        self.assertEqual(still_b.json()["primary_color"], "#17365D")

        # Non-platform admin cannot access platform admin endpoints
        forbid_plat = self.client.get("/api/platform/institutions", headers=self._auth_headers(a_token, "knust-gh"))
        self.assertEqual(forbid_plat.status_code, 403)

        # 7. Create users and papers in School A and School B
        create_stu_a = self.client.post(
            "/api/admin/users",
            json={
                "email": "student1@knust.edu.gh",
                "role": "student",
                "full_name": "Kofi Student KNUST",
                "school_id": "KNUST-001",
                "school": "College of Engineering",
                "department": "Computer Engineering",
            },
            headers=self._auth_headers(a_token, "knust-gh"),
        )
        self.assertEqual(create_stu_a.status_code, 201, create_stu_a.text)
        stu_a_id = create_stu_a.json()["user"]["id"]
        stu_a_pass = create_stu_a.json()["temporary_password"]

        # Domain mismatch check: School A admin cannot create a @ug.edu.gh account
        wrong_domain = self.client.post(
            "/api/admin/users",
            json={
                "email": "intruder@ug.edu.gh",
                "role": "student",
                "full_name": "Wrong Domain",
                "school_id": "KNUST-999",
                "school": "College of Engineering",
                "department": "Computer Engineering",
            },
            headers=self._auth_headers(a_token, "knust-gh"),
        )
        self.assertEqual(wrong_domain.status_code, 400)

        create_stu_b = self.client.post(
            "/api/admin/users",
            json={
                "email": "student1@ug.edu.gh",
                "role": "student",
                "full_name": "Abena Student UG",
                "school_id": "UG-001",
                "school": "College of Humanities",
                "department": "Political Science",
            },
            headers=self._auth_headers(b_token, "ug-legon"),
        )
        self.assertEqual(create_stu_b.status_code, 201, create_stu_b.text)
        stu_b_id = create_stu_b.json()["user"]["id"]

        # Student A changes password & uploads a thesis paper
        _, stu_a_login = self._login("student1@knust.edu.gh", stu_a_pass, tenant_slug="knust-gh")
        stu_a_token = stu_a_login["access_token"]
        self.client.post(
            "/api/users/change-password",
            json={"current_password": stu_a_pass, "new_password": "StudentA#2026"},
            headers=self._auth_headers(stu_a_token, "knust-gh"),
        )
        upload_a = self.client.post(
            "/api/papers/upload",
            data={
                "title": "KNUST Smart Grid Resilience Analysis",
                "abstract": " ".join(["research"] * 160),
                "discipline": "Computer Engineering",
                "university": "KNUST",
                "year": "2026",
            },
            files={"file": ("knust_thesis.pdf", io.BytesIO(b"%PDF-1.4 KNUST SECRET CONTENT"), "application/pdf")},
            headers=self._auth_headers(stu_a_token, "knust-gh"),
        )
        self.assertEqual(upload_a.status_code, 201, upload_a.text)
        paper_a_id = upload_a.json()["id"]

        # 8. CRITICAL CROSS-TENANT ISOLATION TESTS
        # A) School B admin spoofing X-Tenant-Slug: knust-gh MUST BE REJECTED (403)
        spoof_resp = self.client.get("/api/users", headers=self._auth_headers(b_token, "knust-gh"))
        self.assertEqual(spoof_resp.status_code, 403)

        # B) School B admin listing users sees ONLY UG users (never KNUST users)
        b_users = self.client.get("/api/users", headers=self._auth_headers(b_token, "ug-legon"))
        self.assertEqual(b_users.status_code, 200)
        b_user_emails = {u["email"] for u in b_users.json()}
        self.assertIn("student1@ug.edu.gh", b_user_emails)
        self.assertNotIn("student1@knust.edu.gh", b_user_emails)
        self.assertNotIn("admin@knust.edu.gh", b_user_emails)

        # C) School B admin trying to directly read, update, or delete School A's student by ID -> 404
        cross_read_u = self.client.get(f"/api/users/{stu_a_id}", headers=self._auth_headers(b_token, "ug-legon"))
        self.assertEqual(cross_read_u.status_code, 404)

        cross_del_u = self.client.delete(f"/api/users/{stu_a_id}", headers=self._auth_headers(b_token, "ug-legon"))
        self.assertEqual(cross_del_u.status_code, 404)

        # D) School B admin trying to read or download School A's paper by ID -> 404
        cross_paper = self.client.get(f"/api/papers/{paper_a_id}", headers=self._auth_headers(b_token, "ug-legon"))
        self.assertEqual(cross_paper.status_code, 404)

        cross_binary = self.client.get(f"/api/papers/{paper_a_id}/binary", headers=self._auth_headers(b_token, "ug-legon"))
        self.assertEqual(cross_binary.status_code, 404)

        # E) Public catalog on ug-legon MUST NOT expose knust-gh papers
        ug_papers = self.client.get("/api/papers", headers={"X-Tenant-Slug": "ug-legon"})
        self.assertEqual(ug_papers.status_code, 200)
        self.assertNotIn(paper_a_id, [p["id"] for p in ug_papers.json()])

        # F) School A admin CAN read & download School A's own paper
        own_paper = self.client.get(f"/api/papers/{paper_a_id}", headers=self._auth_headers(a_token, "knust-gh"))
        self.assertEqual(own_paper.status_code, 200)
        own_bin = self.client.get(f"/api/papers/{paper_a_id}/binary", headers=self._auth_headers(a_token, "knust-gh"))
        self.assertEqual(own_bin.status_code, 200)
        self.assertIn(b"KNUST SECRET CONTENT", own_bin.content)

        # G) Departments are strictly isolated per tenant
        depts_a = self.client.get("/api/departments", headers={"X-Tenant-Slug": "knust-gh"}).json()
        depts_b = self.client.get("/api/departments", headers={"X-Tenant-Slug": "ug-legon"}).json()
        self.assertIn("Computer Engineering", [d["name"] for d in depts_a])
        self.assertNotIn("Political Science", [d["name"] for d in depts_a])
        self.assertIn("Political Science", [d["name"] for d in depts_b])
        self.assertNotIn("Computer Engineering", [d["name"] for d in depts_b])

        # H) Audit logs & Data Export contain only tenant's own data
        exp_a = self.client.get("/api/institutions/current/export", headers=self._auth_headers(a_token, "knust-gh"))
        self.assertEqual(exp_a.status_code, 200)
        exp_data = exp_a.json()
        self.assertEqual(exp_data["institution"]["slug"], "knust-gh")
        self.assertNotIn("student1@ug.edu.gh", [u["email"] for u in exp_data["users"]])

        audit_a = self.client.get("/api/institutions/current/audit-logs", headers=self._auth_headers(a_token, "knust-gh"))
        self.assertEqual(audit_a.status_code, 200)
        actions = [entry["action"] for entry in audit_a.json()]
        self.assertIn("institution_approved", actions)
        self.assertIn("institution_branding_updated", actions)
        self.assertIn("institution_data_exported", actions)

        # I) Suspending School A immediately blocks School A's users from API & login
        susp = self.client.patch(
            f"/api/platform/institutions/{school_a['id']}/status",
            json={"status": "suspended", "is_active": False},
            headers=self._auth_headers(op_token),
        )
        self.assertEqual(susp.status_code, 200)
        blocked_me = self.client.get("/api/me", headers=self._auth_headers(a_token, "knust-gh"))
        self.assertEqual(blocked_me.status_code, 403)

        # J) Reactivate School A and test student single-active-submission enforcement & next-degree unlock
        react = self.client.patch(
            f"/api/platform/institutions/{school_a['id']}/status",
            json={"status": "approved", "is_active": True},
            headers=self._auth_headers(op_token),
        )
        self.assertEqual(react.status_code, 200)

        # Student A currently has 1 active submission (paper_a_id) -> eligibility must be False and second upload rejected (409)
        elig_locked = self.client.get(
            "/api/papers/submission-eligibility",
            headers=self._auth_headers(stu_a_token, "knust-gh"),
        )
        self.assertEqual(elig_locked.status_code, 200)
        self.assertFalse(elig_locked.json()["can_submit_new"])
        self.assertEqual(elig_locked.json()["active_submission"]["id"], paper_a_id)

        second_blocked = self.client.post(
            "/api/papers/upload",
            data={
                "title": "Second Concurrent Thesis Attempt",
                "abstract": " ".join(["study"] * 160),
                "discipline": "Computer Engineering",
                "university": "KNUST",
                "year": "2026",
            },
            files={"file": ("second.pdf", io.BytesIO(b"%PDF-1.4 SECOND"), "application/pdf")},
            headers=self._auth_headers(stu_a_token, "knust-gh"),
        )
        self.assertEqual(second_blocked.status_code, 409)

        # Mark Thesis #1 completed (phase5_published) -> Student A is now unlocked to start their Master's thesis!
        from app.core.tenant import tenant_bypass
        from app.db.session import SessionLocal
        from app.models.paper import Paper

        with tenant_bypass():
            db = SessionLocal()
            try:
                p = db.query(Paper).filter(Paper.id == paper_a_id).first()
                p.status = "phase5_published"
                db.add(p)
                db.commit()
            finally:
                db.close()

        elig_unlocked = self.client.get(
            "/api/papers/submission-eligibility",
            headers=self._auth_headers(stu_a_token, "knust-gh"),
        )
        self.assertEqual(elig_unlocked.status_code, 200)
        self.assertTrue(elig_unlocked.json()["can_submit_new"])
        self.assertEqual(elig_unlocked.json()["completed_count"], 1)

        masters_upload = self.client.post(
            "/api/papers/upload",
            data={
                "title": "KNUST Masters Distributed Microgrid Optimization",
                "abstract": " ".join(["microgrid"] * 160),
                "discipline": "Computer Engineering",
                "university": "KNUST",
                "year": "2027",
            },
            files={"file": ("masters.pdf", io.BytesIO(b"%PDF-1.4 MASTERS"), "application/pdf")},
            headers=self._auth_headers(stu_a_token, "knust-gh"),
        )
        self.assertEqual(masters_upload.status_code, 201, masters_upload.text)
        mine = self.client.get("/api/papers/mine", headers=self._auth_headers(stu_a_token, "knust-gh"))
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(len(mine.json()), 2)


if __name__ == "__main__":
    unittest.main()
