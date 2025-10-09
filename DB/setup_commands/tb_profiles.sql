CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  bio text,
  location text,
  skills text[],              -- ['python','react']
  interests text[],           -- ['AI','design']
  links jsonb DEFAULT '[]',   -- [{label:'github',url:'...'}]
  visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
