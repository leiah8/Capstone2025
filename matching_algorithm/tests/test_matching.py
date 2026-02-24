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
            interests=0.05,
            elo_rating=0.0,
            experience_match=0.025,
            location_match=0.025
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
                interests=0.5,
                elo_rating=0.0,
                experience_match=0.0,
                location_match=0.0
            )


class TestEloRating:
    
    def test_elo_normalization(self, engine):
        normal_elo = 1200.0
        high_elo = 1800.0
        low_elo = 900.0
        
        norm_score, is_new = engine.calculate_elo_score(normal_elo)
        assert 0.0 <= norm_score <= 1.0
        
        high_score, _ = engine.calculate_elo_score(high_elo)
        low_score, _ = engine.calculate_elo_score(low_elo)
        assert high_score > low_score
    
    def test_cold_start_boost(self, engine):
        new_user_elo = 1200.0
        score_new, is_new = engine.calculate_elo_score(new_user_elo)
        
        assert is_new
        assert score_new >= 0.2
    
    def test_elo_none_handling(self, engine):
        score, is_new = engine.calculate_elo_score(None)
        assert is_new
        assert score >= 0.2


class TestExperienceMatching:
    
    def test_meets_requirement(self, engine):
        score, desc = engine.calculate_experience_match("advanced", "intermediate")
        assert score == 1.0
        assert desc == "meets_requirement"
    
    def test_slightly_below(self, engine):
        score, desc = engine.calculate_experience_match("intermediate", "advanced")
        assert score == 0.7
        assert desc == "slightly_below"
    
    def test_significantly_below(self, engine):
        score, desc = engine.calculate_experience_match("beginner", "expert")
        assert score == 0.3
        assert desc == "significantly_below"
    
    def test_no_requirement(self, engine):
        score, desc = engine.calculate_experience_match("beginner", None)
        assert score == 1.0
        assert desc == "no_requirement"
    
    def test_unknown_user_level(self, engine):
        score, desc = engine.calculate_experience_match(None, "advanced")
        assert score == 0.5
        assert desc == "unknown_user_level"


class TestLocationMatching:
    
    def test_remote_project(self, engine):
        score, desc = engine.calculate_location_match("Toronto, ON", "remote")
        assert score == 1.0
        assert desc == "remote"
    
    def test_exact_match(self, engine):
        score, desc = engine.calculate_location_match("Toronto, ON", "Toronto, ON")
        assert score == 1.0
        assert desc == "exact_match"
    
    def test_same_city(self, engine):
        score, desc = engine.calculate_location_match("Toronto, ON", "Toronto, Canada")
        assert score == 0.9
        assert desc == "same_city"
    
    def test_same_region(self, engine):
        score, desc = engine.calculate_location_match("Toronto, ON", "Ottawa, ON")
        assert score == 0.6
        assert desc == "same_region"
    
    def test_different_location(self, engine):
        score, desc = engine.calculate_location_match("Toronto, ON", "Vancouver, BC")
        assert score == 0.3
        assert desc == "different_location"
    
    def test_unknown_user_location(self, engine):
        score, desc = engine.calculate_location_match(None, "Toronto, ON")
        assert score == 0.5
        assert desc == "unknown_user_location"


class TestEloUpdateSystem:
    
    def test_elo_update_system_initialization(self):
        from matching import EloRatingSystem
        elo_system = EloRatingSystem()
        assert elo_system.k_factor == 32.0
        assert elo_system.default_rating == 1200.0
    
    def test_expected_score_calculation(self):
        from matching import EloRatingSystem
        elo_system = EloRatingSystem()
        
        expected = elo_system.expected_score(1200.0, 1200.0)
        assert expected == 0.5
        
        expected_higher = elo_system.expected_score(1400.0, 1200.0)
        assert expected_higher > 0.5
        
        expected_lower = elo_system.expected_score(1200.0, 1400.0)
        assert expected_lower < 0.5
    
    def test_elo_rating_update(self):
        from matching import EloRatingSystem
        elo_system = EloRatingSystem()
        
        new_rating = elo_system.update_rating(1200.0, 1200.0, 1.0)
        assert new_rating > 1200.0
        
        new_rating_loss = elo_system.update_rating(1200.0, 1200.0, 0.0)
        assert new_rating_loss < 1200.0
    
    def test_match_ratings_update(self):
        from matching import EloRatingSystem
        elo_system = EloRatingSystem()
        
        user_elo, project_elo = elo_system.update_match_ratings(1200.0, 1200.0, 0.8)
        assert user_elo > 1200.0
        assert project_elo > 1200.0


class TestEnhancedMatching:
    
    def test_enhanced_match_score(self, engine, sample_user_profile, sample_projects):
        enhanced_user = {**sample_user_profile}
        enhanced_user["elo_rating"] = 1400.0
        enhanced_user["experience_level"] = "intermediate"
        enhanced_user["location"] = "Toronto, ON"
        
        enhanced_project = {**sample_projects[0]}
        enhanced_project["elo_rating"] = 1300.0
        enhanced_project["required_experience_level"] = "beginner"
        enhanced_project["location"] = "Toronto, ON"
        
        score = engine.calculate_match_score(enhanced_user, enhanced_project)
        
        assert score.elo_score > 0
        assert score.experience_score > 0
        assert score.location_score > 0
        assert 0 <= score.total_score <= 1
    
    def test_score_breakdown_with_new_fields(self, engine, sample_user_profile, sample_projects):
        enhanced_user = {**sample_user_profile}
        enhanced_user["elo_rating"] = 1200.0
        enhanced_user["experience_level"] = "intermediate"
        enhanced_user["location"] = "Toronto, ON"
        
        score = engine.calculate_match_score(enhanced_user, sample_projects[0])
        score_dict = score.to_dict()
        
        assert "elo_rating" in score_dict["breakdown"]
        assert "experience_match" in score_dict["breakdown"]
        assert "location_match" in score_dict["breakdown"]
        assert "experience_level_match" in score_dict["explanation"]
        assert "location_distance" in score_dict["explanation"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
