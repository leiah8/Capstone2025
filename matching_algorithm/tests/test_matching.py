import pytest
from fastapi.testclient import TestClient
from matching import MatchingEngine, MatchWeights, MatchScore
from api.main import app

client = TestClient(app)


@pytest.fixture
def engine():
    return MatchingEngine(model_name="all-MiniLM-L6-v2")


@pytest.fixture
def sample_user_profile():
    return {
        "id": "user123",
        "name": "Alice Developer",
        "skills": ["Python", "React", "Node.js", "PostgreSQL", "Docker"],
        "interests": ["AI", "Web Development", "Startups"],
        "bio": "Full-stack developer with 3 years of experience building web applications. "
               "Passionate about machine learning and creating user-friendly interfaces."
    }


@pytest.fixture
def sample_projects():
    return [
        {
            "id": "proj1",
            "title": "AI Chatbot Platform",
            "description": "Building an AI-powered chatbot using Python and React. "
                          "Need help with backend API development and NLP integration.",
            "skills": ["Python", "React", "FastAPI", "Docker", "PostgreSQL"],
            "tags": ["AI", "Startups"]
        },
        {
            "id": "proj2",
            "title": "Mobile Gaming App",
            "description": "Creating a mobile game using Unity and C#. "
                          "Looking for developers experienced in game design.",
            "skills": ["C#", "Unity", "Game Design", "3D Modeling"],
            "tags": ["Gaming", "Mobile"]
        },
        {
            "id": "proj3",
            "title": "E-commerce Website",
            "description": "Building a full-stack e-commerce platform with React and Node.js. "
                          "Need help with payment integration and database design.",
            "skills": ["React", "Node.js", "PostgreSQL", "Docker", "AWS"],
            "tags": ["Web Development", "Startups"]
        }
    ]


class TestSkillMatching:
    
    def test_perfect_skill_match(self, engine):
        user_skills = ["Python", "React", "Docker"]
        required_skills = ["Python", "React", "Docker"]
        
        ratio, matched, missing = engine.calculate_skill_match(user_skills, required_skills)
        
        assert ratio == 1.0
        assert len(matched) == 3
        assert len(missing) == 0
    
    def test_partial_skill_match(self, engine):
        user_skills = ["Python", "React"]
        required_skills = ["Python", "React", "Docker", "AWS"]
        
        ratio, matched, missing = engine.calculate_skill_match(user_skills, required_skills)
        
        assert ratio == 0.5
        assert len(matched) == 2
        assert len(missing) == 2
        assert "docker" in missing
        assert "aws" in missing
    
    def test_no_skill_match(self, engine):
        user_skills = ["Java", "Spring"]
        required_skills = ["Python", "Django"]
        
        ratio, matched, missing = engine.calculate_skill_match(user_skills, required_skills)
        
        assert ratio == 0.0
        assert len(matched) == 0
        assert len(missing) == 2
    
    def test_case_insensitive_matching(self, engine):
        user_skills = ["PYTHON", "react", "DoCkEr"]
        required_skills = ["python", "React", "docker"]
        
        ratio, matched, missing = engine.calculate_skill_match(user_skills, required_skills)
        
        assert ratio == 1.0


class TestInterestMatching:
    
    def test_interest_overlap(self, engine):
        user_interests = ["AI", "Web Development", "Startups"]
        project_tags = ["AI", "Startups"]
        
        ratio, matched = engine.calculate_interest_match(user_interests, project_tags)
        
        assert ratio > 0
        assert len(matched) == 2
        assert "ai" in matched
        assert "startups" in matched
    
    def test_no_interest_overlap(self, engine):
        user_interests = ["AI", "Machine Learning"]
        project_tags = ["Gaming", "Mobile"]
        
        ratio, matched = engine.calculate_interest_match(user_interests, project_tags)
        
        assert ratio == 0.0
        assert len(matched) == 0


class TestSemanticSimilarity:
    
    def test_similar_texts(self, engine):
        text1 = "I love building web applications with React and Node.js"
        text2 = "Looking for developers to create a web app using React and Node"
        
        similarity = engine.calculate_semantic_similarity(text1, text2)
        
        assert 0.5 < similarity <= 1.0
    
    def test_dissimilar_texts(self, engine):
        text1 = "I love building web applications with React"
        text2 = "Mobile game development using Unity and C#"
        
        similarity = engine.calculate_semantic_similarity(text1, text2)
        
        assert similarity < 0.5
    
    def test_empty_text_handling(self, engine):
        similarity = engine.calculate_semantic_similarity("", "Some text")
        assert similarity == 0.0
        
        similarity = engine.calculate_semantic_similarity("Some text", "")
        assert similarity == 0.0


