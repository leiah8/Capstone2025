from __future__ import annotations
from typing import Dict, Any, List
import pdfplumber


def extract_tables(pdf_path: str, max_pages: int | None = None) -> List[Dict[str, Any]]:
    """Extract simple tables via pdfplumber. Returns list of tables with page number and rows.

    Each table dict: {"page": int, "rows": [[col,...], ...]}.
    """
    tables: List[Dict[str, Any]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages):
            if max_pages is not None and pno >= max_pages:
                break
            for tbl in page.extract_tables() or []:
                # Normalize empty cells
                norm_rows = [[(cell or "").strip() for cell in row] for row in tbl]
                if any(any(c for c in row) for row in norm_rows):
                    tables.append({
                        "page": pno + 1,
                        "rows": norm_rows,
                    })
    return tables
