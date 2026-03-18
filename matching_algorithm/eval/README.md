# Matching Algorithm Evaluation Pipeline

> Automated evaluation of the talent-matching algorithm using a synthetic LLM-judged dataset,
> because no real swipe history exists yet.

---

## Background

The platform matches software developers to projects using a four-component scoring formula:

```
total = 0.35 × semantic_similarity
      + 0.40 × must_have_skills
      + 0.15 × nice_to_have_skills
      + 0.10 × interest_alignment
```

- **Semantic similarity** — cosine similarity between `all-MiniLM-L6-v2` embeddings of the candidate's bio and the project description
- **Must-have skills** — fraction of required project skills the candidate possesses
- **Nice-to-have skills** — fraction of optional skills matched
- **Interest alignment** — Jaccard similarity between the candidate's interest tags and the project's domain tags

Standard information-retrieval metrics (AUC-ROC, Precision@K, NDCG@K) require ground-truth relevance labels — i.e., did a project owner actually want to contact this candidate? The platform has no production swipe data. This evaluation pipeline solves that problem by generating a synthetic, LLM-judged dataset and using it to measure whether the algorithm ranks relevant candidates above irrelevant ones.

---

## Methodology

### LLM-as-judge

Each of the 900 (project, candidate) pairs is labelled by Claude Haiku (`claude-haiku-4-5-20251001`) acting as a simulated project owner. The judge answers a single binary question per pair:

> "Would a project owner reasonably want to reach out to this candidate to discuss joining the team?"

This produces a binary relevance label (1 = YES, 0 = NO) with a one-sentence justification for each pair.

This approach is academically defensible on three grounds:

1. **Established precedent.** LLM-as-judge is used in published NLP benchmarks including MT-Bench, HELM, and AlpacaEval. Using an LLM to produce evaluation labels is a well-understood methodology with known strengths and limitations.

2. **No model leakage.** The judge model (Claude Haiku, a large autoregressive language model trained on broad internet data) and the model being evaluated (`all-MiniLM-L6-v2`, a 22M-parameter bi-encoder trained on sentence pairs) are architecturally distinct and trained on different data distributions. There is no mechanism by which the judge's preferences could be encoded in the scoring model's weights.

3. **Intentional hard cases.** The synthetic dataset is engineered to include pairs that should produce clear signal in both directions: strong matches (ML engineer applying to an ML project), clear mismatches (UX designer with no coding skills applying to a backend API project), and challenging edge cases (cold-start profiles with no bio or skills, domain-adjacent candidates). A scoring model that assigns near-random ranks to these pairs would fail the evaluation, so the dataset has discriminative power.

### Reproducibility

All generated data — profiles, projects, labels, scores, and metrics — is serialised to JSON in `eval/data/` and committed to the repository. Re-running the pipeline with `--force-all` regenerates everything deterministically (modulo LLM temperature variation), but the committed data files make the published results reproducible without any API calls.

---

## Dataset

| Property | Value |
|---|---|
| Candidate profiles | 60 |
| Projects | 15 |
| (project, candidate) pairs | 900 |
| Positive label rate | ~30–40% (set by judge prompt calibration) |
| Labeling batch size | 10 pairs per API call |
| Random baseline seeds | 50 |

### Profile archetypes (60 profiles across 6 batches of 10)

| Batch | Focus | Notable edge cases |
|---|---|---|
| 0 | Web and frontend developers | 2 empty bios, skill counts 1–8 |
| 1 | ML/AI and data professionals | 1 empty bio, MLOps-focused variants |
| 2 | Mobile (iOS, Android, React Native, Flutter) | 1 profile with a single skill |
| 3 | Backend, DevOps, cloud, security | 1 no-bio profile, 3 profiles with 8+ skills |
| 4 | Designers, PMs, and technical writers | Intentional low-match candidates for technical projects |
| 5 | Edge cases: blockchain, game dev, embedded, empty | 2 fully empty profiles (no skills, no interests, no bio) |

