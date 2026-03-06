# Docker Quick Start Guide

## Prerequisites
- Docker Desktop installed ([download](https://www.docker.com/products/docker-desktop))
- No need to install Python, Tesseract, or any dependencies!

## Architecture

This project runs **2 Python microservices** in separate containers:

```
┌─────────────────────────────────────────────────┐
│              Docker Network (peer-network)       │
│                                                  │
│  ┌──────────────────┐    ┌──────────────────┐  │
│  │  Matching API    │    │  Resume Parser   │  │
│  │  Port: 8000      │    │  Port: 8001      │  │
│  │                  │    │                  │  │
│  │  FastAPI         │    │  FastAPI         │  │
│  │  sentence-trans. │    │  PyMuPDF         │  │
│  │  scikit-learn    │    │  Tesseract OCR   │  │
│  └──────────────────┘    └──────────────────┘  │
│         ↓                         ↓             │
└─────────────────────────────────────────────────┘
          ↓                         ↓
    localhost:8000            localhost:8001
```

## Quick Start

### 1. Build and Start All Services
```bash
docker-compose up --build
```

First time will take 3-5 minutes to:
- Download Python base images
- Install all dependencies
- Download ML models (sentence-transformers)
- Install system packages (Tesseract)

### 2. Verify Services Running

**Terminal 1 - Watch logs:**
```bash
docker-compose logs -f
```

**Terminal 2 - Test services:**
```bash
# Wait 30-40 seconds for services to fully start, then:
python test_services.py
```

Or manually:
- **Matching API Health**: http://localhost:8000/match/health
- **Matching API Docs**: http://localhost:8000/docs
- **Resume Parser Health**: http://localhost:8001/health
- **Resume Parser Docs**: http://localhost:8001/docs

### 3. Test Matching Algorithm
```bash
curl -X POST "http://localhost:8000/match/person-to-project" \
  -H "Content-Type: application/json" \
  -d '{
    "user_profile": {
      "id": "user-1",
      "bio": "Python developer interested in ML",
      "skills": ["python", "machine-learning"],
      "interests": ["ai"],
      "elo_rating": 1200,
      "experience_level": "intermediate"
    },
    "projects": [{
      "id": "proj-1",
      "name": "ML Pipeline",
      "description": "Build ML system",
      "must_have_skills": ["python"],
      "elo_rating": 1300,
      "experience_required": "intermediate"
    }],
    "limit": 5
  }'
```

### 4. Stop Services
```bash
docker-compose down
```

## Development Workflow

### Code Changes (Hot Reload)
Your code is mounted as a volume, so changes appear immediately:
1. Edit `matching_algorithm/matching.py`
2. Save file
3. API restarts automatically (if using `--reload` flag)

### Rebuild After Dependencies Change
```bash
# If you update requirements.txt
docker-compose up --build matching-api

# If you update resume_parser/requirements.txt
docker-compose up --build resume-parser
```

### Run Tests Inside Container
```bash
# Matching algorithm tests
docker-compose exec matching-api pytest tests/ -v

# Resume parser tests  
docker-compose exec resume-parser pytest tests/ -v
```

### Access Container Shell
```bash
docker-compose exec matching-api bash
docker-compose exec resume-parser bash
```

## Production Deployment

### Build Production Images
```bash
docker build -t peer-matching-api:latest -f matching_algorithm/Dockerfile .
docker build -t peer-resume-parser:latest -f resume_parser/Dockerfile .
```

### Push to Registry (example: Docker Hub)
```bash
docker tag peer-matching-api:latest yourusername/peer-matching-api:latest
docker push yourusername/peer-matching-api:latest
```

## Troubleshooting

### Services won't start
```bash
# Check logs
docker-compose logs

# Remove all containers and rebuild
docker-compose down -v
docker-compose up --build
```

### Port already in use
```bash
# Find what's using port 8000
lsof -i :8000
# Kill it or change port in docker-compose.yml
```

### Out of disk space
```bash
# Clean up unused Docker resources
docker system prune -a
```

## Team Onboarding

New team member setup takes **2 commands**:
```bash
git clone https://github.com/leiah8/Capstone2025.git
cd Capstone2025
docker-compose up --build
```

No Python installation, no dependency hell! 🎉
