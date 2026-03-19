from __future__ import annotations
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from matching import get_matching_engine, MatchWeights
from cache import get_embedding_cache
from middleware import TimeoutMiddleware, RequestLoggingMiddleware

logger = logging.getLogger(__name__)

# Honour LOG_LEVEL env var (e.g. LOG_LEVEL=DEBUG for verbose per-candidate
# score breakdowns). Defaults to INFO.
_log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger.setLevel(getattr(logging, _log_level, logging.INFO))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-warm the matching engine at startup so the first request isn't slow."""
    logger.info("[STARTUP] Pre-loading matching engine...")
    try:
        get_matching_engine()
        logger.info("[STARTUP] Matching engine ready")
    except Exception as e:
        logger.error(f"[STARTUP] Failed to pre-load matching engine: {e}")
    yield


app = FastAPI(title="Matching Algorithm API", version="1.0.0", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
app.add_middleware(RequestLoggingMiddleware)

# Timeout middleware - configurable via environment
TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "30.0"))
app.add_middleware(TimeoutMiddleware, timeout_seconds=TIMEOUT_SECONDS)


class MatchRequest(BaseModel):
    user_profile: Dict[str, Any]
    projects: List[Dict[str, Any]]
    weights: Optional[Dict[str, float]] = None


class BatchMatchRequest(BaseModel):
    """Request to process multiple user-project combinations in batch."""
    user_profiles: List[Dict[str, Any]]
    projects: List[Dict[str, Any]]
    weights: Optional[Dict[str, float]] = None


class MatchResponse(BaseModel):
    ranked_projects: List[Dict[str, Any]]
    count: int


class BatchMatchResponse(BaseModel):
    """Response with match results for each user profile."""
    results: List[Dict[str, Any]]
    total_profiles: int
    total_projects: int
    processing_time_seconds: float


class CandidateMatchRequest(BaseModel):
    project: Dict[str, Any]
    candidates: List[Dict[str, Any]]
    weights: Optional[Dict[str, float]] = None


class CandidateMatchResponse(BaseModel):
    ranked_candidates: List[Dict[str, Any]]
    count: int


@app.post("/match/score", response_model=MatchResponse)
async def score_matches(request: MatchRequest):
    try:
        logger.info(f"[SCORE] Received {len(request.projects)} projects from client")
        logger.info(f"[SCORE] First 3 project IDs: {[p.get('id', 'MISSING') for p in request.projects[:3]]}")
        logger.info(f"[SCORE] User profile - skills: {request.user_profile.get('skills', [])}, interests: {request.user_profile.get('interests', [])}")
        
        weights = None
        if request.weights:
            weights = MatchWeights(**request.weights)

        engine = get_matching_engine(weights=weights)
        match_scores = engine.rank_projects(
            user_profile=request.user_profile,
            projects=request.projects
        )

        logger.info(f"[SCORE] Ranked {len(match_scores)} projects")
        logger.info(f"[SCORE] Score distribution: min={min(s.total_score for s in match_scores):.3f}, max={max(s.total_score for s in match_scores):.3f}, mean={sum(s.total_score for s in match_scores) / len(match_scores):.3f}")
        logger.info(f"[SCORE] First 3 result IDs and scores: {[(s.project_id, s.total_score) for s in match_scores[:3]]}")

        ranked = [score.to_dict() for score in match_scores]

        return MatchResponse(
            ranked_projects=ranked,
            count=len(ranked)
        )

    except Exception as e:
        logger.error(f"[SCORE] Error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Matching failed: {str(e)}"
        )


