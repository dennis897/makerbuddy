import os
import uuid as uuid_mod
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlparse
from uuid import UUID

import aiofiles
import httpx
import jwt as _jwt
from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form, status
from fastapi.responses import FileResponse as FastAPIFileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.auth import ALGORITHM, SECRET_KEY, get_current_active_user
from backend.app.core.config import settings as app_settings
from backend.app.core.database import get_db
from backend.app.models.mv_file import MvFile
from backend.app.models.mv_project import MvProject
from backend.app.models.mv_tag import MvTag
from backend.app.models.user import User

ALLOWED_EXTENSIONS = {"stl", "3mf", "obj", "step", "stp", "gcode", "scad", "svg", "crv"}

MV_UPLOAD_DIR = str(app_settings.base_dir / "mv_uploads")


def _get_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class TagBrief(BaseModel):
    id: UUID
    name: str
    color: str
    model_config = {"from_attributes": True}


class FileResponse(BaseModel):
    id: UUID
    original_filename: str
    file_type: str
    file_size: int
    description: str
    uploaded_at: datetime
    owner_id: int
    project_id: UUID | None
    tags: list[TagBrief] = []
    model_config = {"from_attributes": True}


class FileUpdate(BaseModel):
    description: str | None = None
    tag_ids: list[UUID] | None = None
    project_id: UUID | None = None


# ── Router ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/mv/files", tags=["makerbuddy-files"])


@router.get("/", response_model=list[FileResponse])
async def list_files(
    tag: str | None = None,
    search: str | None = None,
    project: str | None = None,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(MvFile).where(MvFile.owner_id == user.id).options(selectinload(MvFile.tags))

    if tag:
        query = query.join(MvFile.tags).where(MvTag.name == tag)
    if search:
        query = query.where(MvFile.original_filename.ilike(f"%{search}%"))
    if project == "none":
        query = query.where(MvFile.project_id.is_(None))
    elif project:
        try:
            project_uuid = UUID(project)
            children = await db.execute(
                select(MvProject.id).where(MvProject.parent_id == project_uuid, MvProject.owner_id == user.id)
            )
            child_ids = [r[0] for r in children.all()]
            query = query.where(MvFile.project_id.in_([project_uuid] + child_ids))
        except ValueError:
            pass

    query = query.order_by(MvFile.uploaded_at.desc())
    result = await db.execute(query)
    return result.scalars().unique().all()


@router.post("/", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    description: str = Form(""),
    tag_ids: str = Form(""),
    project_id: str = Form(""),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    ext = _get_extension(file.filename or "")
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '.{ext}' not allowed.")

    stored_name = f"{uuid_mod.uuid4().hex}.{ext}"
    upload_path = os.path.join(MV_UPLOAD_DIR, stored_name)
    os.makedirs(MV_UPLOAD_DIR, exist_ok=True)

    size = 0
    async with aiofiles.open(upload_path, "wb") as out:
        while chunk := await file.read(1024 * 256):
            size += len(chunk)
            await out.write(chunk)

    db_file = MvFile(
        original_filename=file.filename,
        stored_filename=stored_name,
        file_type=ext,
        file_size=size,
        description=description,
        owner_id=user.id,
        project_id=UUID(project_id.strip()) if project_id.strip() else None,
    )

    if tag_ids.strip():
        ids = [UUID(t.strip()) for t in tag_ids.split(",") if t.strip()]
        result = await db.execute(select(MvTag).where(MvTag.id.in_(ids)))
        db_file.tags = list(result.scalars().all())

    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)
    return db_file


@router.post("/import-url", response_model=FileResponse, status_code=status.HTTP_201_CREATED)
async def import_from_url(
    url: str = Form(...),
    description: str = Form(""),
    tag_ids: str = Form(""),
    project_id: str = Form(""),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are supported")

    async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
        try:
            response = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=400, detail=f"Failed to download URL: {e.response.status_code}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=400, detail=f"Could not reach URL: {e}")

        filename = None
        cd = response.headers.get("content-disposition", "")
        if "filename=" in cd:
            filename = cd.split("filename=")[-1].strip().strip('"').strip("'")
        if not filename:
            path_part = unquote(parsed.path.rstrip("/").split("/")[-1])
            if "." in path_part:
                filename = path_part

        if not filename:
            raise HTTPException(status_code=400, detail="Could not determine filename from URL")

        ext = _get_extension(filename)
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"File type '.{ext}' not allowed.")

        stored_name = f"{uuid_mod.uuid4().hex}.{ext}"
        upload_path = os.path.join(MV_UPLOAD_DIR, stored_name)
        os.makedirs(MV_UPLOAD_DIR, exist_ok=True)
        async with aiofiles.open(upload_path, "wb") as f:
            await f.write(response.content)

    size = os.path.getsize(upload_path)
    db_file = MvFile(
        original_filename=filename,
        stored_filename=stored_name,
        file_type=ext,
        file_size=size,
        description=description,
        owner_id=user.id,
        project_id=UUID(project_id.strip()) if project_id.strip() else None,
    )

    if tag_ids.strip():
        ids = [UUID(t.strip()) for t in tag_ids.split(",") if t.strip()]
        result = await db.execute(select(MvTag).where(MvTag.id.in_(ids)))
        db_file.tags = list(result.scalars().all())

    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)
    return db_file


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MvFile).where(MvFile.id == file_id, MvFile.owner_id == user.id).options(selectinload(MvFile.tags))
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    return f


