from __future__ import annotations
import fitz  # PyMuPDF
from typing import Dict, Any, List


def _sort_blocks_two_columns(blocks: List[dict], page_width: float) -> List[dict]:
    """
    Simple two-column ordering heuristic: left column (x0 < mid) top-to-bottom, then right column.
    Falls back to global top-to-bottom if distribution isn't clearly two-column.
    """
    if not blocks:
        return blocks

    mid = page_width / 2.0
    left = [b for b in blocks if b["bbox"][0] < mid]
    right = [b for b in blocks if b["bbox"][0] >= mid]

    # If one side is nearly empty, just sort by y then x globally
    if min(len(left), len(right)) < max(2, int(0.15 * len(blocks))):
        return sorted(blocks, key=lambda b: (b["bbox"][1], b["bbox"][0]))

    left_sorted = sorted(left, key=lambda b: (b["bbox"][1], b["bbox"][0]))
    right_sorted = sorted(right, key=lambda b: (b["bbox"][1], b["bbox"][0]))
    return left_sorted + right_sorted


def extract_with_layout(pdf_path: str) -> Dict[str, Any]:
    """Extract text and layout blocks using PyMuPDF.

    Returns:
        dict with keys: pages (list), full_text (str), char_count (int)
    """
    doc = fitz.open(pdf_path)
    pages: List[dict] = []
    all_text_parts: List[str] = []

    for pno, page in enumerate(doc):
        w, h = page.rect.width, page.rect.height
        # Prefer rawdict for blocks/lines/spans when available
        raw = page.get_text("rawdict")
        blocks: List[dict] = []
        page_text_parts: List[str] = []

        for b in raw.get("blocks", []):
            if b.get("type", 0) != 0:  # 0=text, 1=image
                continue
            bbox = b.get("bbox", [0, 0, 0, 0])
            # Concatenate line->span text
            blk_text_parts: List[str] = []
            for line in b.get("lines", []):
                line_text_parts: List[str] = []
                for span in line.get("spans", []):
                    t = span.get("text", "")
                    if t:
                        line_text_parts.append(t)
                if line_text_parts:
                    blk_text_parts.append("".join(line_text_parts))
            blk_text = "\n".join(blk_text_parts).strip()
            if blk_text:
                blocks.append({
                    "bbox": bbox,
                    "text": blk_text,
                })
                page_text_parts.append(blk_text)

        # Order blocks with a simple multi-column heuristic
        blocks = _sort_blocks_two_columns(blocks, page_width=w)

        # Concatenate page text in block order
        ordered_text = []
        for b in blocks:
            ordered_text.append(b["text"].strip())
        page_text = "\n\n".join([t for t in ordered_text if t])
        if page_text:
            all_text_parts.append(page_text)

        pages.append({
            "number": pno + 1,
            "size": {"width": w, "height": h},
            "blocks": blocks,
            "text": page_text,
        })

    full_text = "\n\n".join(all_text_parts).strip()
    result = {
        "pages": pages,
        "full_text": full_text,
        "char_count": len(full_text),
    }
    doc.close()
    return result
