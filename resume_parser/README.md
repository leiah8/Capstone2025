# Resume Parsing Backend

A modular pipeline for parsing resumes/PDF CVs using a recommended stack:

## Stack Overview

1. Born-digital text extraction: **PyMuPDF (fitz)** for fast, structured text (blocks, lines, spans, positions, fonts).
2. Fallback OCR (scanned/low-text PDFs): **pytesseract** (Tesseract) — optional upgrade to PaddleOCR or docTR.
3. Layout / section detection: Heuristic heading regex with optional **layoutparser** model hook.
4. Table extraction: **pdfplumber** baseline; optional Camelot/Tabula for true vector tables.
5. Skill / entity extraction: Simple keyword matcher placeholder (expand with embeddings/NER later).

## Install

```bash
# From repository root
python -m venv .venv
source .venv/bin/activate
pip install -r resume_parser/requirements.txt

# Install Tesseract (macOS)
brew install tesseract

# Optional heavy deps
# pip install camelot-py[cv] opencv-python layoutparser torch tabula-py
```

## Usage

```bash
python resume_parser/parse_resume.py --file /path/to/resume.pdf --json out.json
```

Outputs structured JSON with keys: `metadata`, `text`, `sections`, `tables`, `skills`, `strategy`.

## Server Deployment

This parser can run as a hosted API instead of requiring a local process.
The current production deployment is:

```text
https://resume-parser-production-000c.up.railway.app
```

The repo already includes deploy artifacts for services like Railway:

- `Procfile`
- `Dockerfile`
- `nixpacks.toml`

If you want the mobile app to reach the parser through Supabase, deploy
`supabase/functions/resume-parser` and point `RESUME_PARSER_API_BASE_URL` at the
hosted parser URL.

## Strategy Logic

- Try PyMuPDF; if extracted text length < threshold or mostly whitespace, classify as scanned and OCR each page.
- Columns reconstructed via spatial clustering (simple two-column heuristic now; extendable to k-means).
- Sections identified via heading regex (EXPERIENCE, EDUCATION, SKILLS, PROJECTS, CERTIFICATIONS, PUBLICATIONS, SUMMARY, PROFILE).

## Extensibility

- Replace `extract_skills` with ML/embedding-based similarity.
- Swap OCR engine by implementing `ocr_image_bytes` interface.
- Enable layoutparser: set `ENABLE_LAYOUT=1` env var after installing models.

## Limitations / Edge Cases

- Encrypted PDFs: currently skipped with warning.
- Rotated pages: automatic rotation attempt (PyMuPDF provides rotation metadata).
- Very complex tables: may need Camelot + Ghostscript.
- Mixed-image + vector pages: page-level classification heuristic can be added.

## Example JSON (truncated)

```json
{
  "metadata": { "file": "resume.pdf", "pages": 2 },
  "sections": { "EXPERIENCE": "...", "EDUCATION": "..." },
  "skills": ["Python", "React", "SQL"],
  "strategy": "digital"
}
```

## Roadmap

- Add page-level classifier (digital vs scanned).
- Implement fuzzy skill expansion via embeddings.
- Add concurrency for multi-page OCR.
- Include pytest unit tests and sample fixtures.

## License

Internal educational capstone use.
