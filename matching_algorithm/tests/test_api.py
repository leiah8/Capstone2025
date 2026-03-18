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


def test_candidate_matching():
    print("\nTesting candidate matching endpoint...")

    payload = {
        "project": {
            "title": "AI-Powered Web App",
            "description": "Building an AI-powered web application using Python and React",
            "skills": ["Python", "React", "Machine Learning"],
            "tags": ["AI", "Web Development"],
        },
        "candidates": [
            {
                "id": "candidate_1",
                "name": "Alice Smith",
                "bio": "Full-stack developer with a strong machine learning background",
                "skills": ["Python", "React", "Machine Learning", "Docker"],
                "interests": ["AI", "Web Development"],
            },
            {
                "id": "candidate_2",
                "name": "Bob Jones",
                "bio": "Game developer focused on Unity and C#",
                "skills": ["C#", "Unity"],
                "interests": ["Gaming"],
            },
        ],
    }

    response = httpx.post(f"{BASE_URL}/match/candidates", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "ranked_candidates" in data
    assert data["count"] == 2

    candidates = data["ranked_candidates"]

    # Alice should rank higher — she matches all three must-have skills
    assert candidates[0]["candidate_id"] == "candidate_1", (
        "Alice should rank first due to full must-have skill match"
    )
    assert candidates[0]["total_score"] > candidates[1]["total_score"]

    # Verify must-have skills are actually evaluated (not silently empty)
    alice = candidates[0]
    must_have_score = alice["breakdown"]["must_have_skills"]
    assert must_have_score > 0, (
        "Must-have skill score should be > 0 for a candidate who matches all required skills"
    )
    assert must_have_score == 1.0, (
        "Alice has all three must-have skills so score should be 1.0"
    )

    # Bob has no matching must-have skills
    bob = candidates[1]
    assert bob["breakdown"]["must_have_skills"] == 0.0, (
        "Bob has no matching must-have skills so score should be 0.0"
    )

    print(f"Candidate matching passed")
    print(f"Candidate 1 (Alice) score: {alice['total_score']:.4f}, must-have: {must_have_score:.4f}")
    print(f"Candidate 2 (Bob) score: {bob['total_score']:.4f}")


def test_batch_matching():
    print("\nTesting batch matching endpoint...")

    payload = {
        "user_profiles": [
            {
                "id": "user_1",
                "skills": ["Python", "React", "Machine Learning"],
                "interests": ["AI", "Web Development"],
                "bio": "Full-stack developer with ML expertise"
            },
            {
                "id": "user_2",
                "skills": ["C#", "Unity"],
                "interests": ["Gaming"],
                "bio": "Game developer specializing in Unity"
            },
            {
                "id": "user_3",
                "skills": ["Python", "Docker", "Kubernetes"],
                "interests": ["DevOps", "Cloud"],
                "bio": "DevOps engineer with Python automation skills"
            }
        ],
        "projects": [
            {
                "id": "proj_1",
                "description": "Building an AI chatbot with Python and React",
                "skills_needed": ["Python", "React", "NLP"],
                "nice_to_have_skills": ["Docker"],
                "tags": ["AI", "Web Development"]
            },
            {
                "id": "proj_2",
                "description": "Mobile game development using Unity",
                "skills_needed": ["C#", "Unity"],
                "tags": ["Gaming"]
            },
            {
                "id": "proj_3",
                "description": "Cloud infrastructure automation",
                "skills_needed": ["Python", "Docker", "Kubernetes"],
                "tags": ["DevOps", "Cloud"]
            }
        ]
    }

    response = httpx.post(f"{BASE_URL}/match/batch", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "results" in data
    assert data["total_profiles"] == 3
    assert data["total_projects"] == 3
    assert "processing_time_seconds" in data

    results = data["results"]
    assert len(results) == 3

    # Verify each user has their matches
    user1_result = next(r for r in results if r["user_id"] == "user_1")
    user2_result = next(r for r in results if r["user_id"] == "user_2")
    user3_result = next(r for r in results if r["user_id"] == "user_3")

    # User 1 should match best with proj_1 (AI chatbot)
    assert user1_result["ranked_projects"][0]["project_id"] == "proj_1"

    # User 2 should match best with proj_2 (Unity game)
    assert user2_result["ranked_projects"][0]["project_id"] == "proj_2"

    # User 3 should match best with proj_3 (DevOps)
    assert user3_result["ranked_projects"][0]["project_id"] == "proj_3"

    print(f"Batch matching passed")
    print(f"Processed {data['total_profiles']} users in {data['processing_time_seconds']:.3f}s")
    print(f"Average: {data['processing_time_seconds']/data['total_profiles']:.3f}s per user")


if __name__ == "__main__":
    test_health_endpoint()
    test_match_scoring()
    test_candidate_matching()
    test_batch_matching()
    print("\nAll API tests passed")
