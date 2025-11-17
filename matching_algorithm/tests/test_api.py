import httpx
import json

BASE_URL = "http://localhost:8000"


def test_health_endpoint():
    print("\nTesting health endpoint...")
    response = httpx.get(f"{BASE_URL}/match/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    print(f"Health check passed: {data}")


def test_match_scoring():
    print("\nTesting match scoring endpoint...")
    
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
    
    print(f"Match scoring passed")
    print(f"Project 1 score: {projects[0]['total_score']:.4f}")
    print(f"Project 2 score: {projects[1]['total_score']:.4f}")


if __name__ == "__main__":
    test_health_endpoint()
    test_match_scoring()
    print("\nAll API tests passed")
