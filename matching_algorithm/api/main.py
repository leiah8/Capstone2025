from __future__ import annotations
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from matching import get_matching_engine, get_elo_system, MatchWeights

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


class PersonToProjectRequest(BaseModel):
    user_profile: Dict[str, Any]
    projects: List[Dict[str, Any]]
    weights: Optional[Dict[str, float]] = None
    limit: Optional[int] = Field(default=50, ge=1, le=100)


class ProjectToPersonRequest(BaseModel):
    project: Dict[str, Any]
    candidates: List[Dict[str, Any]]
    weights: Optional[Dict[str, float]] = None
    limit: Optional[int] = Field(default=50, ge=1, le=100)


class EloUpdateRequest(BaseModel):
    user_id: str
    project_id: str
    user_elo: Optional[float] = None
    project_elo: Optional[float] = None
    match_quality: float = Field(ge=0.0, le=1.0)


class EloUpdateResponse(BaseModel):
    user_id: str
    project_id: str
    new_user_elo: float
    new_project_elo: float


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
                "elo_rating": engine.weights.elo_rating,
                "experience_match": engine.weights.experience_match,
                "location_match": engine.weights.location_match,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {e}")


@app.post("/match/person-to-project", response_model=MatchResponse)
async def match_person_to_project(request: PersonToProjectRequest):
    try:
        weights = None
        if request.weights:
            weights = MatchWeights(**request.weights)
        
        engine = get_matching_engine(weights=weights)
        match_scores = engine.rank_projects(
            user_profile=request.user_profile,
            projects=request.projects
        )
        
        limited_scores = match_scores[:request.limit]
        ranked = [score.to_dict() for score in limited_scores]
        
        return MatchResponse(
            ranked_projects=ranked,
            count=len(ranked)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Person-to-project matching failed: {str(e)}"
        )


@app.post("/match/project-to-person", response_model=MatchResponse)
async def match_project_to_person(request: ProjectToPersonRequest):
    try:
        weights = None
        if request.weights:
            weights = MatchWeights(**request.weights)
        
        engine = get_matching_engine(weights=weights)
        
        candidate_scores = []
        for candidate in request.candidates:
            try:
                score = engine.calculate_match_score(
                    user_profile=candidate,
                    project=request.project
                )
                candidate_scores.append(score)
            except Exception as e:
                continue
        
        candidate_scores.sort(key=lambda x: x.total_score, reverse=True)
        limited_scores = candidate_scores[:request.limit]
        ranked = [score.to_dict() for score in limited_scores]
        
        return MatchResponse(
            ranked_projects=ranked,
            count=len(ranked)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Project-to-person matching failed: {str(e)}"
        )


@app.post("/match/update-elo", response_model=EloUpdateResponse)
async def update_elo_ratings(request: EloUpdateRequest):
    try:
        elo_system = get_elo_system()
        
        new_user_elo, new_project_elo = elo_system.update_match_ratings(
            user_rating=request.user_elo,
            project_rating=request.project_elo,
            match_quality=request.match_quality
        )
        
        return EloUpdateResponse(
            user_id=request.user_id,
            project_id=request.project_id,
            new_user_elo=new_user_elo,
            new_project_elo=new_project_elo
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Elo update failed: {str(e)}"
        )
