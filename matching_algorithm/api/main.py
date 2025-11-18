from __future__ import annotations
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from matching import get_matching_engine, MatchWeights

app = FastAPI(title="Matching Algorithm API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MatchRequest(BaseModel):
    user_profile: Dict[str, Any]
    projects: List[Dict[str, Any]]
    weights: Optional[Dict[str, float]] = None


class MatchResponse(BaseModel):
    ranked_projects: List[Dict[str, Any]]
    count: int


@app.post("/match/score", response_model=MatchResponse)
async def score_matches(request: MatchRequest):
    try:
        weights = None
        if request.weights:
            weights = MatchWeights(**request.weights)
        
        engine = get_matching_engine(weights=weights)
        match_scores = engine.rank_projects(
            user_profile=request.user_profile,
            projects=request.projects
        )
        
        # Transform to match frontend expectations
        ranked = []
        for score in match_scores:
            score_dict = score.to_dict()
            # Transform backend format to frontend format
            ranked.append({
                "project_id": score_dict["project_id"],
                "project_name": request.projects[[p["id"] for p in request.projects].index(score_dict["project_id"])]["name"],
                "overall_score": score_dict["total_score"],
                "semantic_similarity": score_dict["breakdown"]["semantic_similarity"],
                "must_have_match": score_dict["breakdown"]["must_have_skills"],
                "nice_to_have_match": score_dict["breakdown"]["nice_to_have_skills"],
                "interest_match": score_dict["breakdown"]["interest_alignment"],
                "matched_must_have": score_dict["explanation"]["matched_must_have_skills"],
                "matched_nice_to_have": score_dict["explanation"]["matched_nice_to_have_skills"],
                "matched_interests": score_dict["explanation"]["matched_interests"],
                "missing_must_have": score_dict["explanation"]["missing_must_have_skills"],
            })
        
        return MatchResponse(
            ranked_projects=ranked,
            count=len(ranked)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Matching failed: {str(e)}"
        )


@app.get("/match/health")
async def match_health_check():
    try:
        engine = get_matching_engine()
        return {
            "status": "healthy",
            "model": "all-MiniLM-L6-v2",
            "weights": {
                "semantic": engine.weights.semantic,
                "must_have_skills": engine.weights.must_have_skills,
                "nice_to_have_skills": engine.weights.nice_to_have_skills,
                "interests": engine.weights.interests,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {e}")
