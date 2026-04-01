import pytest
from fastapi.testclient import TestClient
from matching import MatchingEngine, MatchWeights, MatchScore
from elo import EloCalculator, EloConfig, DEFAULT_RATING
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

    # ------------------------------------------------------------------
    # Basic matching
    # ------------------------------------------------------------------

    def test_exact_match(self, engine):
        ratio, matched = engine.calculate_interest_match(["AI", "Startups"], ["AI", "Startups"])
        assert ratio == 1.0
        assert set(matched) == {"AI", "Startups"}

    def test_partial_match_ratio(self, engine):
        # User covers 1 of 2 project tags → ratio = 0.5
        ratio, matched = engine.calculate_interest_match(["AI"], ["AI", "Gaming"])
        assert ratio == 0.5
        assert matched == ["AI"]

    def test_no_overlap(self, engine):
        ratio, matched = engine.calculate_interest_match(["AI", "Machine Learning"], ["Gaming", "Mobile"])
        assert ratio == 0.0
        assert matched == []

    def test_superset_user_interests(self, engine):
        # User has more interests than project tags — ratio still based on project tags covered
        ratio, matched = engine.calculate_interest_match(
            ["AI", "Web Development", "Startups"],
            ["AI", "Startups"],
        )
        assert ratio == 1.0
        assert len(matched) == 2

    # ------------------------------------------------------------------
    # Pre-processing: case, separators, stemming
    # ------------------------------------------------------------------

    def test_case_insensitive(self, engine):
        ratio, matched = engine.calculate_interest_match(["ai", "startups"], ["AI", "Startups"])
        assert ratio == 1.0

    def test_hyphen_separator_normalised(self, engine):
        # "Full-Stack" and "Full Stack" share the stemmed tokens "full"+"stack"
        ratio, matched = engine.calculate_interest_match(["Full-Stack Development"], ["Full Stack"])
        assert ratio == 1.0

    def test_underscore_separator_normalised(self, engine):
        ratio, matched = engine.calculate_interest_match(["web_development"], ["Web Development"])
        assert ratio == 1.0

    def test_stemming_matches_variant_forms(self, engine):
        # "Fullstack Development" → stem "develop"; "developer" → stem "develop"
        ratio, matched = engine.calculate_interest_match(["Fullstack Development"], ["fullstack"])
        assert ratio == 1.0

    def test_stemming_plural_singular(self, engine):
        # "Startups" → stem "startup"; "Startup" → stem "startup"
        ratio, matched = engine.calculate_interest_match(["Startup"], ["Startups"])
        assert ratio == 1.0

    def test_stemming_ing_form(self, engine):
        # "learning" and "learn" should share a stem
        ratio, matched = engine.calculate_interest_match(["Machine Learning"], ["Machine Learn"])
        assert ratio == 1.0

    # ------------------------------------------------------------------
    # Neutral fallback (missing data → 0.5, not 0.0)
    # ------------------------------------------------------------------

    def test_empty_project_tags_returns_neutral(self, engine):
        ratio, matched = engine.calculate_interest_match(["AI"], [])
        assert ratio == 0.5
        assert matched == []

    def test_empty_user_interests_returns_neutral(self, engine):
        ratio, matched = engine.calculate_interest_match([], ["AI"])
        assert ratio == 0.5
        assert matched == []

    def test_both_empty_returns_neutral(self, engine):
        ratio, matched = engine.calculate_interest_match([], [])
        assert ratio == 0.5
        assert matched == []


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
        assert ratio == 0.5  # neutral — project lists no requirements, not a penalty
        assert matched == []
        assert missing == []

    def test_skill_match_empty_user(self, engine):
        ratio, matched, missing = engine.calculate_skill_match([], ["Python", "React"])
        assert ratio == 0.0
        assert len(missing) == 2

    def test_interest_match_empty_tags(self, engine):
        ratio, matched = engine.calculate_interest_match(["AI"], [])
        assert ratio == 0.5  # neutral — no data to penalise with

    def test_interest_match_empty_user(self, engine):
        ratio, matched = engine.calculate_interest_match([], ["AI"])
        assert ratio == 0.5  # neutral — no data to penalise with

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


# ---------------------------------------------------------------------------
# ELO system tests
# ---------------------------------------------------------------------------

