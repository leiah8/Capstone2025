CREATE TABLE candidate_likes (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction text CHECK (reaction IN ('like','pass')) DEFAULT 'like',
  created_at timestamptz DEFAULT now(),
  -- owner must actually own the project; app enforces in code
  UNIQUE (owner_id, project_id, candidate_id)
);
CREATE INDEX candidate_likes_proj_idx ON candidate_likes(project_id);
CREATE INDEX candidate_likes_candidate_idx ON candidate_likes(candidate_id);
