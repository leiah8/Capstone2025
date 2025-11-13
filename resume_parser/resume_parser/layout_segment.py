from __future__ import annotations
from typing import Dict, Any, List
import re

HEADING_RE = re.compile(
    r"^(experience|education|skills?|technical skills|technologies|tech stack|tools|projects?|certifications?|publications?|summary|profile|awards?)\s*:?$",
    re.I,
)


def segment_sections_from_text(full_text: str) -> Dict[str, str]:
    """Segment text into sections using heading regex; preserves order and merges duplicates.
    Returns a dict of section_name -> text
    """
    sections: Dict[str, List[str]] = {}
    current: str | None = None

    for raw_line in full_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        m = HEADING_RE.match(line)
        if m:
            heading = m.group(1).upper()
            # Normalize synonyms to SKILLS
            if heading in {"TECHNICAL SKILLS", "TECHNOLOGIES", "TOOLS", "TECH STACK"}:
                heading = "SKILLS"
            current = heading
            sections.setdefault(current, [])
            continue
        if current is None:
            # Prepend to SUMMARY if not explicitly started
            current = "SUMMARY"
            sections.setdefault(current, [])
        sections[current].append(line)

    # Join lines
    return {k: "\n".join(v).strip() for k, v in sections.items()}
