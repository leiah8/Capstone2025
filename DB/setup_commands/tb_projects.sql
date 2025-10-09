CREATE TABLE projects (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  skills_needed text[],       -- ['python','ui']
  tags text[],                -- ['startup','ml']
  intention text,             -- 'resume' | 'school' | etc (free text for now)
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX projects_owner_idx ON projects(owner_id);
