"""Admin passwords and login tokens (backend-spec §5)."""

from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.errors import AppError
from app.models import Admin
from app.timeutil import now_ist

ACCESS_TOKEN_LIFETIME = timedelta(hours=8)
JWT_ALGORITHM = "HS256"

# bcrypt only looks at the first 72 bytes; longer passwords are refused, not silently cut.
MAX_PASSWORD_BYTES = 72

# Checked against when the username is unknown, so a wrong username takes as long as a
# wrong password and the response time doesn't reveal which one was wrong.
_DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt()).decode()


def hash_password(password: str) -> str:
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes.")
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        # Over-long password or malformed hash: never a match.
        return False


def authenticate(db: Session, username: str, password: str) -> Admin | None:
    admin = db.query(Admin).filter(Admin.username == username).one_or_none()
    if admin is None:
        verify_password(password, _DUMMY_HASH)
        return None
    return admin if verify_password(password, admin.password_hash) else None


def create_access_token(admin: Admin, now: datetime | None = None) -> tuple[str, datetime]:
    issued_at = now or now_ist()
    expires_at = issued_at + ACCESS_TOKEN_LIFETIME
    payload = {"sub": str(admin.id), "iat": issued_at, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM), expires_at


_bearer = HTTPBearer(auto_error=False)


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Admin:
    """Guards every admin endpoint. Missing, invalid or expired token → 401."""
    if credentials is None:
        raise AppError(401, "unauthorized")
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp"]},
        )
        admin_id = int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise AppError(401, "unauthorized", "Your session has expired. Please log in again.")
    except (jwt.InvalidTokenError, ValueError):
        raise AppError(401, "unauthorized")

    admin = db.get(Admin, admin_id)
    if admin is None:
        raise AppError(401, "unauthorized")
    return admin