@router.get("/{file_id}/preview-geometry")
async def preview_geometry(
    file_id: UUID,
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    try:
        payload = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (_jwt.exceptions.InvalidTokenError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(MvFile).where(MvFile.id == file_id, MvFile.owner_id == user_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    if f.file_type != "3mf":
        raise HTTPException(status_code=400, detail="Only 3MF files support geometry preview")

    path = os.path.join(MV_UPLOAD_DIR, f.stored_filename)
    try:
        positions = _parse_3mf_positions(path)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse 3MF: {e}")

    return JSONResponse({"positions": positions})


@router.post("/{file_id}/signed-url")
async def create_signed_url(
    file_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MvFile).where(MvFile.id == file_id, MvFile.owner_id == user.id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    short_token = _jwt.encode(
        {
            "sub": str(user.id),
            "file_id": str(file_id),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return {"signed_url": f"/api/mv/files/{file_id}/slicer/{short_token}/{f.original_filename}"}


@router.get("/{file_id}/slicer/{token}/{filename}")
async def slicer_download(
    file_id: UUID,
    token: str,
    filename: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (_jwt.exceptions.InvalidTokenError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(MvFile).where(MvFile.id == file_id, MvFile.owner_id == user_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    path = os.path.join(MV_UPLOAD_DIR, f.stored_filename)
    return FastAPIFileResponse(path, filename=f.original_filename, media_type="application/octet-stream")


@router.get("/{file_id}/download")
async def download_file(
    file_id: UUID,
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
    try:
        payload = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except (_jwt.exceptions.InvalidTokenError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(MvFile).where(MvFile.id == file_id, MvFile.owner_id == user_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    path = os.path.join(MV_UPLOAD_DIR, f.stored_filename)
    return FastAPIFileResponse(path, filename=f.original_filename, media_type="application/octet-stream")


@router.patch("/{file_id}", response_model=FileResponse)
async def update_file(
    file_id: UUID,
    update: FileUpdate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MvFile).where(MvFile.id == file_id, MvFile.owner_id == user.id).options(selectinload(MvFile.tags))
    )
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    if update.description is not None:
        f.description = update.description
    if update.tag_ids is not None:
        tag_result = await db.execute(select(MvTag).where(MvTag.id.in_(update.tag_ids)))
        f.tags = list(tag_result.scalars().all())
    if "project_id" in update.model_fields_set:
        f.project_id = update.project_id

    await db.commit()
    await db.refresh(f)
    return f


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MvFile).where(MvFile.id == file_id, MvFile.owner_id == user.id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="File not found")

    path = os.path.join(MV_UPLOAD_DIR, f.stored_filename)
    if os.path.exists(path):
        os.remove(path)

    await db.delete(f)
    await db.commit()


# ── 3MF geometry parser ───────────────────────────────────────────────────────

def _parse_3mf_positions(path: str) -> list[float]:
    def local(tag: str) -> str:
        return tag.split("}")[-1] if "}" in tag else tag

    def find_all_local(elem, name: str):
        return [e for e in elem.iter() if local(e.tag) == name]

    positions: list[float] = []
    with zipfile.ZipFile(path) as zf:
        model_files = [n for n in zf.namelist() if n.endswith(".model")]
        if not model_files:
            raise ValueError("No .model file found in 3MF archive")
        for model_name in model_files:
            with zf.open(model_name) as fh:
                root = ET.parse(fh).getroot()
            _extract_mesh_positions(root, positions, find_all_local)
    return positions


def _extract_mesh_positions(root, positions: list[float], find_all_local) -> None:
    for mesh_el in find_all_local(root, "mesh"):
        verts_els = find_all_local(mesh_el, "vertices")
        if not verts_els:
            continue
        verts: list[tuple[float, float, float]] = []
        for v in find_all_local(verts_els[0], "vertex"):
            verts.append((float(v.get("x", 0)), float(v.get("y", 0)), float(v.get("z", 0))))
        tris_els = find_all_local(mesh_el, "triangles")
        if not tris_els:
            continue
        for t in find_all_local(tris_els[0], "triangle"):
            v1, v2, v3 = int(t.get("v1", 0)), int(t.get("v2", 0)), int(t.get("v3", 0))
            if v1 < len(verts) and v2 < len(verts) and v3 < len(verts):
                positions.extend(verts[v1])
                positions.extend(verts[v2])
                positions.extend(verts[v3])
