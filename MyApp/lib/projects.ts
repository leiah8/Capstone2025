// lib/projects.ts
import { supabase } from './supabase';
import { resolveProfileImageUrl } from './profile';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type ProjectUI = {
  id: string;
  name: string;
  location: string;
  image: string;
  description: string;
  creatorImage: string;
  skillsNeeded: string[];
  niceToHaveSkills?: string[];
  tags?: string[];
  eloRating?: number;
  requiredExperienceLevel?: ExperienceLevel;
};

type DbProject = {
  id: string | number;
  owner_id: string;
  title: string;
  description: string | null;
  image: string | null;
  is_active: boolean | null;
  created_at: string;
  skills_needed: string[] | null;
  nice_to_have_skills: string[] | null;
  tags: string[] | null;
  location: string | null;
  elo_rating: number | null;
  required_experience_level: ExperienceLevel | null;
  profiles:
    | { location: string | null; profile_image: string | null }
    | { location: string | null; profile_image: string | null }[]
    | null;
};

const FK = 'projects_owner_id_fkey';

const asSingleProfile = (
  p: DbProject['profiles']
): { location: string | null; profile_image: string | null } | null =>
  Array.isArray(p) ? p[0] ?? null : p ?? null;

export async function fetchProjects(limit = 50): Promise<ProjectUI[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      `
        id,
        owner_id,
        title,
        description,
        image,
        is_active,
        created_at,
        skills_needed,
        nice_to_have_skills,
        tags,
        location,
        elo_rating,
        required_experience_level,
        profiles:profiles!${FK} (
          location,
          profile_image
        )
      `
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data ?? []) as unknown as DbProject[];

  return rows.map((row) => {
    const prof = asSingleProfile(row.profiles);
    return {
      id: String(row.id),
      name: row.title,
      location: row.location ?? prof?.location ?? '—',
      image: row.image ?? 'https://picsum.photos/400/300?blur=2',
      description: row.description ?? '',
      creatorImage: resolveProfileImageUrl(
        prof?.profile_image ?? null,
        row.owner_id,
        'profiles'
      ),
      skillsNeeded: row.skills_needed ?? [],
      niceToHaveSkills: row.nice_to_have_skills ?? [],
      tags: row.tags ?? [],
      eloRating: row.elo_rating ?? undefined,
      requiredExperienceLevel: row.required_experience_level ?? undefined,
    };
  });
}