### Project distribution (15 projects)

3 web apps, 3 ML/AI projects, 2 mobile apps, 2 full-stack products, 2 data pipeline/analytics projects, 1 DevOps/cloud project, 1 blockchain/Web3 project, 1 open-ended project with minimal requirements.

---

## Pipeline Steps

### Step 1 — `generate.py`

Calls Claude Haiku in 7 batches (6 profile batches of 10 + 1 project batch) to produce:

- `data/profiles.json` — 60 synthetic user profiles with `id`, `name`, `archetype`, `skills`, `interests`, and `bio`
- `data/projects.json` — 15 synthetic projects with `id`, `name`, `description`, `skills_needed`, `nice_to_have_skills`, and `tags`

Profiles are generated in archetype-focused batches to ensure diversity across skill levels, domains, and completeness. Each batch prompt specifies exact archetypes and edge-case requirements.

### Step 2 — `label.py`

Iterates over all 900 pairs in batches of 10 and calls Claude Haiku with a structured prompt that presents the project and candidate side-by-side. The judge is calibrated with an explicit positive-rate target (~30–40%) and a tie-breaking rule for empty profiles.

Checkpointing: `data/labels.json` is written after every batch. If the run is interrupted, resuming the pipeline skips already-labelled pairs and picks up from where it stopped.

### Step 3 — `score.py`

Runs the production `MatchingEngine` on all 900 pairs.

Two optimisations keep this step fast:

- **Batch pre-encoding.** All unique bio and description texts are collected, deduplicated, and encoded in a single `SentenceTransformer.encode()` call (batch size 64) before the scoring loop starts. The 900-pair loop then reads from an in-memory cache rather than re-encoding on every call.
- **Redis bypass.** The eval environment uses a lightweight `_InMemoryCache` that satisfies the `EmbeddingCache` interface without requiring a Redis connection.

Each pair is scored twice — once with the full production weights and once with the skills-only baseline weights. Both scores are saved to `data/scores.json` alongside the actual weights used, so downstream steps are not coupled to hard-coded constants.

### Step 4 — `metrics.py`

Joins `labels.json` and `scores.json` on `(project_id, candidate_id)` and computes the following metrics for each of the three systems (full model, skills-only, random):

| Metric | Description |
|---|---|
| AUC-ROC | Area under the ROC curve across all 900 pairs |
| Precision@K | Fraction of true positives in the top-K results, macro-averaged over projects (K = 5, 10, 20) |
| NDCG@K | Normalised discounted cumulative gain, macro-averaged over projects with at least one positive label (K = 5, 10, 20) |
| Score separation | Difference in mean scores between matched and unmatched pairs; Mann-Whitney U test p-value |
| Component analysis | Mean score per component (semantic, must-have, nice-to-have, interests) split by match label |
| Per-project NDCG@10 | NDCG@10 for each individual project vs. the random mean |

The random baseline averages Precision@K and NDCG@K over 50 independent random shuffles. Each shuffle independently randomises scores within each project group, so the baseline reflects the expected performance of a random ranker rather than a single lucky draw.

Results are saved to `data/metrics.json`.

### Step 5 — `plot.py`

Reads `data/metrics.json` and generates 7 charts into `data/plots/`. This step makes no API calls and can be re-run freely.

---

## Baselines

| System | Weights |
|---|---|
| Full Model | semantic=0.35, must_have=0.40, nice_to_have=0.15, interests=0.10 |
| Skills-Only | semantic=0.00, must_have=0.85, nice_to_have=0.15, interests=0.00 |
| Random | Uniform random scores, averaged over 50 seeds |

The skills-only baseline isolates the contribution of semantic understanding. If the full model materially outperforms skills-only, it indicates that the bio-to-description semantic similarity signal captures match quality beyond what can be determined from skill lists alone.

---

## Charts

