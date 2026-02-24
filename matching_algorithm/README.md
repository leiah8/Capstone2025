# Matching Algorithm

Advanced weighted matching system for Peer.io that ranks projects and candidates based on multiple sophisticated components.

## Features

### Core Matching Components

1. **Semantic Similarity (25%)** - Uses sentence transformers (all-MiniLM-L6-v2) to compare text embeddings of user bios and project descriptions
2. **Must-Have Skills (30%)** - Critical skill matching with explicit tracking of matched and missing skills
3. **Nice-to-Have Skills (10%)** - Bonus scoring for additional desired skills
4. **Interest Alignment (10%)** - Jaccard similarity between user interests and project tags
5. **Elo Rating (15%)** - Dynamic reputation system with cold start mitigation
6. **Experience Level (5%)** - Matches candidate experience to project requirements
7. **Location (5%)** - Proximity-based scoring with support for remote work

### Advanced Features

- **Cold Start Problem Mitigation**: New users/projects receive a baseline boost to ensure discoverability
- **Elo Rating System**: Dynamic quality scoring that evolves based on match success
- **Bidirectional Matching**: Separate endpoints for person-to-project and project-to-person matching
- **Explainable AI**: Full breakdown of scoring components and matched/missing elements
- **Configurable Weights**: Customize scoring priorities via API parameters

## Installation

```bash
cd matching_algorithm
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
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

## API Endpoints

### 1. Health Check

**GET** `/match/health`

Returns the API status and current weight configuration.

```bash
curl http://localhost:8000/match/health
```

### 2. Person-to-Project Matching

**POST** `/match/person-to-project`

Finds the best projects for a given user profile.

```bash
curl -X POST http://localhost:8000/match/person-to-project \
  -H "Content-Type: application/json" \
  -d '{
    "user_profile": {
      "skills": ["Python", "React"],
      "interests": ["AI"],
      "bio": "Software engineer",
      "elo_rating": 1300,
      "experience_level": "intermediate",
      "location": "Toronto, ON"
    },
    "projects": [{
      "id": "1",
      "description": "AI project",
      "skills_needed": ["Python"],
      "tags": ["AI"],
      "elo_rating": 1200,
      "required_experience_level": "beginner",
      "location": "Remote"
    }],
    "limit": 50
  }'
```

### 3. Project-to-Person Matching

**POST** `/match/project-to-person`

Finds the best candidates for a given project.

```bash
curl -X POST http://localhost:8000/match/project-to-person \
  -H "Content-Type: application/json" \
  -d '{
    "project": {
      "id": "1",
      "description": "AI chatbot project",
      "skills_needed": ["Python", "NLP"],
      "tags": ["AI"],
      "elo_rating": 1250,
      "required_experience_level": "intermediate",
      "location": "Remote"
    },
    "candidates": [{
      "id": "user1",
      "skills": ["Python", "NLP"],
      "interests": ["AI"],
      "bio": "AI engineer",
      "elo_rating": 1400,
      "experience_level": "advanced",
      "location": "Toronto, ON"
    }],
    "limit": 50
  }'
```

### 4. Update Elo Ratings

**POST** `/match/update-elo`

Updates Elo ratings based on match quality feedback.

```bash
curl -X POST http://localhost:8000/match/update-elo \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user123",
    "project_id": "proj456",
    "user_elo": 1200,
    "project_elo": 1250,
    "match_quality": 0.8
  }'
```

### Custom Weights

All matching endpoints accept optional custom weights:

```json
{
  "weights": {
    "semantic": 0.3,
    "must_have_skills": 0.3,
    "nice_to_have_skills": 0.1,
    "interests": 0.1,
    "elo_rating": 0.1,
    "experience_match": 0.05,
    "location_match": 0.05
  }
}
```

## Response Format

```json
{
  "ranked_projects": [
    {
      "project_id": "1",
      "total_score": 0.8234,
      "breakdown": {
        "semantic_similarity": 0.7521,
        "must_have_skills": 1.0,
        "nice_to_have_skills": 0.5,
        "interest_alignment": 0.6667,
        "elo_rating": 0.5833,
        "experience_match": 1.0,
        "location_match": 1.0
      },
      "explanation": {
        "matched_must_have_skills": ["python", "react"],
        "matched_nice_to_have_skills": ["docker"],
        "matched_interests": ["ai"],
        "missing_must_have_skills": [],
        "experience_level_match": "meets_requirement",
        "location_distance": "remote"
      }
    }
  ],
  "count": 1
}
```

## Testing

### Run Unit Tests

```bash
cd matching_algorithm
pytest tests/test_matching.py -v
```

### Run API Tests

First, start the server:
```bash
uvicorn api.main:app --reload
```

Then in another terminal:
```bash
python tests/test_api.py
```

## Elo Rating System

The Elo rating system provides dynamic quality scoring:

- **Default Rating**: 1200 (new users/projects)
- **Rating Range**: 800-2000
- **K-Factor**: 32 (determines update magnitude)
- **Cold Start Boost**: New entities receive a minimum normalized score of 0.2 to ensure discoverability

### Elo Updates

When a match occurs, ratings are updated based on match quality (0.0-1.0):
- High quality match (0.8-1.0): Both entities gain rating
- Medium quality match (0.5-0.7): Small adjustments
- Low quality match (0.0-0.4): Both entities lose rating

## Experience Level Matching

- `beginner` → `intermediate` → `advanced` → `expert`
- Perfect match: User meets or exceeds requirement (score: 1.0)
- Close match: User is one level below (score: 0.7)
- Distant match: User is 2+ levels below (score: 0.3)

## Location Matching

- **Remote projects**: Always score 1.0
- **Exact match**: Same location string (score: 1.0)
- **Same city**: Different region, same city (score: 0.9)
- **Same region**: Different city, same region (score: 0.6)
- **Different**: No overlap (score: 0.3)

## Architecture

```
matching_algorithm/
├── matching.py           # Core matching engine
├── api/
│   └── main.py          # FastAPI endpoints
├── tests/
│   ├── test_matching.py # Unit tests
│   └── test_api.py      # API integration tests
└── requirements.txt
```

## Dependencies

- `sentence-transformers`: Semantic text similarity
- `scikit-learn`: Cosine similarity calculations
- `numpy`: Numerical operations
- `fastapi`: REST API framework
- `uvicorn`: ASGI server
- `pydantic`: Data validation

## Future Enhancements

- Historical match success tracking
- Collaborative filtering based on similar users
- Time-based preferences (availability matching)
- Project commitment level matching
- Skill proficiency levels (beginner/expert per skill)
- Multi-language support for international matching

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
