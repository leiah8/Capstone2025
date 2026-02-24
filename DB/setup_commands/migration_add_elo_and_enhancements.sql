-- Migration: Add Elo ratings, experience levels, and enhanced matching fields
-- Date: 2026-02-24
-- Description: Adds fields required for enhanced matching algorithm

-- Add new columns to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS elo_rating numeric DEFAULT 1200.0,
  ADD COLUMN IF NOT EXISTS experience_level text CHECK (experience_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add new columns to projects table
ALTER TABLE projects 
  ADD COLUMN IF NOT EXISTS nice_to_have_skills text[],
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS elo_rating numeric DEFAULT 1200.0,
  ADD COLUMN IF NOT EXISTS required_experience_level text CHECK (required_experience_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create indices for better query performance
CREATE INDEX IF NOT EXISTS profiles_elo_rating_idx ON profiles(elo_rating);
CREATE INDEX IF NOT EXISTS profiles_experience_level_idx ON profiles(experience_level);
CREATE INDEX IF NOT EXISTS profiles_location_idx ON profiles(location);

CREATE INDEX IF NOT EXISTS projects_elo_rating_idx ON projects(elo_rating);
CREATE INDEX IF NOT EXISTS projects_is_active_idx ON projects(is_active);
CREATE INDEX IF NOT EXISTS projects_location_idx ON projects(location);

-- Update trigger for profiles
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at_trigger ON profiles;
CREATE TRIGGER profiles_updated_at_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

-- Update trigger for projects
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projects_updated_at_trigger ON projects;
CREATE TRIGGER projects_updated_at_trigger
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();
