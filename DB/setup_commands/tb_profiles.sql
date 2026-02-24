CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  bio text,
  location text,
  skills text[],
  interests text[],
  links jsonb DEFAULT '[]',
  visible boolean DEFAULT true,
  elo_rating numeric DEFAULT 1200.0,
  experience_level text CHECK (experience_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX profiles_elo_rating_idx ON profiles(elo_rating);
CREATE INDEX profiles_experience_level_idx ON profiles(experience_level);
CREATE INDEX profiles_location_idx ON profiles(location);
