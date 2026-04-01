from __future__ import annotations

import base64
import json
import mimetypes
import os
from typing import Any, Dict, Iterable, List, Literal
from urllib.parse import urlparse

from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field

from . import __version__

DEFAULT_MODEL = "g" + "pt-5.4"


def _emit(message: str) -> None:
    print(message, flush=True)


class ResumeParserConfigError(RuntimeError):
    """Raised when the parser is missing required configuration."""


class ResumeLinks(BaseModel):
    model_config = ConfigDict(extra="forbid")

    github: str = ""
    linkedin: str = ""
    instagram: str = ""
    twitter: str = ""
    portfolio: str = ""
    other: str = ""


class EducationEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    school: str = ""
    degree: str = ""
    year: str = ""


class ExperienceEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company: str = ""
    position: str = ""
    duration: str = ""
    description: str = ""


class ProjectEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = ""
    description: str = ""
    link: str = ""


class ResumeExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bio: str = ""
    location: str = ""
    links: ResumeLinks = Field(default_factory=ResumeLinks)
    skills: List[str] = Field(default_factory=list)
    interests: List[str] = Field(default_factory=list)
    education: List[EducationEntry] = Field(default_factory=list)
    experience: List[ExperienceEntry] = Field(default_factory=list)
    personal_projects: List[ProjectEntry] = Field(default_factory=list)


