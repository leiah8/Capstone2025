// lib/candidates.ts
import { supabase } from './supabase';

export type links = {
    github : string | null;
    twitter : string | null;
    linkedin : string | null;
    instagram : string | null;
    portfolio : string | null;
    other : string | null;
};

const null_links = {github : null, twitter : null, linkedin : null, instagram : null, portfolio : null, other : null}

export type ed = {
    year : string;
    degree : string;
    school : string;
};

export type profile_project = {
    link : string | null;
    name : string;
    description : string;
};

export type job = {
    company : string;
    duration : string;
    position : string;
    description : string;

};

export type CandidateUI = {
  id: string;
  name: string;
  location: string | null;
  profile_image: string;
  bio: string | null;
  skills: string[];
  interests : string[];
  links : links;
  education : ed[];
  personal_projects : profile_project[];
  experience : job[];

  lat : number | null;
  lng : number | null;
};

type DbCandidate = {
  id: string | number;
  name : string;
  profile_image : string;
  bio : string | null;
  location : string | null; 
  skills : string[] | null;
  interests : string[] | null;
  links : [] | JSON; 
  education : JSON[] | null;
  personal_projects : JSON[] | null;
  experience : JSON[] | null;

  lat : number | null;
  lng : number | null;
};

export type MyProject = {
  id: number;
  title: string;
  description: string;
  skills_needed: string[] | null;
  tags: string[] | null;
  image: string | null;
  is_active: boolean;
  created_at: string;
};

export async function likeCandidate(
  userId: string,
  projectId: string,
  candidateId : string,
  reaction: 'like' | 'pass' = 'like'
): Promise<void> {
  const { error } = await supabase
    .from('candidate_likes')
    .upsert(
      { owner_id: userId, project_id: projectId, candidate_id : candidateId, reaction : reaction },
      { onConflict: 'owner_id,project_id,candidate_id' }
    );
  if (error) throw error;
  else if (reaction === 'like') {
    const { data } = await supabase.functions.invoke('check-for-match', {
      body: { candidate_id : candidateId, project_id : projectId, owner_id : userId }
    })
    console.log(data.message);
  }
}

export async function fetchCoords(city_name : string | null) : Promise<{lat : number | null, lng : number | null}> {
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
};


export async function fetchMyCoords(userId : string | undefined) : Promise<{lat : number | null, lng : number | null}> {
  try {
      const { data, error } = await supabase
        .from('profiles')
        .select('location')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;


      const city_name = data ? data.location : ""; 

      return fetchCoords(city_name)


      
    } catch (e: any) {
      return {lat : null, lng : null}
    }

}

export async function fetchCandidates(limit = 50, userId : string | undefined): Promise<CandidateUI[]> {
  let query = supabase
    .from('profiles')
    .select( 
      `
        id,
        name, 
        bio, 
        location, 
        skills, 
        interests, 
        links, 
        education, 
        personal_projects, 
        experience, 
        profile_image
        
      `
    )
    .eq('visible', true)
    .order('resume_updated_at', { ascending: false })
    .limit(limit);
  

  if (userId) {
    query = query.neq('id', userId);
  }
  

  const { data, error } = await query
  if (error) throw error;

  // const rows = (data ?? []) as unknown as DbCandidate[];
  const rows2 = (data ?? [])

  // const rows : DbCandidate[] = [];
  // rows2.forEach(async c => {
  //   //get location
  //   let coord = await fetchCoords(c.location)
  //   rows2.push({ ...c, lat: coord.lat, lng: coord.lng } as unknown as DbCandidate);
  // })

  const rows: DbCandidate[] = await Promise.all(
    (data ?? []).map(async (c) => {
      const coord = await fetchCoords(c.location);
      return { ...c, lat: coord.lat, lng: coord.lng } as unknown as DbCandidate;
    })
  );



  return rows.map((row) => {
    const links_parsed = Array.isArray(row.links) ? null_links : row.links as unknown as  links 
    const education_parsed = Array.isArray(row.education) ? row.education as unknown as ed[] : []
    const projects_parsed = Array.isArray(row.personal_projects) ? row.personal_projects as unknown as profile_project[] : []
    const experience_parsed = Array.isArray(row.experience) ? row.experience as unknown as job[] : []
    return {
      id: String(row.id),
      name: String(row.name),
      bio : row.bio ?? null, 
      location: row.location ?? null,
      profile_image: row.profile_image ?? 'https://picsum.photos/400/300?blur=2',
      skills: row.skills ?? [],
      interests : row.interests ?? [], 

      links : links_parsed, 
      education : education_parsed,
      personal_projects : projects_parsed,

      experience : experience_parsed,
      lat : row.lat,
      lng : row.lng,

    };
  });
}



export async function fetchMyProjects(ownerId : string | undefined) : Promise<MyProject[]> {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, title, description, skills_needed, tags, image, is_active, created_at')
        .eq('owner_id', ownerId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as MyProject[]);
    } catch (e: any) {
      return []
    } finally {
    }
  };