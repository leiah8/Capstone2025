// lib/projects.ts

export type MatchUI = {
    match_id: string | number;
    candidate_name: string;
    project_name : string;
    owner_name : string;

    owner_id : string;
    candidate_id : string;
    
    project_image: string;
    candidate_image : string; 
    owner_image : string;
};

export type DbMatch = {
    id: string | number;
    owner_id: string;
    project_id : string;
    candidate_id : string;
    created_at : string;
};


export type Message = {
    id : string;
    conversation_id : string;
    sender_id : string;
    body: string;
    created_at : string;
}