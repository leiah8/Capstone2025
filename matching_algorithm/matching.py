from __future__ import annotations
from typing import Dict, List, Any, Optional, Tuple
import logging
from dataclasses import dataclass, field

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)


@dataclass
class MatchWeights:
    """Configurable weights for matching components (must sum to 1.0)"""
    semantic: float = 0.25
    must_have_skills: float = 0.30
    nice_to_have_skills: float = 0.10
    interests: float = 0.10
    elo_rating: float = 0.15
    experience_match: float = 0.05
    location_match: float = 0.05
    
    def __post_init__(self):
        total = (self.semantic + self.must_have_skills + self.nice_to_have_skills + 
                self.interests + self.elo_rating + self.experience_match + self.location_match)
        if not np.isclose(total, 1.0):
            raise ValueError(f"Weights must sum to 1.0, got {total}")


@dataclass
class MatchScore:
    """Match score with component breakdown for explainability"""
    project_id: str
    total_score: float
    semantic_score: float
    must_have_score: float
    nice_to_have_score: float
    interest_score: float
    elo_score: float
    experience_score: float
    location_score: float
    matched_must_have_skills: List[str] = field(default_factory=list)
    matched_nice_to_have_skills: List[str] = field(default_factory=list)
    matched_interests: List[str] = field(default_factory=list)
    missing_must_have_skills: List[str] = field(default_factory=list)
    experience_level_match: str = ""
    location_distance: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "project_id": self.project_id,
            "total_score": round(self.total_score, 4),
            "breakdown": {
                "semantic_similarity": round(self.semantic_score, 4),
                "must_have_skills": round(self.must_have_score, 4),
                "nice_to_have_skills": round(self.nice_to_have_score, 4),
                "interest_alignment": round(self.interest_score, 4),
                "elo_rating": round(self.elo_score, 4),
                "experience_match": round(self.experience_score, 4),
                "location_match": round(self.location_score, 4),
            },
            "explanation": {
                "matched_must_have_skills": self.matched_must_have_skills,
                "matched_nice_to_have_skills": self.matched_nice_to_have_skills,
                "matched_interests": self.matched_interests,
                "missing_must_have_skills": self.missing_must_have_skills,
                "experience_level_match": self.experience_level_match,
                "location_distance": self.location_distance,
            }
        }


