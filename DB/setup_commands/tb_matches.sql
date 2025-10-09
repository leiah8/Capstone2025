CREATE TABLE matches (
  id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (project_id, candidate_id) -- one match per project-candidate
);
CREATE INDEX matches_owner_idx ON matches(owner_id);
CREATE INDEX matches_candidate_idx ON matches(candidate_id);
