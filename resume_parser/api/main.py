from __future__ import annotations
import os
import tempfile
from typing import Any, Dict

import httpx
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from resume_parser.parse_resume import parse_resume

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
    return {"status": "ok"}


@app.post("/parse/url")
async def parse_from_url(payload: Dict[str, Any]):
    url = payload.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="Missing url")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.get(url)
            r.raise_for_status()
            suffix = ".pdf"
            # Try to infer from headers
            ct = r.headers.get("content-type", "")
            if "pdf" not in ct and "octet-stream" not in ct:
                # Not strictly required; many signed URLs won't serve a type
                pass
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(r.content)
                tmp_path = tmp.name
        out = parse_resume(tmp_path)
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse failed: {e}")


@app.post("/parse/upload")
async def parse_upload(file: UploadFile = File(...)):
    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse failed: {e}")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    reload = os.getenv("ENV") == "development"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)
