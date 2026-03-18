"""
generate.py — Synthetic profile and project generation using Claude Haiku.

Produces:
  eval/data/profiles.json  — 60 diverse user profiles
  eval/data/projects.json  — 15 diverse projects

Usage:
  python eval/generate.py
  python eval/generate.py --force   # regenerate even if files exist
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import anthropic

DATA_DIR = Path(__file__).parent / "data"
PROFILES_FILE = DATA_DIR / "profiles.json"
PROJECTS_FILE = DATA_DIR / "projects.json"

MODEL = "claude-haiku-4-5-20251001"
MAX_RETRIES = 3
RETRY_DELAY = 2.0


# ---------------------------------------------------------------------------
# Profile batch definitions — ensures archetype diversity across 60 profiles
# ---------------------------------------------------------------------------
PROFILE_BATCHES = [
    {
        "batch_id": 0,
        "start_id": 0,
        "focus": "Web and frontend developers with varying skill levels",
        "archetypes": (
            "junior_frontend_dev (2 profiles), senior_frontend_dev (2 profiles), "
            "backend_dev (3 profiles), full_stack_dev (3 profiles)"
        ),
        "notes": "Vary bio length: 2 empty, 3 short (1 sentence), 3 medium (2–3 sentences). "
                 "Skill counts: 1–8 skills. Include React, Vue, Angular, Node.js, Express, TypeScript.",
    },
    {
        "batch_id": 1,
        "start_id": 10,
        "focus": "Machine learning and data professionals",
        "archetypes": (
            "ml_engineer (4 profiles), data_scientist (3 profiles), "
            "data_engineer (2 profiles), research_engineer (1 profile)"
        ),
        "notes": "Detailed bios typical here. Skills: Python, PyTorch, TensorFlow, scikit-learn, "
                 "SQL, Spark, Airflow, HuggingFace. Some with ML ops focus. 1 profile has empty bio.",
    },
    {
        "batch_id": 2,
        "start_id": 20,
        "focus": "Mobile and cross-platform developers",
        "archetypes": (
            "ios_dev (3 profiles), android_dev (3 profiles), "
            "react_native_dev (2 profiles), flutter_dev (2 profiles)"
        ),
        "notes": "Skills: Swift, Kotlin, Java, React Native, Flutter, Dart, Xcode, Firebase. "
                 "Vary seniority. 1 profile has only 1 skill (very junior). Some bios reference apps built.",
    },
    {
        "batch_id": 3,
        "start_id": 30,
        "focus": "Backend engineers and cloud/DevOps professionals",
        "archetypes": (
            "backend_engineer (4 profiles), devops_engineer (3 profiles), "
            "cloud_architect (2 profiles), security_engineer (1 profile)"
        ),
        "notes": "Skills: Python, Go, Rust, Java, Docker, Kubernetes, AWS, GCP, Terraform, CI/CD. "
                 "3 profiles should have 8+ skills. 1 profile has no bio.",
    },
    {
        "batch_id": 4,
        "start_id": 40,
        "focus": "Designers, product people, and non-engineering contributors",
        "archetypes": (
            "ux_designer (3 profiles), ui_designer (2 profiles), "
            "product_manager (2 profiles), technical_writer (1 profile), "
            "full_stack_dev (2 profiles)"
        ),
        "notes": "Designers have Figma, Adobe XD, CSS, prototyping — few/no coding skills. "
                 "PMs have no technical skills. This creates intentional low-match candidates "
                 "for technically-focused projects. Full-stack devs bridge the gap.",
    },
    {
        "batch_id": 5,
        "start_id": 50,
        "focus": "Edge cases and specialists: sparse profiles and niche developers",
        "archetypes": (
            "blockchain_dev (2 profiles), game_dev (2 profiles), "
            "embedded_systems_dev (1 profile), ml_engineer (1 profile), "
            "junior_dev (2 profiles, student level), "
            "completely_empty_profile (2 profiles)"
        ),
        "notes": "The 2 empty profiles have NO skills, NO interests, and NO bio — pure cold-start edge cases. "
                 "Blockchain: Solidity, Web3.js, Rust. Game dev: Unity, C#, Unreal, HLSL. "
                 "Junior devs: 1–2 skills, short uncertain bios.",
    },
]


def _call_claude(client: anthropic.Anthropic, prompt: str) -> str:
    """Call Claude Haiku and return the text response, with retries."""
    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text
        except anthropic.RateLimitError:
            wait = RETRY_DELAY * (attempt + 1)
            print(f"    Rate limited — waiting {wait}s before retry {attempt + 1}/{MAX_RETRIES}")
            time.sleep(wait)
        except anthropic.APIError as e:
            if attempt == MAX_RETRIES - 1:
                raise
            print(f"    API error ({e}) — retrying {attempt + 1}/{MAX_RETRIES}")
            time.sleep(RETRY_DELAY)
    raise RuntimeError("Max retries exceeded")


def _extract_json(text: str) -> list:
    """Extract a JSON array from Claude's response, stripping any markdown fencing."""
    text = text.strip()
    # Strip markdown code blocks if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    # Find the first [ and last ] to handle any surrounding text
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON array found in response:\n{text[:300]}")
    return json.loads(text[start : end + 1])


# ---------------------------------------------------------------------------
# Profile generation
# ---------------------------------------------------------------------------

PROFILE_SCHEMA = """{
  "id": "u_XXX",
  "name": "Full Name",
  "archetype": "archetype_slug",
  "skills": ["skill1", "skill2"],
  "interests": ["tag1", "tag2"],
  "bio": "Free-text bio (can be empty string)"
}"""


