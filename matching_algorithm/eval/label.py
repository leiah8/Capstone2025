"""
label.py — LLM-as-judge labeler for (project, candidate) pairs.

For each of the 900 pairs (60 profiles × 15 projects), asks Claude Haiku:
  "Would a project owner reasonably want to reach out to this candidate?"

Labels are saved incrementally to eval/data/labels.json after every batch,
so the run can be interrupted and resumed safely.

Usage:
  python eval/label.py
  python eval/label.py --force   # re-label even if labels.json exists
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from itertools import product
from pathlib import Path

import anthropic

DATA_DIR = Path(__file__).parent / "data"
LABELS_FILE = DATA_DIR / "labels.json"
PROFILES_FILE = DATA_DIR / "profiles.json"
PROJECTS_FILE = DATA_DIR / "projects.json"

MODEL = "claude-haiku-4-5-20251001"
BATCH_SIZE = 10       # pairs per API call
MAX_RETRIES = 3
RETRY_DELAY = 2.0


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def _format_profile(p: dict) -> str:
    skills = ", ".join(p.get("skills", [])) or "none listed"
    interests = ", ".join(p.get("interests", [])) or "none listed"
    bio = p.get("bio", "").strip() or "(no bio provided)"
    return (
        f"ID: {p['id']} | Name: {p.get('name', '?')}\n"
        f"Skills: {skills}\n"
        f"Interests: {interests}\n"
        f"Bio: {bio}"
    )


def _format_project(proj: dict) -> str:
    must = ", ".join(proj.get("skills_needed", [])) or "none specified"
    nice = ", ".join(proj.get("nice_to_have_skills", [])) or "none"
    tags = ", ".join(proj.get("tags", [])) or "none"
    desc = proj.get("description", "").strip() or "(no description)"
    return (
        f"ID: {proj['id']} | Name: {proj.get('name', '?')}\n"
        f"Description: {desc}\n"
        f"Must-have skills: {must}\n"
        f"Nice-to-have skills: {nice}\n"
        f"Domain tags: {tags}"
    )


SYSTEM_PROMPT = """You are evaluating candidate fit for software collaboration projects at a university.
Your job is to decide, for each (project, candidate) pair, whether a project owner would
reasonably want to reach out to this candidate to discuss joining the team.

Evaluation criteria (in order of importance):
1. Skill overlap — does the candidate have the must-have skills? Partial overlap is still valuable.
2. Domain alignment — do the candidate's interests/bio match the project's domain?
3. Semantic fit — does the candidate's background seem relevant even if skills don't match exactly?

Be realistic: most random pairings will NOT be a good fit (expect ~30–40% YES overall).
A candidate with NO skills and NO bio should almost always be NO unless the project has no requirements.
A perfect skill match with aligned bio should almost always be YES."""


def _build_batch_prompt(pairs: list[tuple[dict, dict]]) -> str:
    parts = [SYSTEM_PROMPT, "\n\nEvaluate the following pairs:\n"]

    for i, (proj, profile) in enumerate(pairs, 1):
        parts.append(f"\n--- PAIR {i} ---")
        parts.append(f"PROJECT:\n{_format_project(proj)}")
        parts.append(f"CANDIDATE:\n{_format_profile(profile)}")

    parts.append(f"""
Return a JSON array of exactly {len(pairs)} objects, one per pair in order:
[
  {{
    "pair_index": 1,
    "project_id": "p_XX",
    "candidate_id": "u_XXX",
    "label": 1,
    "reason": "one-sentence justification"
  }},
  ...
]

