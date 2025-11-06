// lib/projects.ts
import { supabase } from './supabase';
import { resolveProfileImageUrl } from './profile';

export type ProjectUI = {
  id: string;
  name: string;
  location: string;
  image: string;
  description: string;
  creatorImage: string;
  skillsNeeded: string[]; 
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
  profiles: { location: string | null; profile_image: string | null } | null;
};

// Set this to your actual FK name from Supabase (projects.owner_id → profiles.id)
const FK = 'projects_owner_id_fkey';

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
  return rows.map((row) => ({
    id: String(row.id),
    name: row.title,
    location: row.profiles?.location ?? '—',
    image: row.image ?? 'https://picsum.photos/400/300?blur=2',
    description: row.description ?? '',
    creatorImage: resolveProfileImageUrl(row.profiles?.profile_image ?? null, row.owner_id),
    skillsNeeded: row.skills_needed ?? [],
  }));
}