| File | Description |
|---|---|
| `01_roc_curve.png` | ROC curves for full model and skills-only vs. the random diagonal |
| `02_score_distribution.png` | Violin plot of total scores split by matched / not-matched label; annotated with means and Mann-Whitney p-value |
| `03_precision_at_k.png` | Grouped bar chart: Precision@5, @10, @20 for all three systems |
| `04_ndcg_at_k.png` | Grouped bar chart: NDCG@5, @10, @20 for all three systems |
| `05_component_scores.png` | Mean score per component for matched vs. not-matched candidates; weights annotated on x-axis |
| `06_per_project_ndcg.png` | Horizontal bar chart of NDCG@10 per project; bars above the random mean are blue, below are grey |
| `07_summary.png` | Full metrics table rendered as a styled figure for inclusion in reports |

---

## File Structure

```
eval/
├── pipeline.py         — orchestrator (run this)
├── generate.py         — Claude-powered data generation
├── label.py            — Claude-powered annotation
├── score.py            — MatchingEngine scoring
├── metrics.py          — metric computation
├── plot.py             — chart generation
├── requirements-eval.txt  — eval-only Python dependencies
└── data/
    ├── profiles.json   — 60 synthetic profiles
    ├── projects.json   — 15 synthetic projects
    ├── labels.json     — 900 LLM-judged labels (checkpointed incrementally)
    ├── scores.json     — 900 scored pairs + model weights used
    ├── metrics.json    — all computed metrics
    └── plots/          — 7 PNG charts
```

`data/` files are committed to the repository so the reported results are reproducible without running the pipeline again.

---

## Setup

**Prerequisites**

- Python 3.10+
- The production dependencies from `matching_algorithm/requirements.txt` must be installed (includes `sentence-transformers` and `scikit-learn`)
- An Anthropic API key (required only for steps 1 and 2)

**Install eval dependencies**

```bash
# Run from matching_algorithm/
pip install -r requirements-eval.txt
```

**Set the API key**

Create `matching_algorithm/.env` with:

```
ANTHROPIC_API_KEY=sk-ant-...
```

The pipeline loads this file automatically on startup; no manual `export` is needed.

---

## Running the Pipeline

**Run everything from scratch**

```bash
# Run from matching_algorithm/
python eval/pipeline.py
```

**Skip expensive steps when data already exists**

```bash
# Re-run only metrics and charts (no API calls)
python eval/pipeline.py --skip-generate --skip-label --skip-score

# Regenerate only the charts (free, reads metrics.json)
python eval/pipeline.py --skip-generate --skip-label --skip-score --skip-metrics --force-plot
```

**Force full regeneration**

```bash
python eval/pipeline.py --force-all
```

**Run individual steps**

Each script can be run independently from `matching_algorithm/`:

```bash
python eval/generate.py [--force]
python eval/label.py    [--force]
python eval/score.py    [--force]
python eval/metrics.py  [--force]
python eval/plot.py     [--force]
```

---

## Cost

A full run from scratch (steps 1 and 2) costs approximately **$0.15 USD** in Anthropic API credits using Claude Haiku pricing. Steps 3–5 are free (no API calls).

The committed `data/` files mean this cost is incurred once per intentional dataset regeneration, not on every evaluation run.

---

## Dependencies

| Package | Min version | Used by |
|---|---|---|
| `anthropic` | 0.40.0 | `generate.py`, `label.py` |
| `sentence-transformers` | (from `requirements.txt`) | `score.py` |
| `scikit-learn` | (from `requirements.txt`) | `metrics.py` (AUC, NDCG), `score.py` |
| `matplotlib` | 3.8.0 | `plot.py` |
| `seaborn` | 0.13.0 | `plot.py` |
| `pandas` | 2.1.0 | `metrics.py`, `plot.py` |
| `scipy` | 1.11.0 | `metrics.py` (Mann-Whitney U) |
| `numpy` | (from `requirements.txt`) | throughout |
