import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_error_handlers
from app.ratelimit import create_limiters
from app.routers import admin_auth, admin_tenders, health, public_tenders


def configure_logging() -> None:
    """Send the app's own INFO logs (e.g. each extraction's outcome) to stderr.

    Uvicorn only configures its own loggers, so without this they are dropped.
    """
    app_logger = logging.getLogger("app")
    if not app_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        app_logger.addHandler(handler)
        app_logger.setLevel(logging.INFO)


def create_app() -> FastAPI:
    configure_logging()
    docs = settings.enable_api_docs
    app = FastAPI(
        title="Drone Tender Desk API",
        # Off in production (backend-spec §7): the API's shape is not advertised.
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Fresh counts per app instance (in memory; see app/ratelimit.py).
    app.state.limiters = create_limiters()
    register_error_handlers(app)
    app.include_router(health.router)
    app.include_router(public_tenders.router)
    app.include_router(admin_auth.router)
    app.include_router(admin_tenders.router)
    return app


app = create_app()
