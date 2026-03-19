from __future__ import annotations
from typing import Dict, List, Any, Optional, Tuple
import logging
import os
from dataclasses import dataclass, field

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from cache import EmbeddingCache, get_embedding_cache

logger = logging.getLogger(__name__)


@dataclass
class MatchWeights:
    """Configurable weights for matching components (must sum to 1.0)"""
    semantic: float = 0.35
    skills: float = 0.55
    interests: float = 0.10
    
    def __post_init__(self):
        total = self.semantic + self.skills + self.interests
        if not np.isclose(total, 1.0):
            raise ValueError(f"Weights must sum to 1.0, got {total}")


@dataclass
class MatchScore:
    """Match score with component breakdown for explainability"""
    project_id: str
    total_score: float
    semantic_score: float
    skill_score: float
    interest_score: float
    matched_skills: List[str] = field(default_factory=list)
    missing_skills: List[str] = field(default_factory=list)
    matched_interests: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "project_id": self.project_id,
            "total_score": round(self.total_score, 4),
            "breakdown": {
                "semantic_similarity": round(self.semantic_score, 4),
                "skill_match": round(self.skill_score, 4),
                "interest_alignment": round(self.interest_score, 4),
            },
            "explanation": {
                "matched_skills": self.matched_skills,
                "missing_skills": self.missing_skills,
                "matched_interests": self.matched_interests,
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
        cache: Optional[EmbeddingCache] = None
    ):
        self.enable_semantic = os.getenv("ENABLE_SEMANTIC_SCORING", "false").lower() in ("1", "true", "yes")
        self.model: Optional[SentenceTransformer] = None
        if self.enable_semantic:
            try:
                self.model = SentenceTransformer(model_name)
            except Exception as e:
                logger.warning(f"Failed to initialize semantic model ({model_name}), disabling semantic scoring: {e}")
                self.enable_semantic = False
        self.weights = weights or MatchWeights()
        self.cache = cache or get_embedding_cache()
        logger.info(
            f"Initialized MatchingEngine with semantic_enabled={self.enable_semantic}, "
            f"model={model_name if self.enable_semantic else 'disabled'}, cache_enabled={self.cache.enabled}"
        )
    
    def normalize_text(self, text: Optional[str]) -> str:
        if not text:
            return ""
        return " ".join(text.split())
    
    def normalize_skills(self, skills: Optional[List[str]]) -> List[str]:
        if not skills:
            return []
        return [s.lower().strip() for s in skills if s and s.strip()]
    
    def _get_embedding(self, text: str) -> Optional[np.ndarray]:
        """Get embedding from cache or compute it."""
        if not self.enable_semantic or self.model is None:
            return None

        if not text:
            return None

        normalized_text = self.normalize_text(text)
        if not normalized_text:
            return None

        # Try cache first
        cached = self.cache.get(normalized_text)
        if cached is not None:
            return cached

        # Compute and cache
        try:
            embedding = self.model.encode(normalized_text)
            self.cache.set(normalized_text, embedding)
            return embedding
        except Exception as e:
            logger.error(f"Error computing embedding: {e}")
            return None

    def calculate_semantic_similarity(self, user_text: str, project_text: str) -> float:
        if not self.enable_semantic or self.model is None:
            return 0.0

        if not user_text or not project_text:
            return 0.0

        try:
            # Get embeddings with caching
            user_embedding = self._get_embedding(user_text)
            project_embedding = self._get_embedding(project_text)

            if user_embedding is None or project_embedding is None:
                return 0.0

            similarity = cosine_similarity([user_embedding], [project_embedding])[0][0]
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
            return 0.0, [], []
        
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
            return 0.0, []
        
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
    ) -> MatchScore:
        user_skills = user_profile.get("skills", []) or []
        user_interests = user_profile.get("interests", []) or []
        user_bio = user_profile.get("bio", "") or ""

        # Build bio proxy from skills/interests when bio is absent so semantic
        # scoring has signal even for users who haven't written a bio yet.
        if not user_bio.strip() and (user_skills or user_interests):
            parts = []
            if user_skills:
                parts.append("Skills: " + ", ".join(user_skills))
            if user_interests:
                parts.append("Interests: " + ", ".join(user_interests))
            user_bio = ". ".join(parts)
            logger.debug(f"[CALC] Bio proxy constructed: {user_bio[:80]}")

        project_id = str(project.get("id", "unknown"))
        project_description = project.get("description", "")
        # Accept both 'skills' (new) and legacy 'skills_needed' / 'must_have_skills'
        project_skills = (
            project.get("skills")
            or project.get("skills_needed")
            or project.get("must_have_skills")
            or []
        )
        project_tags = project.get("tags", []) or project.get("interests", [])
        
        semantic_score = self.calculate_semantic_similarity(user_bio, project_description)
        skill_ratio, matched_skills, missing_skills = self.calculate_skill_match(
            user_skills, project_skills
        )
        interest_ratio, matched_interests = self.calculate_interest_match(
            user_interests, project_tags
        )
        
        total_score = (
            self.weights.semantic * semantic_score +
            self.weights.skills * skill_ratio +
            self.weights.interests * interest_ratio
        )
        
        logger.info(f"[CALC] Project {project_id}: semantic={semantic_score:.3f}, skills={skill_ratio:.3f}, interest={interest_ratio:.3f} -> total={total_score:.3f}")
        logger.debug(f"[CALC] Project {project_id}: tags={project_tags}, user_interests={user_interests}")
        
        return MatchScore(
            project_id=project_id,
            total_score=total_score,
            semantic_score=semantic_score,
            skill_score=skill_ratio,
            interest_score=interest_ratio,
            matched_skills=matched_skills,
            missing_skills=missing_skills,
            matched_interests=matched_interests,
        )
    
    def rank_projects(
        self,
        user_profile: Dict[str, Any],
        projects: List[Dict[str, Any]],
    ) -> List[MatchScore]:
        # Pre-warm cache with batch operation for better performance
        if self.enable_semantic and self.model is not None and self.cache.enabled and projects:
            texts_to_cache = []
            user_bio = self.normalize_text(user_profile.get("bio", ""))
            if user_bio:
                texts_to_cache.append(user_bio)

            for project in projects:
                desc = self.normalize_text(project.get("description", ""))
                if desc:
                    texts_to_cache.append(desc)

            if texts_to_cache:
                # Check which are missing from cache
                cached_embeddings = self.cache.get_batch(texts_to_cache)
                missing_indices = [i for i, emb in enumerate(cached_embeddings) if emb is None]

                # Compute missing embeddings in batch
                if missing_indices:
                    missing_texts = [texts_to_cache[i] for i in missing_indices]
                    try:
                        new_embeddings = self.model.encode(missing_texts)
                        # Cache the new embeddings
                        self.cache.set_batch(missing_texts, new_embeddings)
                    except Exception as e:
                        logger.error(f"Error in batch embedding: {e}")

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
    """Get or create a singleton matching engine instance.

    If weights are provided and the instance already exists, the instance's
    weights are updated so per-request weight overrides are always respected.
    """
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = MatchingEngine(model_name=model_name, weights=weights)
    elif weights is not None:
        _engine_instance.weights = weights
    return _engine_instance