class MatchingEngine:
    """
    Core matching engine using sentence transformers for semantic similarity
    and skill/interest overlap for structured matching.
    """
    
    def __init__(
        self, 
        model_name: str = "all-MiniLM-L6-v2",
        weights: Optional[MatchWeights] = None,
        default_elo: float = 1200.0,
        elo_range: Tuple[float, float] = (800.0, 2000.0)
    ):
        self.model = SentenceTransformer(model_name)
        self.weights = weights or MatchWeights()
        self.default_elo = default_elo
        self.elo_range = elo_range
        logger.info(f"Initialized MatchingEngine with model={model_name}")
    
    def normalize_text(self, text: Optional[str]) -> str:
        if not text:
            return ""
        return " ".join(text.split())
    
    def normalize_skills(self, skills: Optional[List[str]]) -> List[str]:
        if not skills:
            return []
        return [s.lower().strip() for s in skills if s and s.strip()]
    
    def calculate_semantic_similarity(self, user_text: str, project_text: str) -> float:
        if not user_text or not project_text:
            return 0.0
        
        user_text = self.normalize_text(user_text)
        project_text = self.normalize_text(project_text)
        
        if not user_text or not project_text:
            return 0.0
        
        try:
            embeddings = self.model.encode([user_text, project_text])
            similarity = cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]
            return float(max(0.0, min(1.0, similarity)))
        except Exception as e:
            logger.error(f"Error calculating semantic similarity: {e}")
            return 0.0
    
    def calculate_skill_match(
        self, 
        user_skills: List[str], 
        required_skills: List[str]
    ) -> Tuple[float, List[str], List[str]]:
        user_skills_norm = set(self.normalize_skills(user_skills))
        required_skills_norm = self.normalize_skills(required_skills)
        
        if not required_skills_norm:
            return 1.0, [], []
        
        matched = []
        missing = []
        
        for skill in required_skills_norm:
            if skill in user_skills_norm:
                matched.append(skill)
            else:
                missing.append(skill)
        
        ratio = len(matched) / len(required_skills_norm)
        return ratio, matched, missing
    
    def calculate_interest_match(
        self, 
        user_interests: List[str], 
        project_tags: List[str]
    ) -> Tuple[float, List[str]]:
        user_interests_norm = set(self.normalize_skills(user_interests))
        project_tags_norm = set(self.normalize_skills(project_tags))
        
        if not project_tags_norm and not user_interests_norm:
            return 0.5, []
        
        if not project_tags_norm or not user_interests_norm:
            return 0.0, []
        
        matched = list(user_interests_norm.intersection(project_tags_norm))
        union_size = len(user_interests_norm.union(project_tags_norm))
        ratio = len(matched) / union_size if union_size > 0 else 0.0
        
        return ratio, matched
    
    def calculate_elo_score(
        self,
        entity_elo: Optional[float],
        cold_start_boost: float = 0.2
    ) -> Tuple[float, bool]:
        if entity_elo is None:
            entity_elo = self.default_elo
            is_new = True
        else:
            is_new = entity_elo == self.default_elo
        
        min_elo, max_elo = self.elo_range
        normalized_elo = (entity_elo - min_elo) / (max_elo - min_elo)
        normalized_elo = max(0.0, min(1.0, normalized_elo))
        
        if is_new:
            normalized_elo = max(normalized_elo, cold_start_boost)
        
        return normalized_elo, is_new
    
    def calculate_experience_match(
        self,
        user_experience: Optional[str],
        project_required_experience: Optional[str]
    ) -> Tuple[float, str]:
        experience_levels = {
            "beginner": 1,
            "intermediate": 2,
            "advanced": 3,
            "expert": 4
        }
        
        if not project_required_experience:
            return 1.0, "no_requirement"
        
        if not user_experience:
            return 0.5, "unknown_user_level"
        
        user_exp = user_experience.lower().strip()
        proj_exp = project_required_experience.lower().strip()
        
        user_level = experience_levels.get(user_exp, 0)
        proj_level = experience_levels.get(proj_exp, 0)
        
        if user_level == 0 or proj_level == 0:
            return 0.5, "invalid_level"
        
        if user_level >= proj_level:
            return 1.0, "meets_requirement"
        elif user_level == proj_level - 1:
            return 0.7, "slightly_below"
        else:
            return 0.3, "significantly_below"
    
    def calculate_location_match(
        self,
        user_location: Optional[str],
        project_location: Optional[str]
    ) -> Tuple[float, Optional[str]]:
        if not project_location or project_location.lower() == "remote":
            return 1.0, "remote"
        
        if not user_location:
            return 0.5, "unknown_user_location"
        
        user_loc = user_location.lower().strip()
        proj_loc = project_location.lower().strip()
        
        if user_loc == proj_loc:
            return 1.0, "exact_match"
        
        user_parts = user_loc.split(",")
        proj_parts = proj_loc.split(",")
        
        if len(user_parts) > 1 and len(proj_parts) > 1:
            user_city = user_parts[0].strip()
            proj_city = proj_parts[0].strip()
            
            if user_city == proj_city:
                return 0.9, "same_city"
            
            if len(user_parts) > 1 and len(proj_parts) > 1:
                user_region = user_parts[-1].strip()
                proj_region = proj_parts[-1].strip()
                
                if user_region == proj_region:
                    return 0.6, "same_region"
        
        return 0.3, "different_location"
    
    def calculate_match_score(
        self,
        user_profile: Dict[str, Any],
        project: Dict[str, Any],
        must_have_skills_key: str = "skills_needed",
        nice_to_have_skills_key: str = "nice_to_have_skills",
    ) -> MatchScore:
        user_skills = user_profile.get("skills", [])
        user_interests = user_profile.get("interests", [])
        user_bio = user_profile.get("bio", "")
        user_elo = user_profile.get("elo_rating")
        user_experience = user_profile.get("experience_level")
        user_location = user_profile.get("location")
        
        project_id = str(project.get("id", "unknown"))
        project_description = project.get("description", "")
        must_have_skills = project.get(must_have_skills_key, [])
        nice_to_have_skills = project.get(nice_to_have_skills_key, [])
        project_tags = project.get("tags", [])
        project_elo = project.get("elo_rating")
        project_required_experience = project.get("required_experience_level")
        project_location = project.get("location")
        
        semantic_score = self.calculate_semantic_similarity(user_bio, project_description)
        must_have_ratio, matched_must, missing_must = self.calculate_skill_match(
            user_skills, must_have_skills
        )
        nice_to_have_ratio, matched_nice, _ = self.calculate_skill_match(
            user_skills, nice_to_have_skills
        )
        interest_ratio, matched_interests = self.calculate_interest_match(
            user_interests, project_tags
        )
        
        entity_elo = user_elo if user_elo is not None else project_elo
        elo_normalized, is_new = self.calculate_elo_score(entity_elo)
        
        experience_ratio, exp_match_desc = self.calculate_experience_match(
            user_experience, project_required_experience
        )
        
        location_ratio, loc_distance = self.calculate_location_match(
            user_location, project_location
        )
        
        total_score = (
            self.weights.semantic * semantic_score +
            self.weights.must_have_skills * must_have_ratio +
            self.weights.nice_to_have_skills * nice_to_have_ratio +
            self.weights.interests * interest_ratio +
            self.weights.elo_rating * elo_normalized +
            self.weights.experience_match * experience_ratio +
            self.weights.location_match * location_ratio
        )
        
        return MatchScore(
            project_id=project_id,
            total_score=total_score,
            semantic_score=semantic_score,
            must_have_score=must_have_ratio,
            nice_to_have_score=nice_to_have_ratio,
            interest_score=interest_ratio,
            elo_score=elo_normalized,
            experience_score=experience_ratio,
            location_score=location_ratio,
            matched_must_have_skills=matched_must,
            matched_nice_to_have_skills=matched_nice,
            matched_interests=matched_interests,
            missing_must_have_skills=missing_must,
            experience_level_match=exp_match_desc,
            location_distance=loc_distance,
        )
    
    def rank_projects(
        self,
        user_profile: Dict[str, Any],
        projects: List[Dict[str, Any]],
        exclude_ids: Optional[List[str]] = None,
        diversity_boost: float = 0.0
    ) -> List[MatchScore]:
        exclude_set = set(exclude_ids) if exclude_ids else set()
        scores = []
        
        for project in projects:
            project_id = str(project.get("id", "unknown"))
            if project_id in exclude_set:
                continue
                
            try:
                score = self.calculate_match_score(user_profile, project)
                
                if diversity_boost > 0:
                    random_factor = np.random.uniform(0, diversity_boost)
                    score.total_score = min(1.0, score.total_score + random_factor)
                
                scores.append(score)
            except Exception as e:
                logger.error(f"Error scoring project {project.get('id')}: {e}")
                continue
        
        scores.sort(key=lambda x: x.total_score, reverse=True)
        return scores


