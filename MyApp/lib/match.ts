// lib/projects.ts

export type MatchUI = {
    match_id: string | number;
    candidate_name: string;
    project_name : string;
    owner_name : string;

    owner_id : string;
    candidate_id : string;
    project_id: string;

    project_image: string;
    candidate_image : string;
    owner_image : string;
    created_at: string;

    last_message_body?: string;
    last_message_at?: string;
};

export type DbMatch = {
    id: string | number;
    owner_id: string;
    project_id : string;
    candidate_id : string;
    created_at : string;
};

export type MatchCheckResult = {
    match: boolean;
    message?: string;
    data?: DbMatch | Record<string, unknown>;
};


export type Message = {
    id : string;
    conversation_id : string;
    sender_id : string;
    body: string;
    created_at : string;
}

export type Conversation = {
    id : string | number;
    project_id : string | number;
    owner_id : string;
    title : string | null;
    created_at : string;
}
