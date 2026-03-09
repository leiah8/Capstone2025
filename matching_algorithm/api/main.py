from __future__ import annotations
import os
from typing import Any, Dict, List, Optional

import uvicorn
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
        
        ranked = [score.to_dict() for score in match_scores]
        
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


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
