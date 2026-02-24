import httpx
import json

BASE_URL = "http://localhost:8000"


def test_health_endpoint():
    response = httpx.get(f"{BASE_URL}/match/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "weights" in data
    assert "elo_rating" in data["weights"]


def test_match_scoring():
    
    payload = {
        "user_profile": {
            "skills": ["Python", "React", "Docker"],
            "interests": ["AI", "Web Development"],
            "bio": "Full-stack developer passionate about machine learning and web technologies"
        },
        "projects": [
            {
                "id": "1",
                "description": "Building an AI chatbot with Python and React",
                "skills_needed": ["Python", "React", "NLP"],
                "nice_to_have_skills": ["Docker"],
                "tags": ["AI", "Startups"]
            },
            {
                "id": "2",
                "description": "Mobile game using Unity",
                "skills_needed": ["C#", "Unity"],
                "tags": ["Gaming"]
            }
        ]
    }
    
    response = httpx.post(f"{BASE_URL}/match/score", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert "ranked_projects" in data
    assert data["count"] == 2
    
    projects = data["ranked_projects"]
    assert projects[0]["project_id"] == "1"
    assert projects[0]["total_score"] > projects[1]["total_score"]


def test_person_to_project_matching():
    payload = {
        "user_profile": {
            "skills": ["Python", "React"],
            "interests": ["AI"],
            "bio": "Software developer",
            "elo_rating": 1300.0,
            "experience_level": "intermediate",
            "location": "Toronto, ON"
        },
        "projects": [
            {
                "id": "1",
                "description": "AI project",
                "skills_needed": ["Python"],
                "tags": ["AI"],
                "elo_rating": 1200.0,
                "required_experience_level": "beginner",
                "location": "Toronto, ON"
            }
        ],
        "limit": 10
    }
    
    response = httpx.post(f"{BASE_URL}/match/person-to-project", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert "ranked_projects" in data
    assert len(data["ranked_projects"]) <= 10


def test_project_to_person_matching():
    payload = {
        "project": {
            "id": "1",
            "description": "AI chatbot project",
            "skills_needed": ["Python", "NLP"],
            "tags": ["AI"],
            "elo_rating": 1250.0,
            "required_experience_level": "intermediate",
            "location": "Remote"
        },
        "candidates": [
            {
                "id": "user1",
                "skills": ["Python", "NLP", "React"],
                "interests": ["AI"],
                "bio": "AI engineer",
                "elo_rating": 1400.0,
                "experience_level": "advanced",
                "location": "Toronto, ON"
            },
            {
                "id": "user2",
                "skills": ["Java", "Spring"],
                "interests": ["Backend"],
                "bio": "Backend developer",
                "elo_rating": 1100.0,
                "experience_level": "beginner",
                "location": "Vancouver, BC"
            }
        ],
        "limit": 10
    }
    
    response = httpx.post(f"{BASE_URL}/match/project-to-person", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert "ranked_projects" in data
    assert len(data["ranked_projects"]) <= 10
    
    if len(data["ranked_projects"]) >= 2:
        assert data["ranked_projects"][0]["total_score"] >= data["ranked_projects"][1]["total_score"]


def test_elo_update():
    payload = {
        "user_id": "user123",
        "project_id": "proj456",
        "user_elo": 1200.0,
        "project_elo": 1250.0,
        "match_quality": 0.8
    }
    
    response = httpx.post(f"{BASE_URL}/match/update-elo", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert "new_user_elo" in data
    assert "new_project_elo" in data
    assert data["user_id"] == "user123"
    assert data["project_id"] == "proj456"


if __name__ == "__main__":
    test_health_endpoint()
    test_match_scoring()
    test_person_to_project_matching()
    test_project_to_person_matching()
    test_elo_update()
