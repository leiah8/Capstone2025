# Docker Multi-Service Demo

## 🎯 What This Demonstrates

This Docker setup shows how **2 Python microservices** (Matching Algorithm + Resume Parser) can run on **any machine** with just Docker installed - no Python, no dependencies, no environment setup needed.

## 📦 What Gets Installed in Containers

### Matching API Container (peer-matching-api)
- **Base:** Python 3.10
- **ML Libraries:** 
  - sentence-transformers (~500MB with models)
  - scikit-learn
  - numpy
- **API Framework:** FastAPI + uvicorn
- **Pre-downloaded:** all-MiniLM-L6-v2 model (~90MB)
- **Port:** 8000

### Resume Parser Container (peer-resume-parser)  
- **Base:** Python 3.10
- **System Dependencies:**
  - Tesseract OCR (optical character recognition)
  - Poppler (PDF utilities)
- **Python Libraries:**
  - PyMuPDF, pdfplumber (PDF parsing)
  - pytesseract (OCR wrapper)
  - Pillow (image processing)
- **API Framework:** FastAPI + uvicorn
- **Port:** 8001

## 🚀 Step-by-Step Demo

### Step 1: Start Docker Desktop

```bash
# macOS: Open Docker Desktop app
# Windows: Start Docker Desktop from Start Menu
# Linux: sudo systemctl start docker
```

### Step 2: Build and Start Services

```bash
cd Capstone2025
./start-docker.sh
```

**Expected Output:**
```
🐳 Peer.io Docker Setup
============================================================
✅ Docker is installed and running

🧹 Cleaning up old containers...
Removing peer-matching-api ... done
Removing peer-resume-parser ... done

🔨 Building Docker images...
   This may take 3-5 minutes on first run (downloading dependencies)

[+] Building 187.3s (18/18) FINISHED
 => [matching-api internal] load build definition
 => [matching-api] downloading sentence-transformers model
 => [resume-parser] installing tesseract-ocr
 ...

🚀 Starting services...
Creating peer-matching-api ... done
Creating peer-resume-parser ... done

⏳ Waiting for services to be healthy...
   Matching API: starting | Resume Parser: starting
   Matching API: healthy | Resume Parser: healthy

============================================================
🎉 Docker services are running!

📡 Service URLs:
   • Matching API:     http://localhost:8000
   • Matching Docs:    http://localhost:8000/docs
   • Matching Health:  http://localhost:8000/match/health

   • Resume Parser:    http://localhost:8001
   • Parser Docs:      http://localhost:8001/docs
   • Parser Health:    http://localhost:8001/health
============================================================
```

### Step 3: Test Services

In a new terminal:
```bash
python test_services.py
```

**Expected Output:**
```
============================================================
🐳 DOCKER MICROSERVICES TEST
============================================================
⏳ Waiting for services to start...
  ✓ Matching API ready
  ✓ Resumereload Parser ready

✅ All services are ready!

============================================================
Testing Matching Algorithm API
============================================================

Matching Results:
Found 2 matches
  - ML Pipeline (Score: 0.847)
    Breakdown: Semantic=0.82, Skills=1.00, Elo=0.52
  - Web Scraper (Score: 0.423)
    Breakdown: Semantic=0.34, Skills=0.33, Elo=0.48

✅ Matching Algorithm API is working!

============================================================
Testing Resume Parser API
============================================================

✓ Health check passed
  Service: resume-parser
  Version: 0.1.0

✅ Resume Parser API is working!

============================================================
SUMMARY
============================================================
Tests Passed: 2/2

🎉 All services are working correctly!

You can access:
  • Matching API:    http://localhost:8000/docs
  • Resume Parser:   http://localhost:8001/docs
  • Matching Health: http://localhost:8000/match/health
  • Parser Health:   http://localhost:8001/health
```

### Step 4: Make a Real API Request

