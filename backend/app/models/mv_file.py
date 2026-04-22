import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base
from backend.app.models.mv_tag import MvTag, mv_file_tags


class MvFile(Base):
    """MakerVault-style file record for maker files (STL, 3MF, GCODE, etc.)."""

    __tablename__ = "mv_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("mv_projects.id", ondelete="SET NULL"), nullable=True
    )

    project: Mapped["MvProject | None"] = relationship("MvProject", back_populates="files")  # noqa: F821
    tags: Mapped[list[MvTag]] = relationship(MvTag, secondary=mv_file_tags, back_populates="files", lazy="selectin")
