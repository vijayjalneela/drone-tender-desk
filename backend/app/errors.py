"""Every 4xx/5xx response uses the envelope from api-contract.md §1:

    {"error": {"code": ..., "message": ..., "fields": [{"field": ..., "problem": ...}]}}

`fields` is present only when specific fields are at fault.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

CODE_BY_STATUS = {
    401: "unauthorized",
    404: "not_found",
    409: "conflict",
    413: "file_too_large",
    422: "validation_error",
    429: "rate_limited",
}

DEFAULT_MESSAGES = {
    "unauthorized": "You need to log in.",
    "not_found": "Not found.",
    "conflict": "This action is not allowed in the current state.",
    "file_too_large": "The file is larger than 20 MB.",
    "validation_error": "Some fields are missing or invalid.",
    "rate_limited": "Too many requests. Please wait and try again.",
    "server_error": "Something went wrong. Please try again later.",
}

# Request locations FastAPI puts at the start of an error's `loc`.
LOC_PREFIXES = {"body", "query", "path", "header", "cookie", "form"}


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str | None = None,
        fields: list[dict[str, str]] | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message or DEFAULT_MESSAGES.get(code, DEFAULT_MESSAGES["server_error"])
        self.fields = fields


def error_response(
    status_code: int, code: str, message: str, fields: list[dict[str, str]] | None = None
) -> JSONResponse:
    body: dict = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    return JSONResponse(status_code=status_code, content={"error": body})


def _field_name(loc: tuple) -> str:
    parts = [str(p) for p in loc]
    if parts and parts[0] in LOC_PREFIXES:
        parts = parts[1:]
    return ".".join(parts) or "request"


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.fields)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = [{"field": _field_name(e["loc"]), "problem": e["msg"]} for e in exc.errors()]
    return error_response(422, "validation_error", DEFAULT_MESSAGES["validation_error"], fields)


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if exc.status_code >= 500:
        code = "server_error"
    else:
        # Statuses the contract has no code for (e.g. 405) fall back to a generic one.
        code = CODE_BY_STATUS.get(exc.status_code, "bad_request")
    message = DEFAULT_MESSAGES.get(code, "The request could not be processed.")
    return error_response(exc.status_code, code, message)


async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Details go to the logs only, never to the response.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return error_response(500, "server_error", DEFAULT_MESSAGES["server_error"])


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)
