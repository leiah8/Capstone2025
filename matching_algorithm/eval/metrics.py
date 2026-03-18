"""
metrics.py — Compute evaluation metrics for the matching algorithm.

Joins labels.json + scores.json and computes:
  - AUC-ROC (full model, skills-only, random)
  - Precision@K  (K = 5, 10, 20) — per system, macro-averaged over projects
  - NDCG@K       (K = 5, 10, 20) — per system, macro-averaged over projects
  - Score separation (mean ± std for matched vs. not-matched, Mann-Whitney U p-value)
  - Per-component score means (matched vs. not-matched)
  - Per-project NDCG@10 (full model vs. random)
  - ROC curve arrays for plotting

Saves everything to eval/data/metrics.json.

Usage:
  python eval/metrics.py
  python eval/metrics.py --force
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import (
    auc,
    ndcg_score,
    roc_auc_score,
    roc_curve,
)

DATA_DIR = Path(__file__).parent / "data"
METRICS_FILE = DATA_DIR / "metrics.json"
LABELS_FILE = DATA_DIR / "labels.json"
SCORES_FILE = DATA_DIR / "scores.json"

K_VALUES = [5, 10, 20]
N_RANDOM_SEEDS = 50   # average random baseline over this many shuffles


# ---------------------------------------------------------------------------
# Precision@K helpers
# ---------------------------------------------------------------------------

def precision_at_k(labels: np.ndarray, scores: np.ndarray, k: int) -> float:
    """Precision@K for a single project's ranked list."""
    if len(labels) == 0:
        return 0.0
    k = min(k, len(labels))
    top_indices = np.argsort(scores)[::-1][:k]
    return float(labels[top_indices].sum() / k)


def avg_precision_at_k(df: pd.DataFrame, score_col: str, k: int) -> float:
    """Macro-average Precision@K across all projects."""
    per_project = (
        df.groupby("project_id")
        .apply(
            lambda g: precision_at_k(g["label"].values, g[score_col].values, k),
            include_groups=False,
        )
    )
    return float(per_project.mean())


# ---------------------------------------------------------------------------
# NDCG@K helpers
# ---------------------------------------------------------------------------

def ndcg_at_k_single(labels: np.ndarray, scores: np.ndarray, k: int) -> float | None:
    """NDCG@K for one project. Returns None if no positive labels (can't define DCG)."""
    if labels.sum() == 0:
        return None
    k = min(k, len(labels))
    return float(
        ndcg_score(labels.reshape(1, -1), scores.reshape(1, -1), k=k)
    )


def avg_ndcg_at_k(df: pd.DataFrame, score_col: str, k: int) -> float:
    """Macro-average NDCG@K across projects that have at least one positive."""
    results = []
    for _, group in df.groupby("project_id"):
        val = ndcg_at_k_single(group["label"].values, group[score_col].values, k)
        if val is not None:
            results.append(val)
    return float(np.mean(results)) if results else 0.0


def per_project_ndcg(df: pd.DataFrame, score_col: str, k: int) -> dict[str, float]:
    """Return per-project NDCG@K dict (only for projects with positive labels)."""
    out = {}
    for proj_id, group in df.groupby("project_id"):
        val = ndcg_at_k_single(group["label"].values, group[score_col].values, k)
        if val is not None:
            out[proj_id] = round(val, 4)
    return out


# ---------------------------------------------------------------------------
# Random baseline
# ---------------------------------------------------------------------------

