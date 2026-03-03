CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  first_name text,
  last_name text,
  bio text,
  location text,
  profile_image text,
  skills text[],              -- ['python','react']
  interests text[],           -- ['AI','design']
  links jsonb DEFAULT '{}',   -- { github:'...', linkedin:'...', ... }
  education jsonb DEFAULT '[]',
  experience jsonb DEFAULT '[]',
  personal_projects jsonb DEFAULT '[]',
  resume_url text,
  resume_updated_at timestamptz,
  onboarded boolean DEFAULT false,
  visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
