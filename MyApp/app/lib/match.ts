// lib/projects.ts

export type MatchUI = {
    match_id: string;
    candidate_name: string;
    project_name : string;
    owner_name : string;
    
    project_image: string;
    candidate_image : string; 
};

export type DbMatch = {
    id: string | number;
    owner_id: string;
    project_id : string;
    candidate_id : string;
    created_at : string;
};