class TestWeightedScoring:
    
    def test_calculate_match_score(self, engine, sample_user_profile, sample_projects):
        ai_project = sample_projects[0]
        score = engine.calculate_match_score(sample_user_profile, ai_project)
        
        assert isinstance(score, MatchScore)
        assert 0 <= score.total_score <= 1
        assert score.skill_score > 0
        assert len(score.matched_skills) >= 2
    
    def test_rank_projects(self, engine, sample_user_profile, sample_projects):
        ranked_scores = engine.rank_projects(sample_user_profile, sample_projects)
        
        assert len(ranked_scores) == 3
        
        for i in range(len(ranked_scores) - 1):
            assert ranked_scores[i].total_score >= ranked_scores[i + 1].total_score
        
        top_project_id = ranked_scores[0].project_id
        assert top_project_id in ["proj1", "proj3"]
        assert ranked_scores[-1].project_id == "proj2"
    
    def test_score_breakdown(self, engine, sample_user_profile, sample_projects):
        score = engine.calculate_match_score(sample_user_profile, sample_projects[0])
        score_dict = score.to_dict()
        
        assert "total_score" in score_dict
        assert "breakdown" in score_dict
        assert "explanation" in score_dict
        
        breakdown = score_dict["breakdown"]
        assert "semantic_similarity" in breakdown
        assert "skill_match" in breakdown
        assert "interest_alignment" in breakdown
        
        explanation = score_dict["explanation"]
        assert "matched_skills" in explanation
        assert "missing_skills" in explanation


class TestCustomWeights:
    
    def test_custom_weights(self):
        custom_weights = MatchWeights(
            semantic=0.2,
            skills=0.7,
            interests=0.1
        )
        engine = MatchingEngine(weights=custom_weights)
        
        assert engine.weights.semantic == 0.2
        assert engine.weights.skills == 0.7
    
    def test_invalid_weights_sum(self):
        with pytest.raises(ValueError):
            MatchWeights(
                semantic=0.5,
                skills=0.5,
                interests=0.5
            )


# ---------------------------------------------------------------------------
# Edge-case unit tests: empty inputs must never raise
# ---------------------------------------------------------------------------

class TestEmptyInputEdgeCases:
    """Ensure engine methods return safe defaults for empty/minimal inputs."""

    def test_rank_projects_empty_list(self, engine, sample_user_profile):
        """rank_projects([]) must return an empty list, not raise."""
        result = engine.rank_projects(sample_user_profile, [])
        assert result == []

    def test_rank_projects_empty_profile(self, engine, sample_projects):
        """rank_projects with a bare profile (no skills/interests/bio) must not raise."""
        result = engine.rank_projects({}, sample_projects)
        assert len(result) == len(sample_projects)
        # All scores should be valid floats in [0, 1]
        for score in result:
            assert 0.0 <= score.total_score <= 1.0

    def test_calculate_match_score_empty_project(self, engine, sample_user_profile):
        """calculate_match_score with an empty project dict must not raise."""
        score = engine.calculate_match_score(sample_user_profile, {})
        assert isinstance(score, MatchScore)
        assert 0.0 <= score.total_score <= 1.0

    def test_skill_match_empty_required(self, engine):
        ratio, matched, missing = engine.calculate_skill_match(["Python"], [])
        assert ratio == 0.0
        assert matched == []
        assert missing == []

    def test_skill_match_empty_user(self, engine):
        ratio, matched, missing = engine.calculate_skill_match([], ["Python", "React"])
        assert ratio == 0.0
        assert len(missing) == 2

    def test_interest_match_empty_tags(self, engine):
        ratio, matched = engine.calculate_interest_match(["AI"], [])
        assert ratio == 0.0

    def test_interest_match_empty_user(self, engine):
        ratio, matched = engine.calculate_interest_match([], ["AI"])
        assert ratio == 0.0

    def test_semantic_similarity_both_empty(self, engine):
        result = engine.calculate_semantic_similarity("", "")
        assert result == 0.0


