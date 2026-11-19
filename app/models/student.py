from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from app.models.base import Base


class Student(Base):
    __tablename__ = "students"

    student_id = Column(String(64), primary_key=True, index=True)
    institution_id = Column(Integer, ForeignKey("institutions.id", ondelete="CASCADE"), nullable=True, index=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    school = Column(String(255), nullable=True, index=True)
    department = Column(String(255), nullable=True, index=True)
    program = Column(String(255), nullable=True, index=True)
    certification_type = Column(String(64), nullable=True, index=True)
    block_code = Column(String(8), nullable=True, index=True)
    year = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    institution = relationship("Institution", foreign_keys=[institution_id])
