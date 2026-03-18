from __future__ import annotations
import asyncio
import logging
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)


class TimeoutMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce request timeout limits.

    Aborts requests that exceed the configured timeout to prevent resource exhaustion.
    """

    def __init__(self, app: ASGIApp, timeout_seconds: float = 30.0):
        super().__init__(app)
        self.timeout_seconds = timeout_seconds
        logger.info(f"Timeout middleware enabled: {timeout_seconds}s")

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()

        try:
            # Create a task for the request handling
            response = await asyncio.wait_for(
                call_next(request),
                timeout=self.timeout_seconds
            )

            # Log slow requests (those taking >50% of timeout)
            duration = time.time() - start_time
            if duration > (self.timeout_seconds * 0.5):
                logger.warning(
                    f"Slow request: {request.method} {request.url.path} "
                    f"took {duration:.2f}s (timeout: {self.timeout_seconds}s)"
                )

            # Add timing header
            response.headers["X-Process-Time"] = f"{duration:.3f}"
            return response

        except asyncio.TimeoutError:
            duration = time.time() - start_time
            logger.error(
                f"Request timeout: {request.method} {request.url.path} "
                f"exceeded {self.timeout_seconds}s"
            )

            return Response(
                content=(
                    f'{{"error": "Request timeout", '
                    f'"detail": "Request processing exceeded {self.timeout_seconds}s timeout", '
                    f'"timeout_seconds": {self.timeout_seconds}}}'
                ),
                status_code=504,
                media_type="application/json"
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                f"Request error: {request.method} {request.url.path} "
                f"failed after {duration:.2f}s: {e}"
            )
            raise


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all requests with timing information."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()

        # Log incoming request
        logger.info(f"Request started: {request.method} {request.url.path}")

        response = await call_next(request)

        # Log response with timing
        duration = time.time() - start_time
        logger.info(
            f"Request completed: {request.method} {request.url.path} "
            f"status={response.status_code} duration={duration:.3f}s"
        )

        return response
