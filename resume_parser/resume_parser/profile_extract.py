"""Structured extraction of education, experience, projects, and interests
from segmented resume sections.

Each extractor returns data shaped to match the mobile-app profile schema so
the API response can be merged directly into the Supabase row.
"""
from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_MONTHS = (
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
_DATE_PART = rf"(?:{_MONTHS})\.?\s*\d{{2,4}}|\d{{4}}"
_DATE_RANGE_RE = re.compile(
    rf"(?P<range>(?P<start>{_DATE_PART})\s*(?:[-\u2013\u2014~]|to)\s*(?P<end>(?:present|current|now|ongoing)|{_DATE_PART}))",
    re.I,
)
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")
_URL_RE = re.compile(r"https?://\S+", re.I)
_BULLET_RE = re.compile(
    r"^\s*(?:[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25CB\u25AA\u25AB\-\*\xB7]+\s*)+"
)
_DEGREE_RE = re.compile(
    r"\b("
    r"b\.?s\.?|b\.?a\.?|b\.?sc|b\.?eng|"
    r"m\.?s\.?|m\.?a\.?|m\.?sc|m\.?eng|mba|"
    r"ph\.?d\.?|doctorate|"
    r"bachelor(?:'?s)?|master(?:'?s)?|associate(?:'?s)?|"
    r"diploma|certificate"
    r")\b",
    re.I,
)
_SCHOOL_HINT_RE = re.compile(
    r"\b(university|college|institute|school|polytechnic|academy|"
    r"universit(?:y|é|ät|ad)|escola|faculdade)\b",
    re.I,
)
_COMPANY_SUFFIXES = re.compile(
    r"\b(inc\.?|llc|ltd\.?|corp\.?|co\.?|gmbh|s\.?a\.?|pvt\.?|group|labs?)\b",
    re.I,
)

# Patterns for lines that are just locations or just date ranges (not job headers)
_LOCATION_ONLY_RE = re.compile(
    r"^[A-Z][a-zA-Z .'-]+,\s*(?:[A-Z]{2}|[A-Za-z]+)$"
)
_SINGLE_DATE_RE = re.compile(
    rf"^\s*(?:(?:{_MONTHS})\.?\s*\d{{2,4}}|\d{{4}})\s*$",
    re.I,
)
_DATE_ONLY_RE = re.compile(
    rf"^\s*(?:(?:{_MONTHS})\.?\s*\d{{0,4}}|\d{{4}})\s*(?:[-\u2013\u2014~]|to)\s*(?:(?:{_MONTHS})\.?\s*\d{{0,4}}|\d{{4}}|present|current|now|ongoing)\s*$",
    re.I,
)
# Lines that look like a tech-stack list (comma-separated short tokens, no sentence-ending punctuation)
_TECH_LIST_RE = re.compile(
    r"^[A-Za-z0-9#+.\-]+(?:\s+[A-Za-z0-9#+.\-]+)?" \
    r"(?:\s*,\s*[A-Za-z0-9#+.\-]+(?:\s+[A-Za-z0-9#+.\-]+)?){1,}$"
)

_INTEREST_LABEL_RE = re.compile(
    r"^(?:interests?|activities|hobbies|extracurricular)\s*:?\s*",
    re.I,
)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def _is_bullet(line: str) -> bool:
    return bool(_BULLET_RE.match(line))


def _strip_bullet(line: str) -> str:
    return _clean(_BULLET_RE.sub("", line))


def _split_separators(s: str) -> List[str]:
    """Split on pipe, em-dash, en-dash — common resume header delimiters."""
    parts = re.split(r"\s*(?:\||\u2014|\u2013)\s*", s)
    return [_clean(p) for p in parts if _clean(p)]


def _extract_duration(line: str) -> Tuple[str, str]:
    """Return (duration_string, line_without_duration)."""
    m = _DATE_RANGE_RE.search(line)
    if m:
        dur = _clean(m.group("range"))
        rest = _clean(line[: m.start()] + " " + line[m.end() :])
        return dur, rest
    return "", line


def _uid() -> str:
    return uuid.uuid4().hex[:12]


# ---------------------------------------------------------------------------
# Interests
# ---------------------------------------------------------------------------

def extract_interests(sections: Dict[str, str], _full_text: str = "") -> List[str]:
    raw = (
        sections.get("INTERESTS")
        or sections.get("ACTIVITIES")
        or sections.get("HOBBIES")
        or ""
    )
    if not raw:
        return []

    tokens: List[str] = []
    for line in raw.splitlines():
        line = _clean(line)
        if not line:
            continue
        line = _INTEREST_LABEL_RE.sub("", line)
        parts = re.split(r"[\u2022\u2023\u25E6\u2043\u2219\-\*\xB7\|,;/]+", line)
        for p in parts:
            t = _clean(p)
            if 2 <= len(t) <= 80:
                tokens.append(t)

    seen: set[str] = set()
    out: List[str] = []
    for t in tokens:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out[:50]


# ---------------------------------------------------------------------------
# Education
# ---------------------------------------------------------------------------

def extract_education(sections: Dict[str, str]) -> List[Dict[str, Any]]:
    text = sections.get("EDUCATION", "")
    if not text:
        return []

    entries: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    for raw_line in text.splitlines():
        line = _clean(raw_line)
        if not line:
            continue

        is_bull = _is_bullet(line)
        stripped = _strip_bullet(line) if is_bull else line

        duration, remainder = _extract_duration(stripped)

        has_school = bool(_SCHOOL_HINT_RE.search(remainder))
        has_degree = bool(_DEGREE_RE.search(remainder))
        has_year   = bool(_YEAR_RE.search(line))

        # Decide whether to start a new entry
        if has_school or (has_degree and current is None):
            current = {"id": _uid(), "school": "", "degree": "", "year": ""}
            entries.append(current)

        if current is None:
            current = {"id": _uid(), "school": "", "degree": "", "year": ""}
            entries.append(current)

        parts = _split_separators(remainder)

        # Assign duration
        if duration and not current.get("year"):
            current["year"] = duration
        elif has_year and not current.get("year"):
            yrs = _YEAR_RE.findall(line)
            if yrs:
                current["year"] = " - ".join([yrs[0], yrs[-1]]) if len(yrs) > 1 else yrs[0]

        # Assign fields heuristically
        if parts:
            for p in parts:
                p_clean = _clean(p)
                if not p_clean:
                    continue
                if _SCHOOL_HINT_RE.search(p_clean) and not current["school"]:
                    current["school"] = p_clean
                elif (_DEGREE_RE.search(p_clean) or has_degree) and not current["degree"]:
                    current["degree"] = p_clean
                elif not current["school"]:
                    current["school"] = p_clean
                elif not current["degree"]:
                    current["degree"] = p_clean

    return [
        e for e in entries
        if _clean(e.get("school", "")) or _clean(e.get("degree", ""))
    ][:10]


# ---------------------------------------------------------------------------
# Experience
# ---------------------------------------------------------------------------

def extract_experience(sections: Dict[str, str]) -> List[Dict[str, Any]]:
    text = sections.get("EXPERIENCE", "")
    if not text:
        return []

    jobs: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    for raw_line in text.splitlines():
        line = _clean(raw_line)
        if not line:
            continue

        is_bull = _is_bullet(line)
        stripped = _strip_bullet(line) if is_bull else line

        duration, remainder = _extract_duration(stripped)

        # Skip lines that are just a location ("Hamilton, ON") or solo date range
        if not is_bull and _LOCATION_ONLY_RE.match(stripped):
            # Attach location to current job if we have one
            if current is not None and not current.get("_location"):
                current["_location"] = stripped
            continue
        if not is_bull and _DATE_ONLY_RE.match(stripped):
            if current is not None and not current["duration"]:
                current["duration"] = duration or stripped
            continue
        if not is_bull and _SINGLE_DATE_RE.match(stripped):
            continue

        # Header heuristic: short, non-bullet, may have duration or company suffix
        word_count = len(remainder.split())
        looks_header = (
            not is_bull
            and (
                bool(duration)
                or bool(_COMPANY_SUFFIXES.search(remainder))
                or (word_count <= 12 and not remainder.endswith("."))
            )
        )

        if looks_header and not is_bull:
            parts = _split_separators(remainder)
            company = parts[0] if parts else remainder
            position = parts[1] if len(parts) > 1 else ""

            # Some resumes put position first (short) and company second (has suffix)
            if len(parts) == 2 and _COMPANY_SUFFIXES.search(parts[1]) and not _COMPANY_SUFFIXES.search(parts[0]):
                company, position = parts[1], parts[0]

            current = {
                "id": _uid(),
                "company": company,
                "position": position,
                "duration": duration,
                "description": "",
            }
            jobs.append(current)
            continue

        # Description line
        if current is None:
            current = {"id": _uid(), "company": "", "position": "", "duration": "", "description": ""}
            jobs.append(current)

        if duration and not current["duration"]:
            current["duration"] = duration

        desc = stripped
        if not desc:
            continue
        if current["description"]:
            current["description"] += "\n" + desc
        else:
            current["description"] = desc

    # Strip internal keys before returning
    for j in jobs:
        j.pop("_location", None)
    return [
        j for j in jobs
        if _clean(j.get("company", ""))
        or _clean(j.get("position", ""))
        or _clean(j.get("description", ""))
    ][:20]


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

def extract_projects(sections: Dict[str, str]) -> List[Dict[str, Any]]:
    text = sections.get("PROJECTS", sections.get("PROJECT", ""))
    if not text:
        return []

    projects: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    for raw_line in text.splitlines():
        line = _clean(raw_line)
        if not line:
            continue

        is_bull = _is_bullet(line)
        stripped = _strip_bullet(line) if is_bull else line

        url_m = _URL_RE.search(stripped)
        url = url_m.group(0) if url_m else ""
        stripped_wo = _clean(_URL_RE.sub("", stripped)) if url else stripped

        # Skip lines that are just a location or a date range — not project names
        if not is_bull and _LOCATION_ONLY_RE.match(stripped_wo):
            continue
        if not is_bull and (_DATE_ONLY_RE.match(stripped_wo) or _SINGLE_DATE_RE.match(stripped_wo)):
            continue
        # Also skip if the entire stripped content is a bare date range
        dur, remainder_check = _extract_duration(stripped_wo)
        if dur and not _clean(remainder_check):
            continue

        # Tech-stack lines ("Java, Spring Boot, PostgreSQL") should be description, not a new header
        is_tech_list = bool(_TECH_LIST_RE.match(stripped_wo))

        headerish = (
            not is_bull
            and not is_tech_list
            and len(stripped_wo.split()) <= 12
            and not stripped_wo.endswith(".")
        )

        if headerish:
            parts = _split_separators(stripped_wo)
            name = parts[0] if parts else stripped_wo
            desc = " – ".join(parts[1:]) if len(parts) > 1 else ""
            current = {"id": _uid(), "name": name, "description": desc, "link": url}
            projects.append(current)
            continue

        if current is None:
            current = {"id": _uid(), "name": "", "description": "", "link": url}
            projects.append(current)

        if url and not current.get("link"):
            current["link"] = url

        if current["description"]:
            current["description"] += "\n" + stripped_wo
        else:
            current["description"] = stripped_wo

    return [
        p for p in projects
        if _clean(p.get("name", "")) or _clean(p.get("description", ""))
    ][:20]


# ---------------------------------------------------------------------------
# Public convenience wrapper
# ---------------------------------------------------------------------------

def extract_profile_fields(full_text: str, sections: Dict[str, str]) -> Dict[str, Any]:
    """Return all structured profile fields in one call.

    Keys match the mobile-app / Supabase schema:
      interests, education, experience, personal_projects
    """
    return {
        "interests": extract_interests(sections, full_text),
        "education": extract_education(sections),
        "experience": extract_experience(sections),
        "personal_projects": extract_projects(sections),
    }