class TestEloSystem:
    """Unit tests for the ELO rating module and its integration with MatchingEngine."""

    @pytest.fixture
    def calc(self):
        return EloCalculator()

    @pytest.fixture
    def disabled_calc(self):
        return EloCalculator(EloConfig(enabled=False))

    # ------------------------------------------------------------------
    # EloCalculator.score_adjustment
    # ------------------------------------------------------------------

    def test_default_rating_gives_zero_adjustment(self, calc):
        adj = calc.score_adjustment(DEFAULT_RATING)
        assert abs(adj) < 1e-6

    def test_high_rating_gives_positive_adjustment(self, calc):
        adj = calc.score_adjustment(DEFAULT_RATING + 800)
        assert adj > 0
        assert adj <= calc.config.max_boost

    def test_low_rating_gives_negative_adjustment(self, calc):
        adj = calc.score_adjustment(DEFAULT_RATING - 800)
        assert adj < 0
        assert adj >= -calc.config.max_boost

    def test_adjustment_clamped_to_max_boost(self, calc):
        adj_high = calc.score_adjustment(DEFAULT_RATING + 99999)
        adj_low = calc.score_adjustment(DEFAULT_RATING - 99999)
        assert adj_high <= calc.config.max_boost
        assert adj_low >= -calc.config.max_boost

    def test_disabled_gives_zero_adjustment(self, disabled_calc):
        assert disabled_calc.score_adjustment(DEFAULT_RATING + 500) == 0.0
        assert disabled_calc.score_adjustment(DEFAULT_RATING - 500) == 0.0

    def test_population_mean_centres_adjustment(self, calc):
        # When population_mean is provided, it replaces default_rating as
        # the reference.  A rating equal to the mean should give ~0.
        pop_mean = 950.0   # simulates a low-positive-rate population
        adj = calc.score_adjustment(pop_mean, population_mean=pop_mean)
        assert abs(adj) < 1e-6

    def test_above_population_mean_positive(self, calc):
        pop_mean = 950.0
        adj = calc.score_adjustment(pop_mean + 400, population_mean=pop_mean)
        assert adj > 0

    def test_below_population_mean_negative(self, calc):
        pop_mean = 950.0
        adj = calc.score_adjustment(pop_mean - 400, population_mean=pop_mean)
        assert adj < 0

    def test_population_mean_none_falls_back_to_default_rating(self, calc):
        # No population_mean → reference is default_rating (1000)
        adj_explicit = calc.score_adjustment(DEFAULT_RATING + 200, population_mean=DEFAULT_RATING)
        adj_implicit = calc.score_adjustment(DEFAULT_RATING + 200, population_mean=None)
        assert abs(adj_explicit - adj_implicit) < 1e-9

    # ------------------------------------------------------------------
    # EloCalculator.update_rating
    # ------------------------------------------------------------------

    def test_like_increases_rating(self, calc):
        result = calc.update_rating(DEFAULT_RATING, "like")
        assert result.new_rating > result.old_rating

    def test_pass_decreases_rating(self, calc):
        result = calc.update_rating(DEFAULT_RATING, "pass")
        assert result.new_rating < result.old_rating

    def test_super_like_increases_more_than_like(self, calc):
        like_result = calc.update_rating(DEFAULT_RATING, "like")
        super_result = calc.update_rating(DEFAULT_RATING, "super_like")
        assert super_result.new_rating > like_result.new_rating

    def test_disabled_update_returns_unchanged_rating(self, disabled_calc):
        result = disabled_calc.update_rating(1500.0, "like")
        assert result.old_rating == 1500.0
        assert result.new_rating == 1500.0
        assert result.score_adjustment == 0.0

    def test_update_rating_fields_present(self, calc):
        result = calc.update_rating(DEFAULT_RATING, "like")
        assert hasattr(result, "old_rating")
        assert hasattr(result, "new_rating")
        assert hasattr(result, "score_adjustment")

    def test_update_rating_adjustment_matches_score_adjustment(self, calc):
        result = calc.update_rating(DEFAULT_RATING, "like")
        expected_adj = calc.score_adjustment(result.new_rating)
        assert abs(result.score_adjustment - expected_adj) < 1e-9

    # ------------------------------------------------------------------
    # Custom EloConfig
    # ------------------------------------------------------------------

    def test_custom_max_boost(self):
        config = EloConfig(max_boost=0.10)
        calc = EloCalculator(config)
        adj = calc.score_adjustment(DEFAULT_RATING + 99999)
        assert adj <= 0.10

    def test_custom_k_factor_larger_delta(self):
        low_k = EloCalculator(EloConfig(k_factor=8.0))
        high_k = EloCalculator(EloConfig(k_factor=64.0))
        low_result = low_k.update_rating(DEFAULT_RATING, "like")
        high_result = high_k.update_rating(DEFAULT_RATING, "like")
        assert high_result.new_rating > low_result.new_rating

    # ------------------------------------------------------------------
    # Integration with MatchingEngine
    # ------------------------------------------------------------------

    def test_elo_rating_changes_total_score(self, engine, sample_user_profile, sample_projects):
        project = sample_projects[0]
        score_no_elo = engine.calculate_match_score(sample_user_profile, project)
        score_high_elo = engine.calculate_match_score(
            sample_user_profile, project, elo_rating=DEFAULT_RATING + 800
        )
        score_low_elo = engine.calculate_match_score(
            sample_user_profile, project, elo_rating=DEFAULT_RATING - 800
        )
        assert score_high_elo.total_score > score_no_elo.total_score
        assert score_low_elo.total_score < score_no_elo.total_score

    def test_elo_adjustment_stored_on_match_score(self, engine, sample_user_profile, sample_projects):
        score = engine.calculate_match_score(
            sample_user_profile, sample_projects[0], elo_rating=DEFAULT_RATING + 400
        )
        assert score.elo_adjustment > 0

    def test_no_elo_gives_zero_adjustment(self, engine, sample_user_profile, sample_projects):
        score = engine.calculate_match_score(sample_user_profile, sample_projects[0])
        assert score.elo_adjustment == 0.0

    def test_population_mean_used_in_rank_projects(self, engine, sample_user_profile, sample_projects):
        # When all ELO ratings are below default (1000), using population mean
        # means the highest-rated project still gets a positive adjustment.
        low_ratings = {"proj1": 950, "proj2": 900, "proj3": 970}
        ranked = engine.rank_projects(sample_user_profile, sample_projects, elo_ratings=low_ratings)
        # proj3 has the highest ELO → should have positive elo_adjustment
        proj3 = next(s for s in ranked if s.project_id == "proj3")
        assert proj3.elo_adjustment > 0

    def test_rank_projects_with_elo_ratings(self, engine, sample_user_profile, sample_projects):
        # Verify that a project with ELO well above the population mean gets
        # a higher total_score than the same project without ELO.
        ranked_no_elo = engine.rank_projects(sample_user_profile, sample_projects)
        proj2_no_elo = next(s for s in ranked_no_elo if s.project_id == "proj2")

        # Give proj2 a much higher rating than proj1/proj3 so it sits above
        # the population mean and receives a positive adjustment.
        elo_ratings = {
            "proj1": DEFAULT_RATING,
            "proj2": DEFAULT_RATING + 800,  # well above mean → positive adj
            "proj3": DEFAULT_RATING,
        }
        ranked_with_elo = engine.rank_projects(
            sample_user_profile, sample_projects, elo_ratings=elo_ratings
        )
        proj2_with_elo = next(s for s in ranked_with_elo if s.project_id == "proj2")

        assert proj2_with_elo.total_score > proj2_no_elo.total_score
        assert proj2_with_elo.elo_adjustment > 0

    def test_total_score_clamped_to_one(self, engine, sample_user_profile, sample_projects):
        # Even with extreme ELO the score must not exceed 1.0
        score = engine.calculate_match_score(
            sample_user_profile, sample_projects[0], elo_rating=DEFAULT_RATING + 999999
        )
        assert score.total_score <= 1.0

    def test_total_score_clamped_to_zero(self, engine, sample_user_profile, sample_projects):
        score = engine.calculate_match_score(
            sample_user_profile, sample_projects[1], elo_rating=DEFAULT_RATING - 999999
        )
        assert score.total_score >= 0.0

    def test_elo_adjustment_in_to_dict(self, engine, sample_user_profile, sample_projects):
        score = engine.calculate_match_score(
            sample_user_profile, sample_projects[0], elo_rating=DEFAULT_RATING + 400
        )
        d = score.to_dict()
        assert "elo_adjustment" in d["breakdown"]

    # ------------------------------------------------------------------
    # /elo/update API endpoint
    # ------------------------------------------------------------------

    def test_elo_endpoint_like(self):
        resp = client.post("/elo/update", json={
            "project_id": "proj1",
            "current_rating": DEFAULT_RATING,
            "reaction": "like",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["project_id"] == "proj1"
        assert data["new_rating"] > data["old_rating"]
        assert "score_adjustment" in data

    def test_elo_endpoint_pass(self):
        resp = client.post("/elo/update", json={
            "project_id": "proj1",
            "current_rating": DEFAULT_RATING,
            "reaction": "pass",
        })
        assert resp.status_code == 200
        assert resp.json()["new_rating"] < DEFAULT_RATING

    def test_elo_endpoint_super_like(self):
        resp = client.post("/elo/update", json={
            "project_id": "proj1",
            "current_rating": DEFAULT_RATING,
            "reaction": "super_like",
        })
        assert resp.status_code == 200
        assert resp.json()["new_rating"] > DEFAULT_RATING

    def test_elo_endpoint_invalid_reaction(self):
        resp = client.post("/elo/update", json={
            "project_id": "proj1",
            "current_rating": DEFAULT_RATING,
            "reaction": "invalid_reaction",
        })
        assert resp.status_code == 422  # Pydantic validation error


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
