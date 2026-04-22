import uuid

from sqlalchemy import Column, ForeignKey, String, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base

mv_file_tags = Table(
    "mv_file_tags",
    Base.metadata,
    Column("file_id", UUID(as_uuid=True), ForeignKey("mv_files.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", UUID(as_uuid=True), ForeignKey("mv_tags.id", ondelete="CASCADE"), primary_key=True),
)


class MvTag(Base):
    __tablename__ = "mv_tags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    color: Mapped[str] = mapped_column(String(7), default="#6366f1")

    files: Mapped[list["MvFile"]] = relationship(  # noqa: F821
        "MvFile", secondary=mv_file_tags, back_populates="tags"
    )
