from __future__ import annotations
import re
from typing import List

HEADING_PATTERN = re.compile(r"^(?:experience|education|skills?|technical skills|technologies|tech stack|tools|projects?|certifications?|publications?|summary|profile|awards?)$", re.I)

SKILL_KEYWORDS = {
    # Languages
    "python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "ruby", "php", "rust", "swift", "kotlin",
    # Web / frontend
    "react", "react native", "next.js", "vue", "angular", "html", "css", "graphql", "redux", "tailwind",
    # Backend / data
    "node", "express", "django", "flask", "fastapi", "spring", ".net", "laravel", "rails", "postgres", "mysql", "mongodb", "sqlite", "redis",
    # Cloud / devops
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ansible", "ci/cd", "gitlab ci", "github actions",
    # Data / ML
    "pandas", "numpy", "scikit-learn", "pytorch", "tensorflow", "matplotlib", "seaborn",
    # Testing / tools
    "jest", "pytest", "cypress", "playwright", "git", "linux", "jira",
}

# Canonical casing map for common technologies and acronyms
CANONICAL_SKILL_CASE = {
    # Languages / acronyms
    "html": "HTML",
    "css": "CSS",
    "sql": "SQL",
    "aws": "AWS",
    "gcp": "GCP",
    "ci/cd": "CI/CD",
    "c#": "C#",
    "c++": "C++",
    ".net": ".NET",
    # JS/TS and frameworks
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "node": "Node.js",
    "next.js": "Next.js",
    "react": "React",
    "react native": "React Native",
    "vue": "Vue",
    "angular": "Angular",
    "graphql": "GraphQL",
    # Databases / tooling
    "postgres": "PostgreSQL",
    "mysql": "MySQL",
    "mongodb": "MongoDB",
    "sqlite": "SQLite",
    "redis": "Redis",
    # Python libs / ML
    "numpy": "NumPy",
    "pandas": "Pandas",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "scikit-learn": "scikit-learn",
    # Test / tools
    "jest": "Jest",
    "pytest": "Pytest",
    "cypress": "Cypress",
    "playwright": "Playwright",
    "linux": "Linux",
    "jira": "Jira",
}

def canonicalize_skill(name: str) -> str:
    n = re.sub(r"\s+", " ", name).strip()
    key = n.lower()
    # Remove trailing punctuation common in lists
    n = n.strip('-•·*:;,.')
    # Direct map
    if key in CANONICAL_SKILL_CASE:
        return CANONICAL_SKILL_CASE[key]
    # Title-case multi-words conservatively
    # Avoid harming known lowercase brandings; default to capitalizing first letter
    words = [w for w in re.split(r"\s+", n) if w]
    if not words:
        return n
    out_words: List[str] = []
    for w in words:
        wk = w.lower()
        if wk in CANONICAL_SKILL_CASE:
            out_words.append(CANONICAL_SKILL_CASE[wk])
        elif re.fullmatch(r"[a-z]", wk):
            out_words.append(w.upper())
        else:
            out_words.append(w[0].upper() + w[1:])
    return " ".join(out_words)

def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

def is_heading(line: str) -> bool:
    return bool(HEADING_PATTERN.match(line.strip().lower()))

LABEL_PREFIX_RE = re.compile(
    r"^(?:skills?|technical skills|technologies|tech stack|tools|languages?|frameworks?|libraries?|platforms?|databases?|devops|cloud)\s*:\s*",
    re.I,
)

def _strip_label_prefix(s: str) -> str:
    return LABEL_PREFIX_RE.sub("", s).strip()

def _tokenize_skill_line(line: str) -> List[str]:
    # Remove common label prefixes like "Languages:", "Frameworks:", etc.
    line = _strip_label_prefix(line)
    # Split on common delimiters and bullets
    parts = re.split(r"[\u2022\u2023\u25E6\u2043\u2219\-\•\·\*\|,;/\n]+", line)
    tokens: List[str] = []
    for p in parts:
        t = _strip_label_prefix(p)
        t = re.sub(r"\s+", " ", t).strip().strip('-•·*:;,.')
        if len(t) >= 2:
            tokens.append(t)
    return tokens

def extract_skills(all_text: str, sections: dict | None = None) -> List[str]:
    """Heuristic skills extraction.
    1) Parse a dedicated skills-like section by tokenizing.
    2) Fallback: keyword scan over full text.
    """
    candidates: List[str] = []

    # 1) Section-based
    if sections:
        # consider synonyms
        for key in list(sections.keys()):
            key_norm = key.strip().upper()
            if key_norm in {"SKILLS", "TECHNICAL SKILLS", "TECHNOLOGIES", "TOOLS", "TECH STACK"}:
                for line in sections[key].splitlines():
                    for tok in _tokenize_skill_line(line):
                        candidates.append(tok)

    # 2) Keyword scanning across all text
    lowered = all_text.lower()
    for kw in sorted(SKILL_KEYWORDS):
        if re.search(rf"\b{re.escape(kw)}\b", lowered):
            candidates.append(kw)

    # Normalize, canonicalize, dedupe (case-insensitive), keep order
    seen = set()
    out: List[str] = []
    for c in candidates:
        c_norm = canonicalize_skill(c)
        if not c_norm:
            continue
        key = c_norm.lower()
        if key not in seen:
            seen.add(key)
            out.append(c_norm)
    # Bound size
    return out[:100]
