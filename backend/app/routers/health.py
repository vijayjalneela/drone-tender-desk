import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    """Checks that the database answers, not only that the server runs."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Health check: database did not answer")
        raise AppError(500, "server_error")
    return {"status": "ok", "database": "ok"}