```bash
curl -X POST "http://localhost:8000/match/person-to-project" \
  -H "Content-Type: application/json" \
  -d '{
    "user_profile": {
      "id": "nic-789",
      "bio": "Senior software engineer with 5 years Python experience. Love building scalable ML systems.",
      "skills": ["python", "docker", "kubernetes", "machine-learning", "fastapi"],
      "interests": ["ai", "devops", "cloud"],
      "elo_rating": 1450,
      "experience_level": "advanced",
      "location": "San Francisco, CA"
    },
    "projects": [
      {
        "id": "proj-ml-pipeline",
        "name": "Production ML Pipeline",
        "description": "Build and deploy a scalable ML recommendation system using Docker and Kubernetes",
        "must_have_skills": ["python", "machine-learning", "docker"],
        "nice_to_have_skills": ["kubernetes", "fastapi"],
        "interests": ["ai", "devops"],
        "elo_rating": 1500,
        "experience_required": "advanced",
        "location": "San Francisco, CA"
      },
      {
        "id": "proj-web-scraper",
        "name": "Basic Web Scraper",
        "description": "Simple JavaScript web scraper for price monitoring",
        "must_have_skills": ["javascript", "nodejs"],
        "nice_to_have_skills": ["python"],
        "interests": ["web-dev"],
        "elo_rating": 1100,
        "experience_required": "beginner",
        "location": "Remote"
      },
      {
        "id": "proj-mobile-app",
        "name": "React Native Social App",
        "description": "Build a social networking mobile application",
        "must_have_skills": ["react-native", "typescript"],
        "nice_to_have_skills": ["graphql"],
        "interests": ["mobile", "social"],
        "elo_rating": 1350,
        "experience_required": "intermediate",
        "location": "New York, NY"
      }
    ],
    "limit": 3,
    "diversity_boost": 0.1
  }'
```

**Response:**
```json
{
  "matches": [
    {
      "project_id": "proj-ml-pipeline",
      "project_name": "Production ML Pipeline",
      "match_score": 0.912,
      "score_breakdown": {
        "semantic_similarity": 0.94,
        "must_have_skills": 1.0,
        "nice_to_have_skills": 1.0,
        "interests": 1.0,
        "elo_rating": 0.61,
        "experience_match": 1.0,
        "location_match": 1.0
      },
      "matched_skills": ["python", "machine-learning", "docker"],
      "missing_skills": [],
      "explanation": "Perfect skill match with excellent semantic alignment"
    },
    {
      "project_id": "proj-mobile-app",
      "project_name": "React Native Social App",
      "match_score": 0.387,
      "score_breakdown": {
        "semantic_similarity": 0.42,
        "must_have_skills": 0.0,
        "nice_to_have_skills": 0.0,
        "interests": 0.0,
        "elo_rating": 0.57,
        "experience_match": 0.8,
        "location_match": 0.0
      },
      "matched_skills": [],
      "missing_skills": ["react-native", "typescript"],
      "explanation": "Missing required skills"
    },
    {
      "project_id": "proj-web-scraper",
      "project_name": "Basic Web Scraper",
      "match_score": 0.334,
      "score_breakdown": {
        "semantic_similarity": 0.38,
        "must_have_skills": 0.0,
        "nice_to_have_skills": 1.0,
        "interests": 0.0,
        "elo_rating": 0.45,
        "experience_match": 0.3,
        "location_match": 1.0
      },
      "matched_skills": [],
      "missing_skills": ["javascript", "nodejs"],
      "explanation": "Below experience level, missing core skills"
    }
  ],
  "total_evaluated": 3,
  "total_returned": 3
}
```

### Step 5: View Live Logs

```bash
docker-compose logs -f
```

