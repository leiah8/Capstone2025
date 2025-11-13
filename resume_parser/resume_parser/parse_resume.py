from __future__ import annotations
import argparse
import json
import os
from typing import Any, Dict

from .extraction_text import extract_with_layout
from .extraction_ocr import ocr_page_images
from .layout_segment import segment_sections_from_text
from .table_extraction import extract_tables
from .utils import extract_skills


DIGITAL_TEXT_MIN_CHARS = 50  # If fewer than this, treat as scanned and do OCR


def parse_resume(file_path: str, ocr_threshold: int = DIGITAL_TEXT_MIN_CHARS) -> Dict[str, Any]:
    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    # 1) Try digital extraction first
    digital = extract_with_layout(file_path)
    full_text = digital.get("full_text", "")
    is_scanned = len(full_text) < ocr_threshold

    strategy = "digital"
    if is_scanned:
        # 2) Fallback OCR
        ocr = ocr_page_images(file_path)
        full_text = ocr.get("full_text", "")
        strategy = "ocr"
        pages = [
            {
                "number": i + 1,
                "text": p.get("ocr_text", ""),
                "blocks": [],
            }
            for i, p in enumerate(ocr.get("pages", []))
        ]
    else:
        pages = [
            {
                "number": p.get("number"),
                "text": p.get("text", ""),
                "blocks": p.get("blocks", []),
            }
            for p in digital.get("pages", [])
        ]

    # 3) Sections
    sections = segment_sections_from_text(full_text)

    # 4) Tables
    tables = extract_tables(file_path)

    # 5) Skills (placeholder)
    skills = extract_skills(full_text, sections)

    result: Dict[str, Any] = {
        "metadata": {
            "file": os.path.basename(file_path),
            "pages": len(pages),
        },
        "strategy": strategy,
        "text": {
            "full": full_text,
            "pages": [p.get("text", "") for p in pages],
        },
        "sections": sections,
        "tables": tables,
        "skills": skills,
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse a resume PDF into structured JSON")
    parser.add_argument("--file", required=True, help="Path to the resume PDF")
    parser.add_argument("--json", dest="json_out", default=None, help="Optional path to write JSON output")
    parser.add_argument("--threshold", type=int, default=DIGITAL_TEXT_MIN_CHARS, help="Min chars to treat as digital")
    args = parser.parse_args()

    out = parse_resume(args.file, ocr_threshold=args.threshold)

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print(f"Wrote: {args.json_out}")
    else:
        print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