def generate_profiles(client: anthropic.Anthropic) -> list[dict]:
    all_profiles: list[dict] = []

    for batch in PROFILE_BATCHES:
        start = batch["start_id"]
        id_range = f"u_{start:03d} through u_{start + 9:03d}"

        prompt = f"""Generate exactly 10 realistic synthetic user profiles for a student software project collaboration platform.
These are university students or junior developers looking to join capstone/hackathon projects.

IDs to assign: {id_range}
Archetypal focus: {batch["focus"]}
Archetypes to include: {batch["archetypes"]}
Special notes: {batch["notes"]}

Schema for each profile:
{PROFILE_SCHEMA}

Rules:
- "id" must follow the pattern u_XXX (zero-padded, sequential from {start})
- "skills" should use realistic capitalization (e.g. "React", "Python", "TypeScript", "AWS")
- "interests" are lowercase domain tags (e.g. "machine learning", "web development", "mobile apps", "startups", "open source")
- For empty_profile archetypes: skills=[], interests=[], bio=""
- Return ONLY a valid JSON array of exactly 10 objects. No markdown, no explanation."""

        print(f"  Generating profile batch {batch['batch_id'] + 1}/6 (IDs {id_range})...")

        for attempt in range(MAX_RETRIES):
            try:
                raw = _call_claude(client, prompt)
                batch_profiles = _extract_json(raw)
                if len(batch_profiles) != 10:
                    raise ValueError(f"Expected 10 profiles, got {len(batch_profiles)}")
                all_profiles.extend(batch_profiles)
                print(f"    ✓ {len(batch_profiles)} profiles generated")
                break
            except (ValueError, json.JSONDecodeError) as e:
                if attempt == MAX_RETRIES - 1:
                    raise RuntimeError(f"Failed to parse profile batch {batch['batch_id']}: {e}")
                print(f"    Parse error — retrying ({attempt + 1}/{MAX_RETRIES}): {e}")
                time.sleep(RETRY_DELAY)

    return all_profiles


# ---------------------------------------------------------------------------
# Project generation
# ---------------------------------------------------------------------------

PROJECT_SCHEMA = """{
  "id": "p_XX",
  "name": "Project Name",
  "description": "2-4 sentence project description",
  "skills_needed": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill3"],
  "tags": ["domain_tag1", "domain_tag2"]
}"""


def generate_projects(client: anthropic.Anthropic) -> list[dict]:
    prompt = f"""Generate exactly 15 realistic software project listings for a university capstone/hackathon collaboration platform.
These are project ideas that teams are looking for contributors to help build.

IDs to assign: p_01 through p_15

Include EXACTLY this distribution:
- 3 web application projects (React/Vue frontend + backend API)
- 3 ML/AI projects (e.g. recommendation engine, NLP tool, computer vision app)
- 2 mobile app projects (iOS or Android or cross-platform)
- 2 full-stack projects with clear product descriptions
- 2 data pipeline / analytics projects
- 1 DevOps / cloud infrastructure project
- 1 blockchain / Web3 project
- 1 open-ended exploratory project with very few hard requirements (only 1-2 skills_needed)

Schema for each project:
{PROJECT_SCHEMA}

Rules:
- "skills_needed": the 2–5 must-have technical skills (realistic, capitalized)
- "nice_to_have_skills": 0–3 optional skills (can be empty list)
- "tags": 1–3 lowercase domain tags (e.g. "machine learning", "web development", "blockchain")
- "description": vary length — some projects 1 sentence (sparse), most 2–3 sentences
- Return ONLY a valid JSON array of exactly 15 objects. No markdown, no explanation."""

    print("  Generating 15 projects...")
    for attempt in range(MAX_RETRIES):
        try:
            raw = _call_claude(client, prompt)
            projects = _extract_json(raw)
            if len(projects) != 15:
                raise ValueError(f"Expected 15 projects, got {len(projects)}")
            print(f"    ✓ {len(projects)} projects generated")
            return projects
        except (ValueError, json.JSONDecodeError) as e:
            if attempt == MAX_RETRIES - 1:
                raise RuntimeError(f"Failed to parse projects: {e}")
            print(f"    Parse error — retrying ({attempt + 1}/{MAX_RETRIES}): {e}")
            time.sleep(RETRY_DELAY)

    raise RuntimeError("Max retries exceeded for project generation")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run(force: bool = False) -> tuple[list, list]:
    if not force and PROFILES_FILE.exists() and PROJECTS_FILE.exists():
        print("  Data files already exist. Use --force to regenerate.")
        with open(PROFILES_FILE) as f:
            profiles = json.load(f)
        with open(PROJECTS_FILE) as f:
            projects = json.load(f)
        print(f"  Loaded {len(profiles)} profiles and {len(projects)} projects from disk.")
        return profiles, projects

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("Generating profiles...")
    profiles = generate_profiles(client)
    PROFILES_FILE.write_text(json.dumps(profiles, indent=2))
    print(f"  Saved {len(profiles)} profiles → {PROFILES_FILE}")

    print("Generating projects...")
    projects = generate_projects(client)
    PROJECTS_FILE.write_text(json.dumps(projects, indent=2))
    print(f"  Saved {len(projects)} projects → {PROJECTS_FILE}")

    return profiles, projects


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic profiles and projects")
    parser.add_argument("--force", action="store_true", help="Regenerate even if files exist")
    args = parser.parse_args()
    run(force=args.force)
