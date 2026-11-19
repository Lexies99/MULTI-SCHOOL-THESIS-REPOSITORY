from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.core.tenant import current_tenant_bypass, current_tenant_id

_REGISTERED = False


def _tenant_scoped_models() -> tuple[type, ...]:
    from app.models.department import Department
    from app.models.notification import Notification
    from app.models.paper import Paper
    from app.models.phd_system import (
        PhDComprehensiveExam,
        PhDProgressEvaluation,
        PhDReaccreditationFolder,
        PhDSeminar,
        PhDSupervisionLog,
        PhDTeachingRequirement,
    )
    from app.models.student import Student
    from app.models.thesis_system import School, Thesis
    from app.models.user import User

    return (
        User,
        Student,
        Department,
        School,
        Paper,
        Thesis,
        Notification,
        PhDSupervisionLog,
        PhDSeminar,
        PhDComprehensiveExam,
        PhDTeachingRequirement,
        PhDProgressEvaluation,
        PhDReaccreditationFolder,
    )


def _resolve_session_scope(session: Session) -> tuple[bool, int | None]:
    if current_tenant_bypass.get():
        return True, None
    info = getattr(session, "info", None) or {}
    if info.get("tenant_bypass"):
        return True, None
    if "tenant_id" in info:
        return False, info.get("tenant_id")
    return False, current_tenant_id.get()


def _make_tenant_criterion(tid: int):
    # Closure variable `tid` (NOT a default arg!) so SQLAlchemy 2.0's
    # track_closure_variables=True caches per-tenant bind values safely.
    return lambda cls: cls.institution_id == tid


def register_tenant_scoping(session_factory=None) -> None:
    """Attach automatic SQLAlchemy ORM-level tenant isolation and write-stamping hooks on Session."""
    global _REGISTERED
    if _REGISTERED:
        return

    @event.listens_for(Session, "do_orm_execute")
    def _enforce_tenant_read_scope(execute_state: ORMExecuteState) -> None:
        if not execute_state.is_select:
            return
        if execute_state.execution_options.get("skip_tenant_scope"):
            return
        bypass, tenant_id = _resolve_session_scope(execute_state.session)
        if bypass or tenant_id is None:
            return

        criterion = _make_tenant_criterion(int(tenant_id))
        options = [
            with_loader_criteria(
                model,
                criterion,
                include_aliases=True,
                track_closure_variables=True,
            )
            for model in _tenant_scoped_models()
        ]
        execute_state.statement = execute_state.statement.options(*options)

    @event.listens_for(Session, "before_flush")
    def _enforce_tenant_write_scope(session: Session, flush_context, instances) -> None:
        bypass, tenant_id = _resolve_session_scope(session)
        if bypass or tenant_id is None:
            return

        scoped_types = _tenant_scoped_models()
        for obj in session.new:
            if isinstance(obj, scoped_types):
                if getattr(obj, "institution_id", None) is None:
                    setattr(obj, "institution_id", tenant_id)
                elif getattr(obj, "institution_id") != tenant_id:
                    raise PermissionError("Cross-tenant record creation is forbidden")

        for obj in session.dirty:
            if isinstance(obj, scoped_types):
                obj_tid = getattr(obj, "institution_id", None)
                if obj_tid is not None and obj_tid != tenant_id:
                    raise PermissionError("Cross-tenant record modification is forbidden")

        for obj in session.deleted:
            if isinstance(obj, scoped_types):
                obj_tid = getattr(obj, "institution_id", None)
                if obj_tid is not None and obj_tid != tenant_id:
                    raise PermissionError("Cross-tenant record deletion is forbidden")

    _REGISTERED = True