# ---------------------------------------------------------------------------
# API endpoint tests — run via TestClient (no live server required)
# ---------------------------------------------------------------------------

GOOD_PROFILE = {
    "skills": ["Python", "React"],
    "interests": ["AI"],
    "bio": "Full-stack developer",
}

GOOD_PROJECT = {
    "id": "p1",
    "description": "AI web app with Python and React",
    "skills": ["Python", "React"],
    "tags": ["AI"],
}

GOOD_CANDIDATE = {
    "id": "c1",
    "name": "Alice",
    "bio": "Python developer interested in AI",
    "skills": ["Python", "React"],
    "interests": ["AI"],
}

GOOD_CANDIDATE_PROJECT = {
    "title": "AI Web App",
    "description": "Building an AI web application",
    "skills": ["Python", "React"],
    "tags": ["AI"],
}


class TestScoreEndpointEmptyGuards:
    """POST /match/score must return 200 + empty list, never 500, for empty inputs."""

    def test_empty_projects_list_returns_200(self):
        resp = client.post("/match/score", json={
            "user_profile": GOOD_PROFILE,
            "projects": [],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ranked_projects"] == []
        assert data["count"] == 0

    def test_exclude_all_projects_returns_empty(self):
        """When exclude_project_ids covers every project the response must be empty, not 500."""
        resp = client.post("/match/score", json={
            "user_profile": GOOD_PROFILE,
            "projects": [GOOD_PROJECT],
            "exclude_project_ids": ["p1"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ranked_projects"] == []
        assert data["count"] == 0

    def test_normal_scoring_still_works(self):
        resp = client.post("/match/score", json={
            "user_profile": GOOD_PROFILE,
            "projects": [GOOD_PROJECT],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert data["ranked_projects"][0]["project_id"] == "p1"

    def test_exclude_subset_leaves_rest(self):
        project2 = {**GOOD_PROJECT, "id": "p2", "description": "Game dev with Unity"}
        resp = client.post("/match/score", json={
            "user_profile": GOOD_PROFILE,
            "projects": [GOOD_PROJECT, project2],
            "exclude_project_ids": ["p1"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert data["ranked_projects"][0]["project_id"] == "p2"

    def test_empty_user_profile_does_not_crash(self):
        resp = client.post("/match/score", json={
            "user_profile": {},
            "projects": [GOOD_PROJECT],
        })
        assert resp.status_code == 200


class TestCandidatesEndpointEmptyGuards:
    """POST /match/candidates must return 200 + empty list, never 500, for empty inputs."""

    def test_empty_candidates_list_returns_200(self):
        resp = client.post("/match/candidates", json={
            "project": GOOD_CANDIDATE_PROJECT,
            "candidates": [],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ranked_candidates"] == []
        assert data["count"] == 0

    def test_exclude_all_candidates_returns_empty(self):
        """When exclude_candidate_ids covers every candidate the response must be empty, not 500."""
        resp = client.post("/match/candidates", json={
            "project": GOOD_CANDIDATE_PROJECT,
            "candidates": [GOOD_CANDIDATE],
            "exclude_candidate_ids": ["c1"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ranked_candidates"] == []
        assert data["count"] == 0

    def test_normal_candidate_scoring_still_works(self):
        resp = client.post("/match/candidates", json={
            "project": GOOD_CANDIDATE_PROJECT,
            "candidates": [GOOD_CANDIDATE],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert data["ranked_candidates"][0]["candidate_id"] == "c1"

    def test_exclude_subset_leaves_rest(self):
        candidate2 = {**GOOD_CANDIDATE, "id": "c2", "name": "Bob",
                      "skills": ["C#", "Unity"], "interests": ["Gaming"]}
        resp = client.post("/match/candidates", json={
            "project": GOOD_CANDIDATE_PROJECT,
            "candidates": [GOOD_CANDIDATE, candidate2],
            "exclude_candidate_ids": ["c1"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 1
        assert data["ranked_candidates"][0]["candidate_id"] == "c2"

    def test_empty_project_description_does_not_crash(self):
        resp = client.post("/match/candidates", json={
            "project": {"title": "", "description": "", "skills": [], "tags": []},
            "candidates": [GOOD_CANDIDATE],
        })
        assert resp.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
