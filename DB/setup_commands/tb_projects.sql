CREATE TABLE projects (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  skills_needed text[],
  nice_to_have_skills text[],
  tags text[],
  intention text,
  location text,
  is_active boolean DEFAULT true,
  elo_rating numeric DEFAULT 1200.0,
  required_experience_level text CHECK (required_experience_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX projects_owner_idx ON projects(owner_id);
CREATE INDEX projects_elo_rating_idx ON projects(elo_rating);
CREATE INDEX projects_is_active_idx ON projects(is_active);
CREATE INDEX projects_location_idx ON projects(location);