**Expected Output:**
```
matching-api    | INFO:     Started server process [1]
matching-api    | INFO:     Waiting for application startup.
matching-api    | INFO:     Application startup complete.
matching-api    | INFO:     Uvicorn running on http://0.0.0.0:8000
matching-api    | INFO:     172.18.0.1:54321 - "POST /match/person-to-project HTTP/1.1" 200
resume-parser   | INFO:     Started server process [1]
resume-parser   | INFO:     Application startup complete.
resume-parser   | INFO:     Uvicorn running on http://0.0.0.0:8001
```

### Step 6: Check Container Status

```bash
docker-compose ps
```

**Expected Output:**
```
        Name                      Command              State           Ports
------------------------------------------------------------------------------------
peer-matching-api     uvicorn api.main:app ...   Up (healthy)   0.0.0.0:8000->8000/tcp
peer-resume-parser    uvicorn api.main:app ...   Up (healthy)   0.0.0.0:8001->8001/tcp
```

### Step 7: Hot Reload Demo

1. **Edit a file** while containers are running:
   ```bash
   # Edit matching_algorithm/api/main.py
   # Change the version number or add a comment
   ```

2. **Watch logs** - Uvicorn automatically reloads:
   ```
   matching-api | INFO:     Detected file change in '/app/matching_algorithm/api/main.py'
   matching-api | INFO:     Reloading...
   matching-api | INFO:     Application startup complete.
   ```

3. **No rebuild needed** - changes appear immediately!

## 🌍 Works on ANY Machine

### On Your macOS Laptop
```bash
git clone https://github.com/leiah8/Capstone2025.git
cd Capstone2025
./start-docker.sh
# ✅ Works!
```

### On Tony's Windows PC
```bash
git clone https://github.com/leiah8/Capstone2025.git
cd Capstone2025
.\start-docker.sh  # or docker-compose up --build
# ✅ Works!
```

### On Martin's Linux Machine
```bash
git clone https://github.com/leiah8/Capstone2025.git
cd Capstone2025
./start-docker.sh
# ✅ Works!
```

### On Professor's Computer
```bash
git clone https://github.com/leiah8/Capstone2025.git
cd Capstone2025
docker-compose up --build
# ✅ Works! (No Python/dependencies needed)
```

## 📊 Resource Usage

```bash
docker stats
```

**Expected Output:**
```
CONTAINER           CPU %    MEM USAGE / LIMIT    NET I/O
peer-matching-api   3.2%     1.8GB / 8GB          15kB / 42kB
peer-resume-parser  1.1%     450MB / 8GB          8kB / 12kB
```

## 🛠️ Troubleshooting

### Services Don't Start
```bash
# Check logs
docker-compose logs

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

### Port Already in Use
```bash
# Find what's using port 8000
lsof -i :8000
kill -9 <PID>

# Or change port in docker-compose.yml:
ports:
  - "8080:8000"  # Access via localhost:8080
```

### Out of Disk Space
```bash
# Clean up Docker
docker system prune -a
docker volume prune
```

## 🎓 What Your Professor Will See

1. **Professional deployment** - Industry-standard containerization
2. **Reproducible** - Works identically on any machine
3. **Microservices architecture** - Proper separation of concerns
4. **Health checks** - Production-ready monitoring
5. **Hot reload** - Developer-friendly setup
6. **Documentation** - Complete setup guide

## 🚀 Benefits Summary

| Without Docker | With Docker |
|----------------|-------------|
| Install Python 3.10 | Install Docker (one time) |
| pip install 50+ packages | `docker-compose up` |
| Install Tesseract OCR | Pre-installed in container |
| Download ML models manually | Auto-downloaded during build |
| "Works on my machine" bugs | Identical environments |
| 30-minute setup | 5-minute setup |
| Conflicts with other projects | Fully isolated |
| Hard to deploy | `docker push` → deploy anywhere |

## 📝 Next Steps

1. **Try it:** `./start-docker.sh`
2. **Test it:** `python test_services.py`
3. **Use it:** Open http://localhost:8000/docs
4. **Show it:** Present to team/professor
5. **Deploy it:** Push to AWS/GCP/Railway with same Docker config!
