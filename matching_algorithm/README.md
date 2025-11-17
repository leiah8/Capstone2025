# Matching Algorithm

Weighted matching system for Peer.io that ranks projects based on:
- Semantic similarity (35%)
- Must-have skills match (40%)
- Nice-to-have skills match (15%)
- Interest alignment (10%)

## Installation

```bash
cd matching_algorithm
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Usage

### Start API Server

```bash
cd matching_algorithm
source venv/bin/activate
export PYTHONPATH=$(pwd)
uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

### API Endpoints

**POST /match/score** - Score and rank projects

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
      "skills_needed": ["Python"],
      "tags": ["AI"]
    }]
  }'
```

**GET /match/health** - Health check

```bash
curl http://localhost:8000/match/health
```

### Python API

```python
from matching_algorithm.matching import get_matching_engine

engine = get_matching_engine()
ranked = engine.rank_projects(user_profile, projects)
```

## Testing

```bash
cd matching_algorithm
source venv/bin/activate
export PYTHONPATH=$(pwd)
pytest tests/test_matching.py -v
```

## Custom Weights

```python
from matching_algorithm.matching import MatchWeights

custom = MatchWeights(
    semantic=0.2,
    must_have_skills=0.5,
    nice_to_have_skills=0.2,
    interests=0.1
)
```
