import base64
import os
import secrets

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

import config  # noqa: F401 — triggers directory creation

from routers import sessions, audio, processing, ai, slack, history, templates, contacts, recovery, settings

BASIC_AUTH_USER = os.environ["BASIC_AUTH_USER"]
BASIC_AUTH_PASSWORD = os.environ["BASIC_AUTH_PASSWORD"]
PUBLIC_PATHS = {"/api/health"}

app = FastAPI(title="Meeting Recorder API", version="0.1.0")


@app.middleware("http")
async def basic_auth_middleware(request: Request, call_next):
    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    auth = request.headers.get("authorization", "")
    if auth.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth[6:]).decode("utf-8")
            user, _, password = decoded.partition(":")
            if (
                secrets.compare_digest(user, BASIC_AUTH_USER)
                and secrets.compare_digest(password, BASIC_AUTH_PASSWORD)
            ):
                return await call_next(request)
        except Exception:
            pass
    return Response(
        status_code=status.HTTP_401_UNAUTHORIZED,
        headers={"WWW-Authenticate": 'Basic realm="meeting-recorder"'},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(processing.router)
app.include_router(ai.router)
app.include_router(sessions.router)
app.include_router(audio.router)
app.include_router(slack.router)
app.include_router(history.router)
app.include_router(templates.router)
app.include_router(contacts.router)
app.include_router(recovery.router)
app.include_router(settings.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
