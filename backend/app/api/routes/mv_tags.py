import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.auth import get_current_active_user
from backend.app.core.database import get_db
from backend.app.models.mv_tag import MvTag
from backend.app.models.user import User


class TagCreate(BaseModel):
    name: str
    color: str = "#6366f1"


class TagResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str

    model_config = {"from_attributes": True}


router = APIRouter(prefix="/api/mv/tags", tags=["makerbuddy-tags"])


@router.get("/", response_model=list[TagResponse])
async def list_tags(
    _: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MvTag).order_by(MvTag.name))
    return result.scalars().all()


@router.post("/", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    tag_in: TagCreate,
    _: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MvTag).where(MvTag.name == tag_in.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tag already exists")

    tag = MvTag(name=tag_in.name, color=tag_in.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: uuid.UUID,
    _: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MvTag).where(MvTag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.delete(tag)
    await db.commit()