class EloRatingSystem:
    """
    Manages Elo rating updates based on match quality feedback.
    """
    
    def __init__(self, k_factor: float = 32.0, default_rating: float = 1200.0):
        self.k_factor = k_factor
        self.default_rating = default_rating
    
    def expected_score(self, rating_a: float, rating_b: float) -> float:
        return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))
    
    def update_rating(
        self,
        current_rating: float,
        opponent_rating: float,
        actual_score: float
    ) -> float:
        expected = self.expected_score(current_rating, opponent_rating)
        new_rating = current_rating + self.k_factor * (actual_score - expected)
        return max(800.0, min(2000.0, new_rating))
    
    def update_match_ratings(
        self,
        user_rating: Optional[float],
        project_rating: Optional[float],
        match_quality: float
    ) -> Tuple[float, float]:
        user_elo = user_rating if user_rating is not None else self.default_rating
        project_elo = project_rating if project_rating is not None else self.default_rating
        
        new_user_elo = self.update_rating(user_elo, project_elo, match_quality)
        new_project_elo = self.update_rating(project_elo, user_elo, match_quality)
        
        return new_user_elo, new_project_elo


_engine_instance: Optional[MatchingEngine] = None
_elo_system_instance: Optional[EloRatingSystem] = None


def get_matching_engine(
    model_name: str = "all-MiniLM-L6-v2",
    weights: Optional[MatchWeights] = None
) -> MatchingEngine:
    """Get or create a singleton matching engine instance."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = MatchingEngine(model_name=model_name, weights=weights)
    return _engine_instance


def get_elo_system(k_factor: float = 32.0) -> EloRatingSystem:
    """Get or create a singleton Elo rating system instance."""
    global _elo_system_instance
    if _elo_system_instance is None:
        _elo_system_instance = EloRatingSystem(k_factor=k_factor)
    return _elo_system_instance