class ResumeParser:
    SYSTEM_PROMPT = (
        "You extract candidate profile data from resumes and CVs for a student "
        "collaboration app. Return only information grounded in the document. "
        "Do not invent employers, degrees, dates, skills, projects, links, "
        "or locations. If a field is missing or uncertain, use an empty string "
        "or an empty array. Keep descriptions concise and factual. Make sure to remove any duplicated content that may appear in the resume. Always return valid JSON that matches the provided schema."
    )

    USER_PROMPT = """
Extract the resume into the provided JSON schema.

Rules:
- `bio`: Write a concise 1-3 sentence profile summary grounded only in the resume. Prefer an explicit summary/objective/profile section when present. Otherwise synthesize from explicit experience, education, and projects.
- `location`: Return the candidate's most specific current location from the resume, such as "Toronto, ON" or "Hamilton, Ontario, Canada". Leave empty if missing.
- `links`: Map public URLs into the right buckets. Use `portfolio` for a personal site or portfolio. Use `other` for an important professional URL that does not fit another bucket. Leave missing buckets empty.
- `skills`: Include concrete technical or professional skills, tools, frameworks, languages, methods, and domains explicitly supported by the resume. Deduplicate.
- `interests`: Include hobbies, extracurriculars, or clearly stated professional interests that are explicitly supported by the resume. Do not repeat skills unless they are clearly framed as interests.
- `education`: One entry per education item. Put the institution in `school`, the program/degree/major in `degree`, and the year or date range in `year`. Return exactly one object per school/program combination. Do not create separate entries for coursework bullets, relevant courses, locations, awards, or notes.
- `experience`: One entry per work, internship, research, or leadership role. Put employer or organization in `company`, title in `position`, dates in `duration`, and a compact description capturing the strongest responsibilities or outcomes in `description`. Return exactly one object per role. Do not create separate entries for bullet points or accomplishments belonging to that role.
- `personal_projects`: Include named personal, academic, hackathon, or side projects that are distinct enough to stand alone in a profile. Put the project title in `name`, a concise factual summary in `description`, and a public project/demo/repo URL in `link` when present.
- Never start a field with a bullet marker or OCR artifact. For example, do not return values beginning with `e`, `•`, `-`, or similar bullet debris.

Examples:
- If the resume shows `McMaster University`, `B.A.Sc. Computer Science Co-op`, and `September 2021 - June 2026`, return one education object with those three values split into `school`, `degree`, and `year`.
- If a role has multiple bullet points under `ODAIA Intelligence Inc.`, return one experience object for that role and summarize those bullets inside a single `description` field.

Ordering:
- Return education, experience, and projects in reverse chronological order when the resume makes that clear.
- Prefer fewer high-quality items over speculative ones.
""".strip()

    RESPONSE_SCHEMA: Dict[str, Any] = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "bio": {"type": "string"},
            "location": {"type": "string"},
            "links": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "github": {"type": "string"},
                    "linkedin": {"type": "string"},
                    "instagram": {"type": "string"},
                    "twitter": {"type": "string"},
                    "portfolio": {"type": "string"},
                    "other": {"type": "string"},
                },
                "required": [
                    "github",
                    "linkedin",
                    "instagram",
                    "twitter",
                    "portfolio",
                    "other",
                ],
            },
            "skills": {
                "type": "array",
                "items": {"type": "string"},
            },
            "interests": {
                "type": "array",
                "items": {"type": "string"},
            },
            "education": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "school": {"type": "string"},
                        "degree": {"type": "string"},
                        "year": {"type": "string"},
                    },
                    "required": ["school", "degree", "year"],
                },
            },
            "experience": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "company": {"type": "string"},
                        "position": {"type": "string"},
                        "duration": {"type": "string"},
                        "description": {"type": "string"},
                    },
                    "required": [
                        "company",
                        "position",
                        "duration",
                        "description",
                    ],
                },
            },
            "personal_projects": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "link": {"type": "string"},
                    },
                    "required": ["name", "description", "link"],
                },
            },
        },
        "required": [
            "bio",
            "location",
            "links",
            "skills",
            "interests",
            "education",
            "experience",
            "personal_projects",
        ],
    }

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        reasoning_effort: str | None,
        timeout_seconds: float,
    ) -> None:
        self.model = model
        self.reasoning_effort = reasoning_effort
        self.timeout_seconds = timeout_seconds
        self.client = OpenAI(api_key=api_key, timeout=timeout_seconds)

    @classmethod
    def from_env(cls) -> "ResumeParser":
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise ResumeParserConfigError("OPENAI_API_KEY is not set.")

        model = (
            os.getenv("OPENAI_RESUME_PARSER_MODEL", DEFAULT_MODEL).strip()
            or DEFAULT_MODEL
        )
        reasoning_effort = os.getenv("OPENAI_REASONING_EFFORT", "medium").strip().lower()
        if reasoning_effort in {"", "none", "off"}:
            reasoning_effort = None

        timeout_raw = os.getenv("OPENAI_TIMEOUT_SECONDS", "180").strip()
        try:
            timeout_seconds = float(timeout_raw)
        except ValueError as exc:
            raise ResumeParserConfigError(
                "OPENAI_TIMEOUT_SECONDS must be a number."
            ) from exc

        return cls(
            api_key=api_key,
            model=model,
            reasoning_effort=reasoning_effort,
            timeout_seconds=timeout_seconds,
        )

    def parse_local_file(self, file_path: str) -> Dict[str, Any]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(file_path)

        filename = os.path.basename(file_path)
        mime_type = _guess_mime_type(filename)

        with open(file_path, "rb") as handle:
            encoded = base64.b64encode(handle.read()).decode("utf-8")

        file_input = {
            "type": "input_file",
            "filename": filename,
            "file_data": f"data:{mime_type};base64,{encoded}",
        }
        return self._parse(file_input, source_type="upload", source_name=filename)

    def parse_remote_file(self, file_url: str) -> Dict[str, Any]:
        file_url = file_url.strip()
        if not file_url:
            raise ValueError("Missing file URL.")

        source_name = _filename_from_url(file_url) or "remote-resume"
        file_input = {
            "type": "input_file",
            "file_url": file_url,
        }
        return self._parse(file_input, source_type="url", source_name=source_name)

    def _parse(
        self,
        file_input: Dict[str, str],
        *,
        source_type: Literal["upload", "url"],
        source_name: str,
    ) -> Dict[str, Any]:
        request: Dict[str, Any] = {
            "model": self.model,
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": self.SYSTEM_PROMPT},
                        {"type": "input_text", "text": self.USER_PROMPT},
                        file_input,
                    ],
                }
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "resume_profile",
                    "strict": True,
                    "schema": self.RESPONSE_SCHEMA,
                }
            },
        }
        if self.reasoning_effort:
            request["reasoning"] = {"effort": self.reasoning_effort}

        response = self.client.responses.create(**request)
        raw_output = (response.output_text or "").strip()
        _emit(
            "[ResumeParser] Raw OpenAI output for %s (%s):\n%s"
            % (source_name, source_type, raw_output or "<empty>")
        )
        if not raw_output:
            raise RuntimeError("OpenAI did not return structured resume data.")

        parsed = ResumeExtraction.model_validate_json(raw_output)
        normalized = _normalize_response(
            parsed,
            model=self.model,
            source_name=source_name,
            source_type=source_type,
        )
        _emit(
            "[ResumeParser] Normalized output for %s (%s):\n%s"
            % (
                source_name,
                source_type,
                json.dumps(normalized, ensure_ascii=False, indent=2),
            )
        )
        return normalized


