import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_active_user
from backend.app.core.database import get_db
from backend.app.models.mv_file import MvFile
from backend.app.models.mv_project import MvProject
from backend.app.models.user import User


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    machine_type: str = "3dprint"
    parent_id: uuid.UUID | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    machine_type: str
    parent_id: uuid.UUID | None
    owner_id: int
    created_at: datetime
    file_count: int = 0

    model_config = {"from_attributes": True}


router = APIRouter(prefix="/api/mv/projects", tags=["makerbuddy-projects"])


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MvProject).where(MvProject.owner_id == user.id).order_by(MvProject.created_at.desc())
    )
    projects = result.scalars().all()

    counts_result = await db.execute(
        select(MvFile.project_id, func.count(MvFile.id))
        .where(MvFile.owner_id == user.id, MvFile.project_id.isnot(None))
        .group_by(MvFile.project_id)
    )
    counts = {row[0]: row[1] for row in counts_result.all()}

    out = []
    for p in projects:
        d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
        d["file_count"] = counts.get(p.id, 0)
        out.append(d)
    return out


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_in: ProjectCreate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    project = MvProject(
        name=project_in.name,
        description=project_in.description,
        machine_type=project_in.machine_type,
        parent_id=project_in.parent_id,
        owner_id=user.id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return {**{c.name: getattr(project, c.name) for c in project.__table__.columns}, "file_count": 0}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MvProject).where(MvProject.id == project_id, MvProject.owner_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()
