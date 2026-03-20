import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict

import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from resume_parser.gpt_parser import ResumeParserConfigError
from resume_parser.parse_resume import parse_resume, parse_resume_url

LOGGER = logging.getLogger("uvicorn.error")


def _emit(message: str) -> None:
    print(message, flush=True)


def _load_local_env() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        _emit(f"[ResumeParser] No local .env file found at {env_path}")
        return

    loaded_keys: list[str] = []
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value.strip()
        loaded_keys.append(key)

    if loaded_keys:
        _emit(
            "[ResumeParser] Loaded env keys from .env: "
            + ", ".join(sorted(loaded_keys))
        )
    else:
        _emit("[ResumeParser] Local .env found, but no new env keys were loaded")


_load_local_env()

app = FastAPI(title="Resume Parser API", version="0.1.0")

# Allow local development origins and Expo LAN URLs
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "provider": "openai",
        "configured": bool(os.getenv("OPENAI_API_KEY")),
        "model": os.getenv("OPENAI_RESUME_PARSER_MODEL", "gpt-5.4"),
    }


@app.post("/parse/url")
async def parse_from_url(payload: Dict[str, Any]):
    url = payload.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="Missing url")

    try:
        _emit(f"[ResumeParser] /parse/url called for {url}")
        return parse_resume_url(str(url))
    except ResumeParserConfigError as e:
        _emit(f"[ResumeParser] Config error in /parse/url: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        LOGGER.exception("[ResumeParser] Unexpected error in /parse/url")
        print(f"[ResumeParser] Unexpected error in /parse/url: {e}", flush=True)
        raise HTTPException(status_code=500, detail=f"Parse failed: {e}")


@app.post("/parse/upload")
async def parse_upload(file: UploadFile = File(...)):
    try:
        _emit(
            "[ResumeParser] /parse/upload called for "
            f"{file.filename or 'uploaded file'}"
        )
        suffix = os.path.splitext(file.filename or "uploaded.pdf")[1] or ".pdf"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)
            tmp_path = tmp.name
        out = parse_resume(tmp_path)
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        return out
    except ResumeParserConfigError as e:
        _emit(f"[ResumeParser] Config error in /parse/upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        LOGGER.exception("[ResumeParser] Unexpected error in /parse/upload")
        print(f"[ResumeParser] Unexpected error in /parse/upload: {e}", flush=True)
        raise HTTPException(status_code=500, detail=f"Parse failed: {e}")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    reload = os.getenv("ENV") == "development"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)