def random_baseline_metrics(df: pd.DataFrame, k_values: list[int], n_seeds: int) -> dict:
    """
    Compute random baseline metrics by averaging over n_seeds shuffles.
    For AUC, a single uniform draw is sufficient.
    """
    rng = np.random.default_rng(42)
    n = len(df)

    # AUC from random uniform scores
    random_scores = rng.uniform(0, 1, n)
    random_auc = float(roc_auc_score(df["label"].values, random_scores))

    # Precision@K and NDCG@K — average over multiple seeds
    p_at_k: dict[int, list[float]] = {k: [] for k in k_values}
    ndcg_at_k_vals: dict[int, list[float]] = {k: [] for k in k_values}

    for seed in range(n_seeds):
        seed_rng = np.random.default_rng(seed)
        # Shuffle scores per project independently
        df_copy = df.copy()
        df_copy["random_score"] = df_copy.groupby("project_id")["label"].transform(
            lambda x: seed_rng.uniform(0, 1, len(x))
        )
        for k in k_values:
            p_at_k[k].append(avg_precision_at_k(df_copy, "random_score", k))
            ndcg_at_k_vals[k].append(avg_ndcg_at_k(df_copy, "random_score", k))

    return {
        "auc": random_auc,
        "precision_at_k": {k: float(np.mean(v)) for k, v in p_at_k.items()},
        "ndcg_at_k": {k: float(np.mean(v)) for k, v in ndcg_at_k_vals.items()},
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(force: bool = False) -> dict:
    if not LABELS_FILE.exists() or not SCORES_FILE.exists():
        print("ERROR: labels.json or scores.json not found. Run label.py and score.py first.", file=sys.stderr)
        sys.exit(1)

    if not force and METRICS_FILE.exists():
        print("  metrics.json already exists. Use --force to recompute.")
        with open(METRICS_FILE) as f:
            return json.load(f)

    with open(LABELS_FILE) as f:
        labels_raw: list[dict] = json.load(f)
    with open(SCORES_FILE) as f:
        scores_data = json.load(f)

    # scores.json may be a plain list (old format) or {"full_model_weights": ..., "pairs": [...]}
    if isinstance(scores_data, dict):
        full_model_weights: dict = scores_data.get("full_model_weights", {})
        scores_raw: list[dict] = scores_data["pairs"]
    else:
        full_model_weights = {}
        scores_raw = scores_data

    labels_df = pd.DataFrame(labels_raw)[["project_id", "candidate_id", "label"]]
    scores_df = pd.DataFrame(
        [
            {
                "project_id": s["project_id"],
                "candidate_id": s["candidate_id"],
                "total_score": s["total_score"],
                "skills_only_score": s["skills_only_score"],
                "semantic": s["breakdown"]["semantic"],
                "must_have": s["breakdown"]["must_have"],
                "nice_to_have": s["breakdown"]["nice_to_have"],
                "interests": s["breakdown"]["interests"],
            }
            for s in scores_raw
        ]
    )

    df = labels_df.merge(scores_df, on=["project_id", "candidate_id"])
    print(f"  Joined {len(df)} rows | {df['label'].sum()} positive ({df['label'].mean()*100:.1f}%)")

    labels = df["label"].values
    full_scores = df["total_score"].values
    skills_scores = df["skills_only_score"].values

    # ---- AUC-ROC ----
    full_auc = float(roc_auc_score(labels, full_scores))
    skills_auc = float(roc_auc_score(labels, skills_scores))
    fpr, tpr, _ = roc_curve(labels, full_scores)
    fpr_skills, tpr_skills, _ = roc_curve(labels, skills_scores)
    print(f"  AUC — Full model: {full_auc:.4f} | Skills-only: {skills_auc:.4f}")

    # ---- Precision@K ----
    full_pk = {k: avg_precision_at_k(df, "total_score", k) for k in K_VALUES}
    skills_pk = {k: avg_precision_at_k(df, "skills_only_score", k) for k in K_VALUES}
    print(f"  Precision@10 — Full: {full_pk[10]:.4f} | Skills-only: {skills_pk[10]:.4f}")

    # ---- NDCG@K ----
    full_ndcg = {k: avg_ndcg_at_k(df, "total_score", k) for k in K_VALUES}
    skills_ndcg = {k: avg_ndcg_at_k(df, "skills_only_score", k) for k in K_VALUES}
    print(f"  NDCG@10 — Full: {full_ndcg[10]:.4f} | Skills-only: {skills_ndcg[10]:.4f}")

    # ---- Random baseline ----
    print(f"  Computing random baseline (avg over {N_RANDOM_SEEDS} seeds)...")
    random = random_baseline_metrics(df, K_VALUES, N_RANDOM_SEEDS)
    print(f"  Random — AUC: {random['auc']:.4f} | P@10: {random['precision_at_k'][10]:.4f}")

    # ---- Score separation ----
    matched = df[df["label"] == 1]["total_score"].values
    unmatched = df[df["label"] == 0]["total_score"].values
    u_stat, p_value = stats.mannwhitneyu(matched, unmatched, alternative="greater")
    separation = {
        "matched_mean": float(matched.mean()),
        "matched_std": float(matched.std()),
        "unmatched_mean": float(unmatched.mean()),
        "unmatched_std": float(unmatched.std()),
        "delta": float(matched.mean() - unmatched.mean()),
        "mannwhitney_u": float(u_stat),
        "p_value": float(p_value),
    }
    print(
        f"  Score separation — Δmean: {separation['delta']:.4f} "
        f"(matched: {separation['matched_mean']:.4f}, unmatched: {separation['unmatched_mean']:.4f})"
        f" | p={separation['p_value']:.2e}"
    )

    # ---- Per-component means (matched vs. not-matched) ----
    components = ["semantic", "must_have", "nice_to_have", "interests"]
    component_stats = {}
    for comp in components:
        m_mean = float(df[df["label"] == 1][comp].mean())
        u_mean = float(df[df["label"] == 0][comp].mean())
        component_stats[comp] = {"matched_mean": m_mean, "unmatched_mean": u_mean}

    # ---- Per-project NDCG@10 ----
    per_proj_ndcg_full = per_project_ndcg(df, "total_score", k=10)
    per_proj_ndcg_random_vals: list[float] = []
    rng = np.random.default_rng(42)
    for _, group in df.groupby("project_id"):
        rand_s = rng.uniform(0, 1, len(group))
        val = ndcg_at_k_single(group["label"].values, rand_s, k=10)
        if val is not None:
            per_proj_ndcg_random_vals.append(val)
    per_proj_ndcg_random = float(np.mean(per_proj_ndcg_random_vals)) if per_proj_ndcg_random_vals else 0.0

    # ---- Score histogram data (for plotting) ----
    hist_matched = [round(v, 4) for v in matched.tolist()]
    hist_unmatched = [round(v, 4) for v in unmatched.tolist()]

    # ---- Assemble result ----
    metrics = {
        "n_total": int(len(df)),
        "n_positive": int(df["label"].sum()),
        "positive_rate": round(float(df["label"].mean()), 4),
        "full_model_weights": full_model_weights,
        "auc": {
            "full_model": round(full_auc, 4),
            "skills_only": round(skills_auc, 4),
            "random": round(random["auc"], 4),
        },
        "roc_curve": {
            "full_model": {
                "fpr": [round(float(x), 4) for x in fpr.tolist()],
                "tpr": [round(float(x), 4) for x in tpr.tolist()],
            },
            "skills_only": {
                "fpr": [round(float(x), 4) for x in fpr_skills.tolist()],
                "tpr": [round(float(x), 4) for x in tpr_skills.tolist()],
            },
        },
        "precision_at_k": {
            "full_model": {str(k): round(full_pk[k], 4) for k in K_VALUES},
            "skills_only": {str(k): round(skills_pk[k], 4) for k in K_VALUES},
            "random": {str(k): round(random["precision_at_k"][k], 4) for k in K_VALUES},
        },
        "ndcg_at_k": {
            "full_model": {str(k): round(full_ndcg[k], 4) for k in K_VALUES},
            "skills_only": {str(k): round(skills_ndcg[k], 4) for k in K_VALUES},
            "random": {str(k): round(random["ndcg_at_k"][k], 4) for k in K_VALUES},
        },
        "score_separation": separation,
        "component_stats": component_stats,
        "per_project_ndcg10": {
            "full_model": per_proj_ndcg_full,
            "random_mean": round(per_proj_ndcg_random, 4),
        },
        "score_distributions": {
            "matched": hist_matched,
            "unmatched": hist_unmatched,
        },
    }

    METRICS_FILE.write_text(json.dumps(metrics, indent=2))
    print(f"  Saved → {METRICS_FILE}")
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute evaluation metrics")
    parser.add_argument("--force", action="store_true", help="Recompute even if metrics.json exists")
    args = parser.parse_args()
    run(force=args.force)
