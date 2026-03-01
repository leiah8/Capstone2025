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
  // allow either object or array (if join inference ever breaks)
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

export async function fetchProjects(limit = 50, excludeOwnerId?: string): Promise<ProjectUI[]> {
  let query = supabase
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

  if (excludeOwnerId) {
    query = query.neq('owner_id', excludeOwnerId);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as unknown as DbProject[];

  return rows.map((row) => {
    const prof = asSingleProfile(row.profiles);
    return {
      id: String(row.id),
      name: row.title,
      location: prof?.location ?? '—',
      image: row.image ?? 'https://picsum.photos/400/300?blur=2',
      description: row.description ?? '',
      creatorImage: resolveProfileImageUrl(
        prof?.profile_image ?? null,
        row.owner_id,
        'profiles' // your bucket
      ),
      skillsNeeded: row.skills_needed ?? [],
    };
  });
}
