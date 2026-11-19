from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional


class DepartmentBase(BaseModel):
    name: str
    faculty_name: Optional[str] = None
    programs: list[str] = Field(default_factory=list)


class DepartmentCreate(DepartmentBase):
    name: str = Field(..., min_length=2, max_length=255)
    faculty_name: Optional[str] = Field(default=None, max_length=255)
    programs: list[str] = Field(default_factory=list)
    hod_user_id: Optional[int] = None
    dean_user_id: Optional[int] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    faculty_name: Optional[str] = Field(default=None, max_length=255)
    programs: Optional[list[str]] = None


class DepartmentRead(DepartmentBase):
    id: int
    institution_id: int
    institution_name: Optional[str] = None
    faculty_name: Optional[str] = None
    programs: list[str] = Field(default_factory=list)
    hod_user_id: Optional[int] = None
    dean_user_id: Optional[int] = None

    class Config:
        from_attributes = True


class AssignHODRequest(BaseModel):
    user_id: int = Field(..., description="User ID to assign as HOD")


class AssignDeanRequest(BaseModel):
    user_id: int = Field(..., description="User ID to assign as Dean")


class AddSupervisorRequest(BaseModel):
    supervisor_user_ids: list[int] = Field(..., description="List of user IDs to add as supervisors")


class RemoveSupervisorRequest(BaseModel):
    supervisor_user_id: int = Field(..., description="User ID to remove as supervisor")


class DepartmentSupervisorRead(BaseModel):
    id: int
    department_id: int
    supervisor_user_id: int
    active: bool

    class Config:
        from_attributes = True
