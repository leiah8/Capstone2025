"""
plot.py — Generate all evaluation charts with seaborn and matplotlib.

Reads eval/data/metrics.json and produces 7 publication-quality charts
into eval/data/plots/.

Charts produced:
  01_roc_curve.png          — ROC curves (full model, skills-only, random diagonal)
  02_score_distribution.png — Score violin plot (matched vs. not matched)
  03_precision_at_k.png     — Precision@K grouped bar (3 systems × K=5,10,20)
  04_ndcg_at_k.png          — NDCG@K grouped bar (3 systems × K=5,10,20)
  05_component_scores.png   — Per-component mean scores (matched vs. not matched)
  06_per_project_ndcg.png   — NDCG@10 per project vs. random mean
  07_summary.png            — Key metrics summary table

Usage:
  python eval/plot.py
  python eval/plot.py --force
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
import seaborn as sns

DATA_DIR = Path(__file__).parent / "data"
METRICS_FILE = DATA_DIR / "metrics.json"
PLOTS_DIR = DATA_DIR / "plots"

# ---------------------------------------------------------------------------
# Global style
# ---------------------------------------------------------------------------

COLORS = {
    "Full Model":  "#2563EB",   # blue
    "Skills-Only": "#16A34A",   # green
    "Random":      "#9CA3AF",   # gray
    "Matched":     "#2563EB",   # blue
    "Not Matched": "#EF4444",   # red
}

COMPONENT_LABELS = {
    "semantic":     "Semantic\nSimilarity",
    "must_have":    "Must-Have\nSkills",
    "nice_to_have": "Nice-to-Have\nSkills",
    "interests":    "Interest\nAlignment",
}

WEIGHT_LABELS = {
    "semantic":     "w=0.35",
    "must_have":    "w=0.40",
    "nice_to_have": "w=0.15",
    "interests":    "w=0.10",
}


def _apply_theme() -> None:
    sns.set_theme(style="whitegrid", context="talk", font_scale=1.05)
    plt.rcParams.update(
        {
            "figure.facecolor": "white",
            "axes.facecolor": "#F8FAFC",
            "axes.edgecolor": "#CBD5E1",
            "grid.color": "#E2E8F0",
            "grid.linewidth": 0.8,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.titlepad": 14,
            "axes.labelpad": 8,
            "font.family": "sans-serif",
        }
    )


def _save(fig: plt.Figure, name: str) -> None:
    path = PLOTS_DIR / name
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"  Saved {name}")


# ---------------------------------------------------------------------------
# 01 — ROC Curve
# ---------------------------------------------------------------------------

def plot_roc_curve(m: dict) -> None:
    fig, ax = plt.subplots(figsize=(7, 6))

    for system, color in [("full_model", COLORS["Full Model"]), ("skills_only", COLORS["Skills-Only"])]:
        fpr = m["roc_curve"][system]["fpr"]
        tpr = m["roc_curve"][system]["tpr"]
        label_name = "Full Model" if system == "full_model" else "Skills-Only"
        auc_val = m["auc"][system]
        ax.plot(fpr, tpr, color=color, lw=2.5, label=f"{label_name}  (AUC = {auc_val:.3f})")

    # Random diagonal
    ax.plot([0, 1], [0, 1], color=COLORS["Random"], lw=1.5, linestyle="--", label=f"Random  (AUC ≈ 0.500)")

    ax.set_xlim([-0.02, 1.02])
    ax.set_ylim([-0.02, 1.05])
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC Curve — Matching Algorithm vs. Baselines")
    ax.legend(loc="lower right", frameon=True, framealpha=0.9)

    # Shade area under full model curve lightly
    fpr_arr = np.array(m["roc_curve"]["full_model"]["fpr"])
    tpr_arr = np.array(m["roc_curve"]["full_model"]["tpr"])
    ax.fill_between(fpr_arr, tpr_arr, alpha=0.08, color=COLORS["Full Model"])

    fig.tight_layout()
    _save(fig, "01_roc_curve.png")


# ---------------------------------------------------------------------------
# 02 — Score Distribution (violin)
# ---------------------------------------------------------------------------

def plot_score_distribution(m: dict) -> None:
    matched = m["score_distributions"]["matched"]
    unmatched = m["score_distributions"]["unmatched"]

    data = pd.DataFrame(
        {
            "Score": matched + unmatched,
            "Label": ["Matched"] * len(matched) + ["Not Matched"] * len(unmatched),
        }
    )

    fig, ax = plt.subplots(figsize=(7, 6))
    sns.violinplot(
        data=data,
        x="Label",
        y="Score",
        palette={"Matched": COLORS["Matched"], "Not Matched": COLORS["Not Matched"]},
        inner="quartile",
        linewidth=1.5,
        ax=ax,
    )

    # Annotate means
    for label, values in [("Matched", matched), ("Not Matched", unmatched)]:
        mean_val = np.mean(values)
        x_pos = 0 if label == "Matched" else 1
        ax.text(
            x_pos,
            mean_val + 0.02,
            f"μ = {mean_val:.3f}",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
            color="black",
        )

    sep = m["score_separation"]
    p_val = sep["p_value"]
    p_str = f"p = {p_val:.2e}" if p_val < 0.01 else f"p = {p_val:.3f}"
    ax.set_title(f"Score Distribution by Match Label\n(Δmean = {sep['delta']:.3f}, {p_str})")
    ax.set_xlabel("")
    ax.set_ylabel("Total Match Score")
    ax.set_ylim(-0.05, 1.1)

    fig.tight_layout()
    _save(fig, "02_score_distribution.png")


# ---------------------------------------------------------------------------
# 03 — Precision@K
# ---------------------------------------------------------------------------

def _bar_chart_metrics(
    m: dict,
    metric_key: str,
    title: str,
    ylabel: str,
    fname: str,
    y_upper: float = 1.0,
) -> None:
    k_vals = [5, 10, 20]
    systems = ["Full Model", "Skills-Only", "Random"]
    sys_keys = ["full_model", "skills_only", "random"]

    rows = []
    for sys_name, sys_key in zip(systems, sys_keys):
        for k in k_vals:
            rows.append(
                {
                    "System": sys_name,
                    "K": f"@{k}",
                    "Value": m[metric_key][sys_key][str(k)],
                }
            )

    df = pd.DataFrame(rows)
    palette = {s: COLORS[s] for s in systems}

    fig, ax = plt.subplots(figsize=(9, 6))
    sns.barplot(
        data=df,
        x="K",
        y="Value",
        hue="System",
        palette=palette,
        edgecolor="white",
        linewidth=0.5,
        ax=ax,
    )

    # Annotate bar values
    for patch in ax.patches:
        h = patch.get_height()
        if h > 0.005:
            ax.text(
                patch.get_x() + patch.get_width() / 2,
                h + 0.005,
                f"{h:.3f}",
                ha="center",
                va="bottom",
                fontsize=8,
            )

    ax.set_ylim(0, y_upper)
    ax.set_title(title)
    ax.set_xlabel("Cutoff K")
    ax.set_ylabel(ylabel)
    ax.legend(title="System", bbox_to_anchor=(1.02, 1), loc="upper left", frameon=True)

    fig.tight_layout()
    _save(fig, fname)


def plot_precision_at_k(m: dict) -> None:
    _bar_chart_metrics(
        m,
        metric_key="precision_at_k",
        title="Precision@K — Full Model vs. Baselines",
        ylabel="Precision@K (macro-avg over projects)",
        fname="03_precision_at_k.png",
        y_upper=min(1.05, max(
            max(m["precision_at_k"]["full_model"].values()),
            max(m["precision_at_k"]["skills_only"].values()),
        ) * 1.35),
    )


def plot_ndcg_at_k(m: dict) -> None:
    _bar_chart_metrics(
        m,
        metric_key="ndcg_at_k",
        title="NDCG@K — Full Model vs. Baselines",
        ylabel="NDCG@K (macro-avg over projects)",
        fname="04_ndcg_at_k.png",
        y_upper=min(1.05, max(
            max(m["ndcg_at_k"]["full_model"].values()),
            max(m["ndcg_at_k"]["skills_only"].values()),
        ) * 1.35),
    )


# ---------------------------------------------------------------------------
# 05 — Component Score Analysis
# ---------------------------------------------------------------------------

def plot_component_scores(m: dict) -> None:
    comp_stats = m["component_stats"]
    components = ["semantic", "must_have", "nice_to_have", "interests"]

    rows = []
    for comp in components:
        label = COMPONENT_LABELS[comp]
        weight = WEIGHT_LABELS[comp]
        rows.append({"Component": f"{label}\n{weight}", "Group": "Matched",     "Score": comp_stats[comp]["matched_mean"]})
        rows.append({"Component": f"{label}\n{weight}", "Group": "Not Matched", "Score": comp_stats[comp]["unmatched_mean"]})

    df = pd.DataFrame(rows)
    palette = {"Matched": COLORS["Matched"], "Not Matched": COLORS["Not Matched"]}

    fig, ax = plt.subplots(figsize=(10, 6))
    sns.barplot(
        data=df,
        x="Component",
        y="Score",
        hue="Group",
        palette=palette,
        edgecolor="white",
        linewidth=0.5,
        ax=ax,
    )

    for patch in ax.patches:
        h = patch.get_height()
        if h > 0.005:
            ax.text(
                patch.get_x() + patch.get_width() / 2,
                h + 0.006,
                f"{h:.2f}",
                ha="center",
                va="bottom",
                fontsize=8.5,
            )

    ax.set_ylim(0, 1.15)
    ax.set_title("Component Score Analysis — Matched vs. Not Matched Candidates")
    ax.set_xlabel("")
    ax.set_ylabel("Mean Component Score")
    ax.legend(title="Match Status", frameon=True)

    fig.tight_layout()
    _save(fig, "05_component_scores.png")


# ---------------------------------------------------------------------------
# 06 — Per-Project NDCG@10
# ---------------------------------------------------------------------------

def plot_per_project_ndcg(m: dict) -> None:
    per_proj = m["per_project_ndcg10"]["full_model"]
    random_mean = m["per_project_ndcg10"]["random_mean"]

    proj_ids = sorted(per_proj.keys())
    values = [per_proj[p] for p in proj_ids]

    fig, ax = plt.subplots(figsize=(10, max(5, len(proj_ids) * 0.45)))

    colors = [COLORS["Full Model"] if v > random_mean else COLORS["Random"] for v in values]
    bars = ax.barh(proj_ids, values, color=colors, edgecolor="white", height=0.6)

    # Random baseline line
    ax.axvline(
        x=random_mean,
        color=COLORS["Random"],
        linestyle="--",
        lw=1.8,
        label=f"Random mean ({random_mean:.3f})",
    )

    # Annotate values
    for bar, val in zip(bars, values):
        ax.text(
            val + 0.005,
            bar.get_y() + bar.get_height() / 2,
            f"{val:.3f}",
            va="center",
            fontsize=8.5,
        )

    ax.set_xlim(0, 1.1)
    ax.set_xlabel("NDCG@10")
    ax.set_title("NDCG@10 per Project — Full Model vs. Random Baseline")

    legend_patches = [
        mpatches.Patch(color=COLORS["Full Model"], label="Above random"),
        mpatches.Patch(color=COLORS["Random"],     label="Below random"),
        plt.Line2D([0], [0], color=COLORS["Random"], linestyle="--", lw=1.8, label=f"Random mean ({random_mean:.3f})"),
    ]
    ax.legend(handles=legend_patches, loc="lower right", frameon=True)

    fig.tight_layout()
    _save(fig, "06_per_project_ndcg.png")


# ---------------------------------------------------------------------------
# 07 — Summary Table
# ---------------------------------------------------------------------------

def plot_summary(m: dict) -> None:
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.axis("off")

    sep = m["score_separation"]
    p_val = sep["p_value"]
    p_str = f"{p_val:.2e}" if p_val < 0.001 else f"{p_val:.4f}"
    sig = "***" if p_val < 0.001 else ("**" if p_val < 0.01 else ("*" if p_val < 0.05 else "n.s."))

    rows = [
        ["Metric", "Full Model", "Skills-Only", "Random"],
        ["AUC-ROC",
         f"{m['auc']['full_model']:.4f}",
         f"{m['auc']['skills_only']:.4f}",
         f"{m['auc']['random']:.4f}"],
        ["Precision@5",
         f"{m['precision_at_k']['full_model']['5']:.4f}",
         f"{m['precision_at_k']['skills_only']['5']:.4f}",
         f"{m['precision_at_k']['random']['5']:.4f}"],
        ["Precision@10",
         f"{m['precision_at_k']['full_model']['10']:.4f}",
         f"{m['precision_at_k']['skills_only']['10']:.4f}",
         f"{m['precision_at_k']['random']['10']:.4f}"],
        ["Precision@20",
         f"{m['precision_at_k']['full_model']['20']:.4f}",
         f"{m['precision_at_k']['skills_only']['20']:.4f}",
         f"{m['precision_at_k']['random']['20']:.4f}"],
        ["NDCG@5",
         f"{m['ndcg_at_k']['full_model']['5']:.4f}",
         f"{m['ndcg_at_k']['skills_only']['5']:.4f}",
         f"{m['ndcg_at_k']['random']['5']:.4f}"],
        ["NDCG@10",
         f"{m['ndcg_at_k']['full_model']['10']:.4f}",
         f"{m['ndcg_at_k']['skills_only']['10']:.4f}",
         f"{m['ndcg_at_k']['random']['10']:.4f}"],
        ["NDCG@20",
         f"{m['ndcg_at_k']['full_model']['20']:.4f}",
         f"{m['ndcg_at_k']['skills_only']['20']:.4f}",
         f"{m['ndcg_at_k']['random']['20']:.4f}"],
        ["Score Δ (matched vs. not)",
         f"+{sep['delta']:.4f} (p={p_str} {sig})",
         "—", "—"],
        ["Dataset",
         f"{m['n_total']} pairs | {m['n_positive']} positive ({m['positive_rate']*100:.1f}%)",
         "—", "—"],
    ]

    col_widths = [0.32, 0.24, 0.22, 0.18]
    col_positions = [0.01, 0.33, 0.57, 0.79]
    row_height = 0.085
    y_start = 0.93

    # Header row
    for col_idx, (header, xpos) in enumerate(zip(rows[0], col_positions)):
        ax.text(
            xpos, y_start, header,
            transform=ax.transAxes,
            fontsize=11, fontweight="bold",
            color="white" if col_idx == 0 else "white",
            va="top",
        )

    header_bg = mpatches.FancyBboxPatch(
        (0, y_start - 0.01), 1, row_height + 0.015,
        boxstyle="round,pad=0.005", transform=ax.transAxes,
        facecolor="#1E3A5F", edgecolor="none", zorder=0,
    )
    ax.add_patch(header_bg)
    # Redraw header text on top
    for col_idx, (header, xpos) in enumerate(zip(rows[0], col_positions)):
        ax.text(xpos, y_start, header, transform=ax.transAxes,
                fontsize=11, fontweight="bold", color="white", va="top", zorder=1)

    # Data rows
    for row_idx, row in enumerate(rows[1:], 1):
        y = y_start - row_idx * row_height
        bg_color = "#EFF6FF" if row_idx % 2 == 0 else "white"
        bg = mpatches.FancyBboxPatch(
            (0, y - 0.005), 1, row_height,
            boxstyle="square,pad=0", transform=ax.transAxes,
            facecolor=bg_color, edgecolor="none", zorder=0,
        )
        ax.add_patch(bg)
        for col_idx, (cell, xpos) in enumerate(zip(row, col_positions)):
            fw = "bold" if col_idx == 0 else "normal"
            color = COLORS["Full Model"] if col_idx == 1 else (
                COLORS["Skills-Only"] if col_idx == 2 else COLORS["Random"]
            )
            ax.text(xpos, y + row_height * 0.55, cell,
                    transform=ax.transAxes,
                    fontsize=9.5, fontweight=fw, color=color if col_idx > 0 else "#1E293B",
                    va="center", zorder=1)

    ax.set_title("Evaluation Summary — Matching Algorithm", fontsize=14, fontweight="bold", pad=16)
    ax.text(0.5, -0.03,
            f"LLM-judged synthetic dataset | {m['n_total']} (project, candidate) pairs | Model: all-MiniLM-L6-v2",
            ha="center", transform=ax.transAxes, fontsize=8.5, color="#64748B")

    fig.tight_layout()
    _save(fig, "07_summary.png")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run(force: bool = False) -> None:
    if not METRICS_FILE.exists():
        print("ERROR: metrics.json not found. Run metrics.py first.", file=sys.stderr)
        sys.exit(1)

    PLOTS_DIR.mkdir(parents=True, exist_ok=True)

    if not force and any(PLOTS_DIR.glob("*.png")):
        print("  Plots already exist. Use --force to regenerate.")
        return

    with open(METRICS_FILE) as f:
        m = json.load(f)

    _apply_theme()
    print("  Generating charts...")
    plot_roc_curve(m)
    plot_score_distribution(m)
    plot_precision_at_k(m)
    plot_ndcg_at_k(m)
    plot_component_scores(m)
    plot_per_project_ndcg(m)
    plot_summary(m)
    print(f"  All charts saved → {PLOTS_DIR}/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate evaluation charts")
    parser.add_argument("--force", action="store_true", help="Regenerate even if plots exist")
    args = parser.parse_args()
    run(force=args.force)
