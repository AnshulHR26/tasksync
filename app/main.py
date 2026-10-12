import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (
    FastAPI, Depends, HTTPException, Query, BackgroundTasks, WebSocket, WebSocketDisconnect,
)
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, or_, inspect, text
from sqlalchemy.orm import Session

from . import models, schemas, security
from .database import engine, get_db, SessionLocal
from .realtime import manager

STATIC_DIR = Path(__file__).parent / "static"

# Set ALLOW_REGISTRATION=false in .env once your own account exists, so nobody else can sign up.
ALLOW_REGISTRATION = os.getenv("ALLOW_REGISTRATION", "true").strip().lower() in ("1", "true", "yes")

# Columns added after the first version. Existing databases get them on startup.
NEW_TASK_COLUMNS = {
    "priority": "VARCHAR(10) NOT NULL DEFAULT 'medium'",
    "due_date": "DATE",
    "completed_at": "TIMESTAMP WITH TIME ZONE",
}


def upgrade_schema() -> None:
    models.Base.metadata.create_all(bind=engine)
    existing = {c["name"] for c in inspect(engine).get_columns("tasks")}
    with engine.begin() as conn:
        for name, ddl in NEW_TASK_COLUMNS.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE tasks ADD COLUMN {name} {ddl}"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    upgrade_schema()
    yield


app = FastAPI(title="Task Manager API", version="2.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


# Served from the root so the phone app (PWA) can control the whole site.
@app.get("/sw.js", include_in_schema=False)
def service_worker():
    return FileResponse(
        STATIC_DIR / "sw.js",
        media_type="text/javascript",
        headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/"},
    )


@app.get("/manifest.webmanifest", include_in_schema=False)
def web_manifest():
    return FileResponse(STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json")


# ---------- Auth ----------
@app.get("/auth/config", tags=["Auth"])
def auth_config():
    return {"allow_registration": ALLOW_REGISTRATION}


@app.post("/auth/register", response_model=schemas.UserOut, status_code=201, tags=["Auth"])
def register(data: schemas.UserCreate, db: Session = Depends(get_db)):
    if not ALLOW_REGISTRATION:
        raise HTTPException(status_code=403, detail="New sign-ups are turned off")
    email = data.email.lower()
    existing = db.scalar(select(models.User).where(models.User.email == email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(email=email, hashed_password=security.hash_password(data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=schemas.Token, tags=["Auth"])
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(models.User).where(models.User.email == form.username.lower()))
    if not user or not security.verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return schemas.Token(access_token=security.create_access_token(user.id))


@app.get("/users/me", response_model=schemas.UserOut, tags=["Users"])
def read_me(current_user: models.User = Depends(security.get_current_user)):
    return current_user


@app.post("/users/me/password", status_code=204, tags=["Users"])
def change_password(
    data: schemas.PasswordChange,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.get_current_user),
):
    if not security.verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = security.hash_password(data.new_password)
    db.commit()


# ---------- Tasks ----------
def get_own_task(task_id: int, db: Session, user: models.User) -> models.Task:
    task = db.get(models.Task, task_id)
    if task is None or task.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/tasks", response_model=schemas.TaskOut, status_code=201, tags=["Tasks"])
def create_task(
    data: schemas.TaskCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.get_current_user),
):
    task = models.Task(**data.model_dump(), owner_id=user.id)
    db.add(task)
    db.commit()
    db.refresh(task)
    background.add_task(manager.notify, user.id, "created", task.id)
    return task


@app.get("/tasks", response_model=list[schemas.TaskOut], tags=["Tasks"])
def list_tasks(
    completed: bool | None = None,
    priority: schemas.Priority | None = None,
    q: str | None = Query(None, max_length=100, description="Search title and description"),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=1000),
    db: Session = Depends(get_db),
    user: models.User = Depends(security.get_current_user),
):
    stmt = select(models.Task).where(models.Task.owner_id == user.id)
    if completed is not None:
        stmt = stmt.where(models.Task.completed == completed)
    if priority is not None:
        stmt = stmt.where(models.Task.priority == priority)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(models.Task.title.ilike(pattern), models.Task.description.ilike(pattern))
        )
    stmt = stmt.order_by(models.Task.id.desc()).offset(skip).limit(limit)
    return db.scalars(stmt).all()


@app.get("/tasks/{task_id}", response_model=schemas.TaskOut, tags=["Tasks"])
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.get_current_user),
):
    return get_own_task(task_id, db, user)


@app.patch("/tasks/{task_id}", response_model=schemas.TaskOut, tags=["Tasks"])
def update_task(
    task_id: int,
    data: schemas.TaskUpdate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.get_current_user),
):
    task = get_own_task(task_id, db, user)
    changes = data.model_dump(exclude_unset=True)
    if "completed" in changes and changes["completed"] != task.completed:
        task.completed_at = datetime.now(timezone.utc) if changes["completed"] else None
    for field, value in changes.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    background.add_task(manager.notify, user.id, "updated", task.id)
    return task


@app.delete("/tasks/{task_id}", status_code=204, tags=["Tasks"])
def delete_task(
    task_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.get_current_user),
):
    task = get_own_task(task_id, db, user)
    db.delete(task)
    db.commit()
    background.add_task(manager.notify, user.id, "deleted", task_id)


# ---------- Real-time ----------
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Browser connects, sends {"token": "..."} first, then receives a message on every task change."""
    await ws.accept()
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=10)
        with SessionLocal() as db:
            user = security.user_from_token(str(first.get("token", "")), db)
            user_id = user.id if user else None
    except (asyncio.TimeoutError, WebSocketDisconnect, ValueError, AttributeError):
        user_id = None
    if user_id is None:
        await ws.close(code=4401)
        return

    manager.add(user_id, ws)
    await ws.send_json({"event": "ready", "task_id": None})
    try:
        while True:
            await ws.receive_text()  # keep-alive pings from the browser
    except WebSocketDisconnect:
        pass
    finally:
        manager.remove(user_id, ws)