label must be 1 (YES — would reach out) or 0 (NO — would not reach out).
Return ONLY valid JSON. No markdown, no explanation outside the JSON.""")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# API call with retry
# ---------------------------------------------------------------------------

def _call_claude(client: anthropic.Anthropic, prompt: str) -> str:
    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text
        except anthropic.RateLimitError:
            wait = RETRY_DELAY * (2 ** attempt)
            print(f"    Rate limited — waiting {wait:.0f}s (attempt {attempt + 1}/{MAX_RETRIES})")
            time.sleep(wait)
        except anthropic.APIError as e:
            if attempt == MAX_RETRIES - 1:
                raise
            print(f"    API error ({e}) — retrying ({attempt + 1}/{MAX_RETRIES})")
            time.sleep(RETRY_DELAY)
    raise RuntimeError("Max retries exceeded")


def _extract_json(text: str) -> list:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON array found in response:\n{text[:400]}")
    return json.loads(text[start : end + 1])


# ---------------------------------------------------------------------------
# Main labeling loop
# ---------------------------------------------------------------------------

def run(force: bool = False) -> list[dict]:
    if not PROFILES_FILE.exists() or not PROJECTS_FILE.exists():
        print("ERROR: profiles.json or projects.json not found. Run generate.py first.", file=sys.stderr)
        sys.exit(1)

    if not force and LABELS_FILE.exists():
        print("  labels.json already exists. Use --force to re-label.")
        with open(LABELS_FILE) as f:
            labels = json.load(f)
        print(f"  Loaded {len(labels)} existing labels from disk.")
        return labels

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable not set.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    with open(PROFILES_FILE) as f:
        profiles: list[dict] = json.load(f)
    with open(PROJECTS_FILE) as f:
        projects: list[dict] = json.load(f)

    # Build all pairs and load any existing checkpoint
    all_pairs = list(product(projects, profiles))  # (project, profile) order
    total = len(all_pairs)
    print(f"  Labeling {total} pairs ({len(projects)} projects × {len(profiles)} profiles)")

    # Checkpoint: load partial results to allow resumption
    existing_labels: dict[str, dict] = {}
    if LABELS_FILE.exists():
        with open(LABELS_FILE) as f:
            for item in json.load(f):
                key = f"{item['project_id']}|{item['candidate_id']}"
                existing_labels[key] = item
        print(f"  Resuming from checkpoint — {len(existing_labels)} pairs already labeled")

    all_labels: list[dict] = list(existing_labels.values())

    # Filter out already-labeled pairs
    pending_pairs = [
        (proj, profile)
        for proj, profile in all_pairs
        if f"{proj['id']}|{profile['id']}" not in existing_labels
    ]

    if not pending_pairs:
        print("  All pairs already labeled.")
        return all_labels

    # Process in batches
    batches = [pending_pairs[i : i + BATCH_SIZE] for i in range(0, len(pending_pairs), BATCH_SIZE)]
    n_batches = len(batches)

    for batch_num, batch in enumerate(batches, 1):
        print(f"  Batch {batch_num}/{n_batches} ({len(batch)} pairs)...", end=" ", flush=True)

        for attempt in range(MAX_RETRIES):
            try:
                raw = _call_claude(client, _build_batch_prompt(batch))
                results = _extract_json(raw)

                if len(results) != len(batch):
                    raise ValueError(f"Expected {len(batch)} results, got {len(results)}")

                # Validate and normalise labels
                for item, (proj, profile) in zip(results, batch):
                    label_val = int(item.get("label", 0))
                    all_labels.append(
                        {
                            "project_id": proj["id"],
                            "candidate_id": profile["id"],
                            "label": 1 if label_val == 1 else 0,
                            "reason": str(item.get("reason", "")),
                        }
                    )

                # Checkpoint save after every batch
                LABELS_FILE.write_text(json.dumps(all_labels, indent=2))
                print(f"✓  [{len(all_labels)}/{total} total]")
                break

            except (ValueError, json.JSONDecodeError) as e:
                if attempt == MAX_RETRIES - 1:
                    print(f"\n  FATAL: failed to parse batch {batch_num} after {MAX_RETRIES} attempts: {e}")
                    raise
                print(f"\n    Parse error ({e}) — retrying ({attempt + 1}/{MAX_RETRIES})")
                time.sleep(RETRY_DELAY)

    # Summary stats
    positive = sum(1 for lb in all_labels if lb["label"] == 1)
    pct = positive / len(all_labels) * 100
    print(f"\n  Done — {len(all_labels)} labels | {positive} positive ({pct:.1f}%)")
    print(f"  Saved → {LABELS_FILE}")
    return all_labels


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Label pairs with Claude as judge")
    parser.add_argument("--force", action="store_true", help="Re-label even if labels.json exists")
    args = parser.parse_args()
    run(force=args.force)
