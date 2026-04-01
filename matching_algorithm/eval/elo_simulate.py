"""
elo_simulate.py — Simulate per-project ELO ratings from label history.

Splits the 60 candidates into a history set (70%) and a test set (30%).
For each project, history candidates' reactions (label=1 → "like",
label=0 → "pass") are applied in sequence to accumulate an ELO rating.
The test set is held out so metrics.py can evaluate whether ELO-adjusted
scoring improves ranking quality on *unseen* candidates.

No API calls. Reads data/labels.json. Writes data/elo_simulation.json.

Output schema
-------------
{
  "split_seed": 42,
  "history_fraction": 0.7,
  "history_candidate_ids": ["u_000", ...],   // 42 candidates
  "test_candidate_ids": ["u_042", ...],       // 18 candidates
  "project_elo_ratings": {
    "p_01": 1247.3,
    ...
  },
  "per_project_stats": {
    "p_01": {
      "final_elo": 1247.3,
      "history_likes": 14,
      "history_passes": 28,
      "history_positive_rate": 0.333
    },
    ...
  }
}

Usage
-----
  python eval/elo_simulate.py
  python eval/elo_simulate.py --force
  python eval/elo_simulate.py --seed 7 --history-fraction 0.6
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

import os
os.environ.setdefault("REDIS_HOST", "")

from elo import EloCalculator, EloConfig, DEFAULT_RATING  # noqa: E402

DATA_DIR = Path(__file__).parent / "data"
LABELS_FILE = DATA_DIR / "labels.json"
ELO_SIM_FILE = DATA_DIR / "elo_simulation.json"


def _simulate_elo_for_candidate_set(
    labels: list[dict],
    candidate_ids: set[str],
    seed: int,
) -> tuple[dict[str, float], dict[str, dict]]:
    """Run ELO simulation for a given set of candidates. Returns (ratings, stats)."""
    calc = EloCalculator()
    project_ratings: dict[str, float] = {}
    per_project_stats: dict[str, dict] = {}

    # Group labels by project, restricted to candidate_ids
    project_labels: dict[str, list[dict]] = {}
    for row in labels:
        if row["candidate_id"] in candidate_ids:
            project_labels.setdefault(row["project_id"], []).append(row)

    for proj_id, rows in sorted(project_labels.items()):
        proj_rng = np.random.default_rng(seed + hash(proj_id) % (2**31))
        proj_rng.shuffle(rows)

        rating = DEFAULT_RATING
        likes = passes = 0
        for row in rows:
            reaction = "like" if row["label"] == 1 else "pass"
            result = calc.update_rating(current_rating=rating, reaction=reaction)
            rating = result.new_rating
            if reaction == "like":
                likes += 1
            else:
                passes += 1

        project_ratings[proj_id] = round(rating, 4)
        per_project_stats[proj_id] = {
            "final_elo": round(rating, 4),
            "likes": likes,
            "passes": passes,
            "positive_rate": round(likes / (likes + passes), 4) if (likes + passes) else 0.0,
            "elo_delta": round(rating - DEFAULT_RATING, 4),
        }

    return project_ratings, per_project_stats


def run(force: bool = False, seed: int = 42, history_fraction: float = 0.7) -> dict:
    if not LABELS_FILE.exists():
        print("ERROR: labels.json not found. Run label.py first.", file=sys.stderr)
        sys.exit(1)

    if not force and ELO_SIM_FILE.exists():
        print("  elo_simulation.json already exists. Use --force to regenerate.")
        with open(ELO_SIM_FILE) as f:
            return json.load(f)

    with open(LABELS_FILE) as f:
        labels: list[dict] = json.load(f)

    all_candidates = sorted({l["candidate_id"] for l in labels})

    # ------------------------------------------------------------------
    # Full-data ELO: all 60 candidates — used for all-900-pair eval
    # ------------------------------------------------------------------
    print(f"  Full-data ELO ({len(all_candidates)} candidates per project)...")
    full_ratings, full_stats = _simulate_elo_for_candidate_set(
        labels, set(all_candidates), seed
    )
    full_elos = list(full_ratings.values())
    print(f"  min={min(full_elos):.1f}  max={max(full_elos):.1f}  "
          f"mean={sum(full_elos)/len(full_elos):.1f}  range={max(full_elos)-min(full_elos):.1f}")
    for pid, s in sorted(full_stats.items()):
        print(f"    {pid}: ELO={s['final_elo']:.1f} (Δ{s['elo_delta']:+.1f})  "
              f"likes={s['likes']}/{s['likes']+s['passes']}")

    # ------------------------------------------------------------------
    # Split ELO: 70/30 holdout — kept for methodological transparency
    # ------------------------------------------------------------------
    rng = np.random.default_rng(seed)
    shuffled = rng.permutation(all_candidates).tolist()
    n_history = round(len(shuffled) * history_fraction)
    history_ids = set(shuffled[:n_history])
    test_ids = set(shuffled[n_history:])

    print(f"\n  Split ELO ({len(history_ids)} history / {len(test_ids)} test)...")
    split_ratings, split_stats = _simulate_elo_for_candidate_set(labels, history_ids, seed)

    output = {
        "split_seed": seed,
        "history_fraction": history_fraction,
        "history_candidate_ids": sorted(history_ids),
        "test_candidate_ids": sorted(test_ids),
        "full_data_elo_ratings": full_ratings,
        "full_data_per_project_stats": full_stats,
        "project_elo_ratings": split_ratings,
        "per_project_stats": split_stats,
    }

    ELO_SIM_FILE.write_text(json.dumps(output, indent=2))
    print(f"  Saved → {ELO_SIM_FILE}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate ELO ratings from label history")
    parser.add_argument("--force", action="store_true", help="Regenerate even if file exists")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for candidate split (default: 42)")
    parser.add_argument("--history-fraction", type=float, default=0.7,
                        help="Fraction of candidates used as history (default: 0.7)")
    args = parser.parse_args()
    run(force=args.force, seed=args.seed, history_fraction=args.history_fraction)
