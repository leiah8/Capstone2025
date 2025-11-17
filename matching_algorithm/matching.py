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
    semantic: float = 0.35
    must_have_skills: float = 0.40
    nice_to_have_skills: float = 0.15
    interests: float = 0.10
    
    def __post_init__(self):
        total = self.semantic + self.must_have_skills + self.nice_to_have_skills + self.interests
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
    matched_must_have_skills: List[str] = field(default_factory=list)
    matched_nice_to_have_skills: List[str] = field(default_factory=list)
    matched_interests: List[str] = field(default_factory=list)
    missing_must_have_skills: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "project_id": self.project_id,
            "total_score": round(self.total_score, 4),
            "breakdown": {
                "semantic_similarity": round(self.semantic_score, 4),
                "must_have_skills": round(self.must_have_score, 4),
                "nice_to_have_skills": round(self.nice_to_have_score, 4),
                "interest_alignment": round(self.interest_score, 4),
            },
            "explanation": {
                "matched_must_have_skills": self.matched_must_have_skills,
                "matched_nice_to_have_skills": self.matched_nice_to_have_skills,
                "matched_interests": self.matched_interests,
                "missing_must_have_skills": self.missing_must_have_skills,
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
        weights: Optional[MatchWeights] = None
    ):
        self.model = SentenceTransformer(model_name)
        self.weights = weights or MatchWeights()
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
        
        project_id = str(project.get("id", "unknown"))
        project_description = project.get("description", "")
        must_have_skills = project.get(must_have_skills_key, [])
        nice_to_have_skills = project.get(nice_to_have_skills_key, [])
        project_tags = project.get("tags", [])
        
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
        
        total_score = (
            self.weights.semantic * semantic_score +
            self.weights.must_have_skills * must_have_ratio +
            self.weights.nice_to_have_skills * nice_to_have_ratio +
            self.weights.interests * interest_ratio
        )
        
        return MatchScore(
            project_id=project_id,
            total_score=total_score,
            semantic_score=semantic_score,
            must_have_score=must_have_ratio,
            nice_to_have_score=nice_to_have_ratio,
            interest_score=interest_ratio,
            matched_must_have_skills=matched_must,
            matched_nice_to_have_skills=matched_nice,
            matched_interests=matched_interests,
            missing_must_have_skills=missing_must,
        )
    
    def rank_projects(
        self,
        user_profile: Dict[str, Any],
        projects: List[Dict[str, Any]],
    ) -> List[MatchScore]:
        scores = []
        for project in projects:
            try:
                score = self.calculate_match_score(user_profile, project)
                scores.append(score)
            except Exception as e:
                logger.error(f"Error scoring project {project.get('id')}: {e}")
                continue
        
        scores.sort(key=lambda x: x.total_score, reverse=True)
        return scores


_engine_instance: Optional[MatchingEngine] = None


def get_matching_engine(
    model_name: str = "all-MiniLM-L6-v2",
    weights: Optional[MatchWeights] = None
) -> MatchingEngine:
    """Get or create a singleton matching engine instance."""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = MatchingEngine(model_name=model_name, weights=weights)
    return _engine_instance
