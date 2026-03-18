"""
pipeline.py — End-to-end evaluation pipeline orchestrator.

Runs all 5 steps in sequence, with optional skip flags for each stage
so you can re-run individual steps without redoing expensive API calls.

Usage:
  # Run everything from scratch
  python eval/pipeline.py

  # Skip generation and labeling (already done), re-run scoring + metrics + plots
  python eval/pipeline.py --skip-generate --skip-label

  # Force-regenerate plots only
  python eval/pipeline.py --skip-generate --skip-label --skip-score --skip-metrics --force-plot

  # Force everything from scratch (costs ~$0.15 in API calls)
  python eval/pipeline.py --force-all
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Dotenv loading — reads matching_algorithm/.env automatically
# ---------------------------------------------------------------------------
_ENV_FILE = Path(__file__).parent.parent / ".env"
if _ENV_FILE.exists():
    for line in _ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())


def _banner(text: str) -> None:
    width = 60
    print()
    print("=" * width)
    print(f"  {text}")
    print("=" * width)


def _step(name: str, skip: bool, force: bool, fn, *args, **kwargs) -> None:
    if skip:
        print(f"\n[SKIP] {name}")
        return
    _banner(name)
    t0 = time.time()
    fn(*args, **kwargs, force=force)
    elapsed = time.time() - t0
    print(f"\n  Completed in {elapsed:.1f}s")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the matching algorithm evaluation pipeline",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("--skip-generate", action="store_true", help="Skip profile/project generation")
    parser.add_argument("--skip-label",    action="store_true", help="Skip LLM labeling")
    parser.add_argument("--skip-score",    action="store_true", help="Skip scoring pairs")
    parser.add_argument("--skip-metrics",  action="store_true", help="Skip metrics computation")
    parser.add_argument("--skip-plot",     action="store_true", help="Skip chart generation")

    parser.add_argument("--force-generate", action="store_true", help="Force regenerate profiles/projects")
    parser.add_argument("--force-label",    action="store_true", help="Force re-label all pairs")
    parser.add_argument("--force-score",    action="store_true", help="Force re-score all pairs")
    parser.add_argument("--force-metrics",  action="store_true", help="Force recompute metrics")
    parser.add_argument("--force-plot",     action="store_true", help="Force regenerate charts")
    parser.add_argument("--force-all",      action="store_true", help="Force every step (implies all --force-* flags)")

    args = parser.parse_args()

    if args.force_all:
        args.force_generate = args.force_label = args.force_score = args.force_metrics = args.force_plot = True

    # Lazy imports — keeps startup fast and avoids import errors before setup
    from eval.generate import run as generate_run  # type: ignore
    from eval.label    import run as label_run      # type: ignore
    from eval.score    import run as score_run      # type: ignore
    from eval.metrics  import run as metrics_run    # type: ignore
    from eval.plot     import run as plot_run       # type: ignore

    print("\nMatching Algorithm Evaluation Pipeline")
    print(f"Working directory: {Path(__file__).parent.parent}")

    _step("Step 1/5 — Generate profiles & projects",
          args.skip_generate, args.force_generate, generate_run)

    _step("Step 2/5 — Label pairs with Claude",
          args.skip_label, args.force_label, label_run)

    _step("Step 3/5 — Score all pairs with MatchingEngine",
          args.skip_score, args.force_score, score_run)

    _step("Step 4/5 — Compute metrics",
          args.skip_metrics, args.force_metrics, metrics_run)

    _step("Step 5/5 — Generate charts",
          args.skip_plot, args.force_plot, plot_run)

    _banner("Pipeline complete")
    plots_dir = Path(__file__).parent / "data" / "plots"
    if plots_dir.exists():
        charts = sorted(plots_dir.glob("*.png"))
        if charts:
            print(f"\n  {len(charts)} charts saved to {plots_dir}/")
            for chart in charts:
                print(f"    {chart.name}")
    print()


if __name__ == "__main__":
    # Run from matching_algorithm/ root:  python eval/pipeline.py
    # Adjusts sys.path so eval.* imports resolve correctly
    repo_root = Path(__file__).parent.parent
    sys.path.insert(0, str(repo_root))
    main()
