from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.security import authenticate, create_access_token
from app.timeutil import to_ist_iso

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str


@router.post("/api/admin/login")
def login(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    admin = authenticate(db, body.username, body.password)
    if admin is None:
        # Same message whichever of the two was wrong.
        raise AppError(401, "unauthorized", "Incorrect username or password.")
    token, expires_at = create_access_token(admin)
    return LoginResponse(access_token=token, expires_at=to_ist_iso(expires_at))
