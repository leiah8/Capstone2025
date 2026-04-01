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
ELO_SIM_FILE = DATA_DIR / "elo_simulation.json"


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
    skills=1.0,
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
    elo_ratings: dict[str, float] | None = None,        # full-data → all 900 pairs
    split_elo_ratings: dict[str, float] | None = None,  # split → test candidates only
    test_candidate_ids: set[str] | None = None,
) -> list[dict]:
    full_engine = MatchingEngine(cache=cache)
    skills_engine = MatchingEngine(cache=cache, weights=SKILLS_ONLY_WEIGHTS)

    all_pairs = list(product(projects, profiles))
    total = len(all_pairs)

    # Population means for relative scoring
    full_pop_mean: float | None = None
    split_pop_mean: float | None = None
    if elo_ratings:
        full_pop_mean = sum(elo_ratings.values()) / len(elo_ratings)
        print(f"  Full-data ELO pop mean: {full_pop_mean:.1f} "
              f"(range {min(elo_ratings.values()):.1f}–{max(elo_ratings.values()):.1f})")
    if split_elo_ratings:
        split_pop_mean = sum(split_elo_ratings.values()) / len(split_elo_ratings)

    print(f"  Scoring {total} pairs...")

    scores: list[dict] = []
    for i, (proj, profile) in enumerate(all_pairs):
        full_score = full_engine.calculate_match_score(profile, proj)
        skills_score = skills_engine.calculate_match_score(profile, proj)

        row = {
            "project_id": proj["id"],
            "candidate_id": profile["id"],
            "total_score": round(float(full_score.total_score), 6),
            "skills_only_score": round(float(skills_score.total_score), 6),
            "breakdown": {
                "semantic": round(float(full_score.semantic_score), 6),
                "skills": round(float(full_score.skill_score), 6),
                "interests": round(float(full_score.interest_score), 6),
                "elo_adjustment": round(float(full_score.elo_adjustment), 6),
            },
            "matched_skills": full_score.matched_skills,
            "missing_skills": full_score.missing_skills,
        }

        # Full-data ELO score — available for all 900 pairs
        if elo_ratings:
            proj_elo = elo_ratings.get(proj["id"])
            s = full_engine.calculate_match_score(
                profile, proj, elo_rating=proj_elo, elo_population_mean=full_pop_mean
            )
            row["elo_score"] = round(float(s.total_score), 6)

        # Split ELO score — only for test candidates (no leakage)
        is_test = test_candidate_ids is not None and profile["id"] in test_candidate_ids
        if split_elo_ratings:
            row["is_test_candidate"] = is_test
            if is_test:
                proj_elo = split_elo_ratings.get(proj["id"])
                s = full_engine.calculate_match_score(
                    profile, proj, elo_rating=proj_elo, elo_population_mean=split_pop_mean
                )
                row["split_elo_score"] = round(float(s.total_score), 6)

        scores.append(row)

        if (i + 1) % 100 == 0 or (i + 1) == total:
            print(f"    {i + 1}/{total} pairs scored", end="\r", flush=True)

    print()
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
            data = json.load(f)
        pairs = data["pairs"] if isinstance(data, dict) else data
        print(f"  Loaded {len(pairs)} scores from disk.")
        return pairs

    with open(PROFILES_FILE) as f:
        profiles: list[dict] = json.load(f)
    with open(PROJECTS_FILE) as f:
        projects: list[dict] = json.load(f)

    # Load ELO simulation data if available
    elo_ratings = None          # full-data ratings → applied to all 900 pairs
    split_elo_ratings = None    # split ratings → applied to test candidates only
    test_candidate_ids = None
    if ELO_SIM_FILE.exists():
        with open(ELO_SIM_FILE) as f:
            elo_sim = json.load(f)
        elo_ratings = elo_sim.get("full_data_elo_ratings") or elo_sim.get("project_elo_ratings")
        split_elo_ratings = elo_sim.get("project_elo_ratings")
        test_candidate_ids = set(elo_sim.get("test_candidate_ids", []))
        print(f"  ELO simulation loaded: {len(elo_ratings)} project ratings "
              f"({len(test_candidate_ids)} test candidates for split eval)")
    else:
        print("  No elo_simulation.json found — scoring without ELO. "
              "Run elo_simulate.py first to enable ELO comparison.")

    cache = _prewarm_cache(profiles, projects)
    scores = _score_all_pairs(profiles, projects, cache,
                              elo_ratings=elo_ratings,
                              split_elo_ratings=split_elo_ratings,
                              test_candidate_ids=test_candidate_ids)

    # Record the actual weights used so downstream consumers (metrics, plots)
    # can display them correctly rather than duplicating or hard-coding them.
    weights = MatchWeights()
    output = {
        "full_model_weights": {
            "semantic": weights.semantic,
            "skills": weights.skills,
            "interests": weights.interests,
        },
        "elo_enabled": elo_ratings is not None,
        "pairs": scores,
    }
    SCORES_FILE.write_text(json.dumps(output, indent=2))
    print(f"  Saved {len(scores)} scores → {SCORES_FILE}")
    return scores


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Score all pairs with MatchingEngine")
    parser.add_argument("--force", action="store_true", help="Re-score even if scores.json exists")
    args = parser.parse_args()
    run(force=args.force)
