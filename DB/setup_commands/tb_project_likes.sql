CREATE TABLE project_likes (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id bigint NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reaction text CHECK (reaction IN ('like','pass')) DEFAULT 'like',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, project_id)  -- one reaction per candidate per project
);
CREATE INDEX project_likes_proj_idx ON project_likes(project_id);
CREATE INDEX project_likes_user_idx ON project_likes(user_id);
