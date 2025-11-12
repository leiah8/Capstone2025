from __future__ import annotations
import io
from typing import Dict, Any, List
from PIL import Image, ImageFilter
import fitz  # PyMuPDF
try:
    import pytesseract
except ImportError:  # pragma: no cover
    pytesseract = None  # type: ignore


def _preprocess(img: Image.Image) -> Image.Image:
    # Basic clean-up: convert to L, increase contrast via point, optional median filter
    gray = img.convert("L")
    # Simple thresholding heuristic
    bw = gray.point(lambda x: 0 if x < 180 else 255, '1')
    # De-speckle a bit
    cleaned = bw.filter(ImageFilter.MedianFilter(size=3))
    return cleaned


def ocr_page_images(pdf_path: str) -> Dict[str, Any]:
    """Render pages to images and run Tesseract OCR.

    Returns dict with pages (list), full_text (str)
    """
    if pytesseract is None:
        raise RuntimeError("pytesseract not installed; install it or choose another OCR engine.")

    doc = fitz.open(pdf_path)
    pages: List[dict] = []
    all_text_parts: List[str] = []

    for pno, page in enumerate(doc):
        pix = page.get_pixmap(dpi=300)  # High enough for OCR
        img = Image.open(io.BytesIO(pix.tobytes()))
        processed = _preprocess(img)
        text = pytesseract.image_to_string(processed)
        text = text.strip()
        if text:
            all_text_parts.append(text)
        pages.append({
            "number": pno + 1,
            "ocr_text": text,
        })

    full_text = "\n\n".join(all_text_parts).strip()
    doc.close()
    return {
        "pages": pages,
        "full_text": full_text,
        "char_count": len(full_text),
    }