def _normalize_response(
    parsed: ResumeExtraction,
    *,
    model: str,
    source_name: str,
    source_type: str,
) -> Dict[str, Any]:
    payload = parsed.model_dump()

    payload["bio"] = _clean_text(payload.get("bio", ""))
    payload["location"] = _clean_text(payload.get("location", ""))
    payload["links"] = {
        key: _normalize_url(value)
        for key, value in ResumeLinks(**payload.get("links", {})).model_dump().items()
    }
    payload["skills"] = _dedupe_strings(payload.get("skills", []), limit=30)
    payload["interests"] = _dedupe_strings(payload.get("interests", []), limit=20)
    payload["education"] = _normalize_education(payload.get("education", []))
    payload["experience"] = _normalize_experience(payload.get("experience", []))
    payload["personal_projects"] = _normalize_projects(
        payload.get("personal_projects", [])
    )

    payload["metadata"] = {
        "provider": "openai",
        "model": model,
        "parser_version": __version__,
        "source_type": source_type,
        "source_name": source_name,
    }

    return payload


def _normalize_education(items: Iterable[Dict[str, Any]]) -> List[Dict[str, str]]:
    normalized: List[Dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    for item in items:
        school = _clean_text(item.get("school", ""))
        degree = _clean_text(item.get("degree", ""))
        year = _clean_text(item.get("year", ""))

        if not any((school, degree, year)):
            continue

        fingerprint = (school.lower(), degree.lower(), year.lower())
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        normalized.append({"school": school, "degree": degree, "year": year})

    return normalized[:10]


def _normalize_experience(items: Iterable[Dict[str, Any]]) -> List[Dict[str, str]]:
    normalized: List[Dict[str, str]] = []
    seen: set[tuple[str, str, str, str]] = set()

    for item in items:
        company = _clean_text(item.get("company", ""))
        position = _clean_text(item.get("position", ""))
        duration = _clean_text(item.get("duration", ""))
        description = _clean_text(item.get("description", ""))

        if not any((company, position, duration, description)):
            continue

        fingerprint = (
            company.lower(),
            position.lower(),
            duration.lower(),
            description.lower(),
        )
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        normalized.append(
            {
                "company": company,
                "position": position,
                "duration": duration,
                "description": description,
            }
        )

    return normalized[:12]


def _normalize_projects(items: Iterable[Dict[str, Any]]) -> List[Dict[str, str]]:
    normalized: List[Dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    for item in items:
        name = _clean_text(item.get("name", ""))
        description = _clean_text(item.get("description", ""))
        link = _normalize_url(item.get("link", ""))
        if not any((name, description, link)):
            continue

        fingerprint = (name.lower(), description.lower(), link.lower())
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        normalized.append(
            {
                "name": name,
                "description": description,
                "link": link,
            }
        )

    return normalized[:10]


def _dedupe_strings(values: Iterable[str], *, limit: int) -> List[str]:
    cleaned: List[str] = []
    seen: set[str] = set()

    for value in values:
        text = _clean_text(value)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
        if len(cleaned) >= limit:
            break

    return cleaned


def _clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""

    text = " ".join(value.split()).strip()
    return text.strip(" |,;")


def _normalize_url(value: Any) -> str:
    text = _clean_text(value)
    if not text:
        return ""

    text = text.rstrip(".,);")
    lowered = text.lower()
    if "://" in text:
        return text
    if text.startswith("www."):
        return f"https://{text}"
    if (
        lowered.startswith("github.com/")
        or lowered.startswith("linkedin.com/")
        or lowered.startswith("twitter.com/")
        or lowered.startswith("x.com/")
        or lowered.startswith("instagram.com/")
    ):
        return f"https://{text}"
    if "." in text and " " not in text and "@" not in text:
        return f"https://{text}"
    return text


def _guess_mime_type(filename: str) -> str:
    mime_type, _ = mimetypes.guess_type(filename)
    return mime_type or "application/octet-stream"


def _filename_from_url(url: str) -> str:
    try:
        path = urlparse(url).path
    except ValueError:
        return ""
    return os.path.basename(path)
