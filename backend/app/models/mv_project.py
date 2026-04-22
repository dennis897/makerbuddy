import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


class MvProject(Base):
    """MakerVault-style project for grouping maker files (STL, 3MF, GCODE, etc.)."""

    __tablename__ = "mv_projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    machine_type: Mapped[str] = mapped_column(String(20), server_default="3dprint")
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mv_projects.id", ondelete="CASCADE"), nullable=True
    )
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    files: Mapped[list["MvFile"]] = relationship("MvFile", back_populates="project")  # noqa: F821
    children: Mapped[list["MvProject"]] = relationship(
        "MvProject",
        back_populates="parent",
        foreign_keys="MvProject.parent_id",
    )
    parent: Mapped["MvProject | None"] = relationship(
        "MvProject",
        back_populates="children",
        remote_side="MvProject.id",
        foreign_keys="MvProject.parent_id",
    )
