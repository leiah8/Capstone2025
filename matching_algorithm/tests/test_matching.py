import pytest
from matching import MatchingEngine, MatchWeights, MatchScore


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
            "skills_needed": ["Python", "React", "FastAPI"],
            "nice_to_have_skills": ["Docker", "PostgreSQL"],
            "tags": ["AI", "Startups"]
        },
        {
            "id": "proj2",
            "title": "Mobile Gaming App",
            "description": "Creating a mobile game using Unity and C#. "
                          "Looking for developers experienced in game design.",
            "skills_needed": ["C#", "Unity", "Game Design"],
            "nice_to_have_skills": ["3D Modeling"],
            "tags": ["Gaming", "Mobile"]
        },
        {
            "id": "proj3",
            "title": "E-commerce Website",
            "description": "Building a full-stack e-commerce platform with React and Node.js. "
                          "Need help with payment integration and database design.",
            "skills_needed": ["React", "Node.js", "PostgreSQL"],
            "nice_to_have_skills": ["Docker", "AWS"],
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
        assert score.must_have_score > 0
        assert len(score.matched_must_have_skills) >= 2
    
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
        assert "must_have_skills" in breakdown
        assert "nice_to_have_skills" in breakdown
        assert "interest_alignment" in breakdown
        
        explanation = score_dict["explanation"]
        assert "matched_must_have_skills" in explanation
        assert "missing_must_have_skills" in explanation


class TestCustomWeights:
    
    def test_custom_weights(self):
        custom_weights = MatchWeights(
            semantic=0.2,
            must_have_skills=0.5,
            nice_to_have_skills=0.2,
            interests=0.1
        )
        engine = MatchingEngine(weights=custom_weights)
        
        assert engine.weights.semantic == 0.2
        assert engine.weights.must_have_skills == 0.5
    
    def test_invalid_weights_sum(self):
        with pytest.raises(ValueError):
            MatchWeights(
                semantic=0.5,
                must_have_skills=0.5,
                nice_to_have_skills=0.5,
                interests=0.5
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
