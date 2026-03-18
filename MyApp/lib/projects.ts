// lib/projects.ts
import { MatchCheckResult } from './match';
import { resolveProfileImageUrl } from './profile';
import { supabase } from './supabase';

export type ProjectUI = {
  id: string;
  owner_id : string
  name: string;
  location: string;
  image: string;
  description: string;
  creatorImage: string;
  skillsNeeded: string[];

  lat : number | null;
  lng : number | null;
  interests?: string[];
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
  tags: string[] | null;
  // allow either object or array (if join inference ever breaks)
  profiles:
    | { location: string | null; profile_image: string | null }
    | { location: string | null; profile_image: string | null }[]
    | null;

  lat : number | null;
  lng : number | null;
};

const FK = 'projects_owner_id_fkey';

const asSingleProfile = (
  p: DbProject['profiles']
): { location: string | null; profile_image: string | null } | null =>
  Array.isArray(p) ? p[0] ?? null : p ?? null;

export async function likeProject(
  userId: string,
  ownerId : string,
  projectId: string,
  reaction: 'like' | 'pass' = 'like'
): Promise<MatchCheckResult | null> {
  const { error } = await supabase
    .from('project_likes')
    .upsert(
      { user_id: userId, project_id: Number(projectId), reaction },
      { onConflict: 'user_id,project_id' }
    );
  if (error) throw error;
  if (reaction !== 'like') return null;

  const { data, error: matchError } = await supabase.functions.invoke(
    'check-for-match',
    {
      body: { candidate_id : userId, project_id : projectId, owner_id : ownerId }
    }
  );

  if (matchError) throw matchError;

  const matchResult = (data ?? null) as MatchCheckResult | null;
  if (matchResult?.message) console.log(matchResult.message);
  return matchResult;
}

export async function fetchCoords(ownerId : string) : Promise<{lat : number | null, lng : number | null}> {
  // if (city_name == null) {
  //   return {lat : null, lng : null} 
  // }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('location')
      .eq('id', ownerId)
      .maybeSingle();
    if (error) throw error;


    const city_name = data ? data.location : ""; 

    if (city_name == null) {
      return {lat : null, lng : null} 
    }

    const { data : data2, error : error2 } = await supabase
      .from('city_locations')
      .select('*')
      .eq('name', city_name)
      .maybeSingle();
    if (error2) throw error2;

    return data2 ? {lat : data2.lat, lng : data2.lng} :{lat : null, lng : null}


    
  } catch (e: any) {
    return {lat : null, lng : null}
  }

};

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
        tags,
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

  // const rows = (data ?? []) as unknown as DbProject[];

  const rows: DbProject[] = await Promise.all(
      (data ?? []).map(async (c) => {
        const coord = await fetchCoords(c.owner_id);
        return { ...c, lat: coord.lat, lng: coord.lng } as unknown as DbProject;
      })
    );


  return rows.map((row) => {
    const prof = asSingleProfile(row.profiles);
    return {
      id: String(row.id),
      owner_id : String(row.owner_id),
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
      lat : row.lat,
      lng : row.lng
      interests: row.tags ?? [],
    };
  });
}
