from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config  # noqa: F401 — triggers directory creation

from routers import sessions, audio, history, templates, contacts, recovery, settings

app = FastAPI(title="Meeting Recorder API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(audio.router)
app.include_router(history.router)
app.include_router(templates.router)
app.include_router(contacts.router)
app.include_router(recovery.router)
app.include_router(settings.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
