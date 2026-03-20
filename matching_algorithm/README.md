# Matching Algorithm

Weighted matching system for Peer.io that ranks projects and candidates based on:
- Semantic similarity — `all-MiniLM-L6-v2` sentence embeddings (35%)
- Skill match (55%)
- Interest alignment (10%)

## Installation

```bash
cd matching_algorithm
conda activate matching_algo   # or: python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REQUEST_TIMEOUT_SECONDS` | `30` | Per-request timeout |
| `LOG_LEVEL` | `INFO` | Set to `DEBUG` for per-candidate score breakdowns |
| `REDIS_HOST` | *(unset)* | Redis host for embedding cache; falls back to in-process LRU if unset |
| `MEM_CACHE_MAX_ENTRIES` | `1024` | Max entries for the in-process LRU fallback cache |

## Start API server

**Local dev:**
```bash
cd matching_algorithm
conda run -n matching_algo \
  python -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
```

**Production (Railway):** deploys automatically via `Procfile`. The model is downloaded into the image at build time via `nixpacks.toml` so there is no cold-start download penalty.

## API Endpoints

**POST /match/score** — rank projects for a user profile

```bash
curl -X POST http://localhost:8000/match/score \
  -H "Content-Type: application/json" \
  -d '{
    "user_profile": {
      "skills": ["Python", "React"],
      "interests": ["AI"],
      "bio": "Software engineer"
    },
    "projects": [{
      "id": "1",
      "description": "AI project",
      "skills": ["Python"],
      "tags": ["AI"]
    }]
  }'
```

**POST /match/candidates** — rank candidates for a project

**GET /match/health** — health check

## Testing

```bash
cd matching_algorithm
conda run -n matching_algo pytest tests/test_matching.py -v
```

## Custom Weights

```python
from matching_algorithm.matching import MatchWeights

custom = MatchWeights(semantic=0.35, skills=0.55, interests=0.10)
```