@app.post("/match/batch", response_model=BatchMatchResponse)
async def batch_score_matches(request: BatchMatchRequest):
    """
    Process multiple user profiles against a set of projects in batch.

    This endpoint is optimized for scenarios where you need to rank projects
    for multiple users simultaneously. It leverages:
    - Shared embedding cache across all users
    - Batch embedding computation for efficiency
    - Single model instance for all computations

    Example use case: Matching all candidates to a set of projects.
    """
    start_time = time.perf_counter()

    try:
        weights = None
        if request.weights:
            weights = MatchWeights(**request.weights)

        engine = get_matching_engine(weights=weights)

        results = []
        for user_profile in request.user_profiles:
            try:
                match_scores = engine.rank_projects(
                    user_profile=user_profile,
                    projects=request.projects
                )

                ranked = [score.to_dict() for score in match_scores]
                results.append({
                    "user_id": user_profile.get("id", "unknown"),
                    "ranked_projects": ranked,
                    "count": len(ranked)
                })

            except Exception as e:
                # Log error but continue processing other profiles
                logger.error(f"Error processing user {user_profile.get('id', 'unknown')}: {e}")
                results.append({
                    "user_id": user_profile.get("id", "unknown"),
                    "error": str(e),
                    "ranked_projects": [],
                    "count": 0
                })

        processing_time = time.perf_counter() - start_time

        return BatchMatchResponse(
            results=results,
            total_profiles=len(request.user_profiles),
            total_projects=len(request.projects),
            processing_time_seconds=round(processing_time, 3)
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Batch matching failed: {str(e)}"
        )


@app.post("/match/candidates", response_model=CandidateMatchResponse)
async def score_candidates(request: CandidateMatchRequest):
    """Rank candidates for a project by treating each candidate as a user profile."""
    start_time = time.perf_counter()
    try:
        project_id = request.project.get("id", "unknown")
        logger.info(f"[CANDIDATES] Received {len(request.candidates)} candidates for project '{project_id}'")
        logger.info(f"[CANDIDATES] Project skills: {request.project.get('skills', [])}, tags: {request.project.get('tags', [])}")
        logger.debug(f"[CANDIDATES] Project description: {str(request.project.get('description', ''))[:100]}")

        weights = None
        if request.weights:
            weights = MatchWeights(**request.weights)

        engine = get_matching_engine(weights=weights)

        # Build a single-project list from the project dict so we can reuse rank_projects
        project_as_target = {
            "id": str(project_id),
            "description": request.project.get("description", ""),
            "skills": request.project.get("skills") or [],
            "tags": request.project.get("tags") or [],
        }

        ranked = []
        for candidate in request.candidates:
            user_profile = {
                "skills": candidate.get("skills") or [],
                "interests": candidate.get("interests") or [],
                "bio": candidate.get("bio") or "",
            }
            score = engine.calculate_match_score(user_profile, project_as_target)
            result = score.to_dict()
            result["candidate_id"] = candidate.get("id", "")
            result["candidate_name"] = candidate.get("name", "")
            ranked.append(result)
            logger.debug(
                f"[CANDIDATES] {candidate.get('name', candidate.get('id', '?'))}: "
                f"total={score.total_score:.3f}, semantic={score.semantic_score:.3f}, "
                f"skills={score.skill_score:.3f}, interests={score.interest_score:.3f}"
            )

        ranked.sort(key=lambda x: x["total_score"], reverse=True)

        elapsed = time.perf_counter() - start_time
        scores = [r["total_score"] for r in ranked]
        if scores:
            logger.info(
                f"[CANDIDATES] Ranked {len(ranked)} candidates in {elapsed:.3f}s — "
                f"min={min(scores):.3f}, max={max(scores):.3f}, "
                f"mean={sum(scores)/len(scores):.3f}"
            )
            logger.info(
                f"[CANDIDATES] Top 3: {[(r['candidate_name'] or r['candidate_id'], round(r['total_score'], 3)) for r in ranked[:3]]}"
            )
        else:
            logger.info(f"[CANDIDATES] No candidates to rank (elapsed {elapsed:.3f}s)")

        return CandidateMatchResponse(ranked_candidates=ranked, count=len(ranked))

    except Exception as e:
        logger.error(f"[CANDIDATES] Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Candidate matching failed: {str(e)}")


@app.get("/match/health")
async def match_health_check():
    try:
        engine = get_matching_engine()
        cache = get_embedding_cache()
        cache_stats = cache.get_stats()

        return {
            "status": "healthy",
            "model": "all-MiniLM-L6-v2",
            "weights": {
                "semantic": engine.weights.semantic,
                "skills": engine.weights.skills,
                "interests": engine.weights.interests,
            },
            "cache": cache_stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {e}")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("ENV") == "development"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)
