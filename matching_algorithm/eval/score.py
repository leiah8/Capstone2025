"""
score.py — Score all (project, candidate) pairs using the MatchingEngine directly.

Produces eval/data/scores.json with full breakdown plus skills-only baseline scores
so that metrics.py can compare all three systems (full model, skills-only, random).

Pre-computes all sentence embeddings in one batched call so the 900-pair loop
completes in seconds rather than re-encoding text on every call.

Usage:
  python eval/score.py
  python eval/score.py --force   # re-score even if scores.json exists
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from itertools import product
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Path setup — import parent package (matching_algorithm/) from eval/
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

# Disable Redis before importing cache so the singleton never tries to connect
os.environ.setdefault("REDIS_HOST", "")

from matching import MatchingEngine, MatchWeights  # noqa: E402
from cache import EmbeddingCache                   # noqa: E402

DATA_DIR = Path(__file__).parent / "data"
SCORES_FILE = DATA_DIR / "scores.json"
PROFILES_FILE = DATA_DIR / "profiles.json"
PROJECTS_FILE = DATA_DIR / "projects.json"


# ---------------------------------------------------------------------------
# Lightweight in-memory embedding cache
# ---------------------------------------------------------------------------

class _InMemoryCache(EmbeddingCache):
    """
    Thin in-memory dict cache that satisfies the EmbeddingCache interface.
    Pre-warmed with all unique texts before scoring begins so the engine
    never calls model.encode() during the 900-pair evaluation loop.
    """

    def __init__(self) -> None:
        # Skip EmbeddingCache.__init__ — we don't want Redis
        self.enabled = True
        self.client = None
        self._store: dict[str, np.ndarray] = {}

    @staticmethod
    def _norm(text: str) -> str:
        return " ".join(text.split())

    def get(self, text: str):  # type: ignore[override]
        return self._store.get(self._norm(text))

    def set(self, text: str, embedding: np.ndarray) -> bool:  # type: ignore[override]
        self._store[self._norm(text)] = embedding
        return True

    def get_batch(self, texts):  # type: ignore[override]
        return [self.get(t) for t in texts]

    def set_batch(self, texts, embeddings) -> int:  # type: ignore[override]
        for t, e in zip(texts, embeddings):
            self.set(t, e)
        return len(texts)


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

SKILLS_ONLY_WEIGHTS = MatchWeights(
    semantic=0.0,
    must_have_skills=0.85,
    nice_to_have_skills=0.15,
    interests=0.0,
)


def _prewarm_cache(profiles: list[dict], projects: list[dict]) -> _InMemoryCache:
    """Batch-encode all unique bio and description texts, return warm cache."""
    from sentence_transformers import SentenceTransformer

    unique_texts = list(
        {
            p["bio"].strip()
            for p in profiles
            if p.get("bio", "").strip()
        }
        | {
            proj["description"].strip()
            for proj in projects
            if proj.get("description", "").strip()
        }
    )

    if not unique_texts:
        return _InMemoryCache()

    print(f"  Pre-encoding {len(unique_texts)} unique texts (1 batch)...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(unique_texts, batch_size=64, show_progress_bar=True)

    cache = _InMemoryCache()
    for text, emb in zip(unique_texts, embeddings):
        cache.set(text, emb)
    return cache


def _score_all_pairs(
    profiles: list[dict],
    projects: list[dict],
    cache: _InMemoryCache,
) -> list[dict]:
    """Score every (project, candidate) pair with both full model and skills-only weights."""

    full_engine = MatchingEngine(cache=cache)
    skills_engine = MatchingEngine(cache=cache, weights=SKILLS_ONLY_WEIGHTS)

    all_pairs = list(product(projects, profiles))
    total = len(all_pairs)
    print(f"  Scoring {total} pairs...")

    scores: list[dict] = []
    for i, (proj, profile) in enumerate(all_pairs):
        full_score = full_engine.calculate_match_score(profile, proj)
        skills_score = skills_engine.calculate_match_score(profile, proj)

        scores.append(
            {
                "project_id": proj["id"],
                "candidate_id": profile["id"],
                "total_score": round(float(full_score.total_score), 6),
                "skills_only_score": round(float(skills_score.total_score), 6),
                "breakdown": {
                    "semantic": round(float(full_score.semantic_score), 6),
                    "must_have": round(float(full_score.must_have_score), 6),
                    "nice_to_have": round(float(full_score.nice_to_have_score), 6),
                    "interests": round(float(full_score.interest_score), 6),
                },
                "matched_must_have_skills": full_score.matched_must_have_skills,
                "missing_must_have_skills": full_score.missing_must_have_skills,
            }
        )

        if (i + 1) % 100 == 0 or (i + 1) == total:
            print(f"    {i + 1}/{total} pairs scored", end="\r", flush=True)

    print()  # newline after \r progress
    return scores


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run(force: bool = False) -> list[dict]:
    if not PROFILES_FILE.exists() or not PROJECTS_FILE.exists():
        print("ERROR: profiles.json or projects.json not found. Run generate.py first.", file=sys.stderr)
        sys.exit(1)

    if not force and SCORES_FILE.exists():
        print("  scores.json already exists. Use --force to re-score.")
        with open(SCORES_FILE) as f:
            scores = json.load(f)
        print(f"  Loaded {len(scores)} scores from disk.")
        return scores

    with open(PROFILES_FILE) as f:
        profiles: list[dict] = json.load(f)
    with open(PROJECTS_FILE) as f:
        projects: list[dict] = json.load(f)

    cache = _prewarm_cache(profiles, projects)
    scores = _score_all_pairs(profiles, projects, cache)

    SCORES_FILE.write_text(json.dumps(scores, indent=2))
    print(f"  Saved {len(scores)} scores → {SCORES_FILE}")
    return scores


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Score all pairs with MatchingEngine")
    parser.add_argument("--force", action="store_true", help="Re-score even if scores.json exists")
    args = parser.parse_args()
    run(force=args.force)
