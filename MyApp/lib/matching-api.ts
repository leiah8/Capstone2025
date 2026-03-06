/**
 * Matching Algorithm API Integration
 * Connects to the FastAPI matching service
 */

const MATCHING_API_URL = 'http://localhost:8000';

import { ed, job, profile_project } from 'lib/candidates';

export interface MatchRequestProject {
  user_profile: {
    skills: string[];
    interests: string[];
    bio?: string;
  };
  projects: Array<{
    id: string;
    name: string;
    description: string;
    must_have_skills?: string[];
    nice_to_have_skills?: string[];
    interests?: string[];
  }>;
}

export interface MatchRequestCandidate {
  project: {
    title: string,
    description: string,
    skills: string[] | null,
    tags: string [] | null,
  };
  candidates: Array<{
    id: string,
    name: string,
    location: string,
    bio: string, 
    skills: string[],
    interests : string[],
    education : ed[],
    personal_projects : profile_project[],
    experience : job[],
  }>;
}


export interface MatchScoreProject {
  project_id: string;
  project_name: string;
  overall_score: number;
  semantic_similarity: number;
  must_have_match: number;
  nice_to_have_match: number;
  interest_match: number;
  matched_must_have: string[];
  matched_nice_to_have: string[];
  matched_interests: string[];
  missing_must_have: string[];
}


export interface MatchScoreCandidate { //might need to be fixed
  project_id: string;
  project_name: string;
  candidate_id : string; 
  candidate_name : string;
  overall_score: number;

  semantic_similarity: number;
  must_have_match: number;
  nice_to_have_match: number;
  interest_match: number;
  matched_must_have: string[];
  matched_nice_to_have: string[];
  matched_interests: string[];
  missing_must_have: string[];

}

export interface MatchResponseProject {
  ranked_projects: MatchScoreProject[];
  total_projects: number;
}

export interface MatchResponseCandidate {
  ranked_candidates: MatchScoreCandidate[];
  total_projects: number;
}

/**
 * Call the matching algorithm API to score and rank projects for a user
 */
export async function getMatchedProjects(
  userProfile: { skills: string[]; interests: string[]; bio?: string },
  projects: Array<{
    id: string;
    name: string;
    description: string;
    skillsNeeded?: string[];
    interests?: string[];
  }>
): Promise<MatchScoreProject[]> {
  try {
    // Transform projects to match API format
    const apiProjects = projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      must_have_skills: p.skillsNeeded || [],
      nice_to_have_skills: [], // Could be extended later
      interests: p.interests || [],
    }));

    const requestBody: MatchRequestProject = {
      user_profile: {
        skills: userProfile.skills,
        interests: userProfile.interests,
        bio: userProfile.bio,
      },
      projects: apiProjects,
    };

    const response = await fetch(`${MATCHING_API_URL}/match/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Matching API error: ${response.status} - ${errorText}`);
    }

    const data: MatchResponseProject = await response.json();
    return data.ranked_projects;
  } catch (error) {
    console.error('Error calling matching algorithm:', error);
    throw error;
  }
}


/**
 * Call the matching algorithm API to score and rank candidates for a user
 */
export async function getMatchedCandidates(
  user_project : {
    id: number;
    title: string;
    description: string;
    skills_needed: string[] | null;
    tags: string[] | null;
    image: string | null;
    is_active: boolean;
    created_at: string;
  },
  candidates : Array<{
    id: string;
    name: string;
    location: string | null;
    bio: string | null;
    skills: string[] | null;
    interests : string[] | null;
    education : ed[];
    personal_projects : profile_project[];
    experience : job[];}>
  
): Promise<MatchScoreCandidate[]> {
  
  try {
    // Transform projects to match API format
    const apiCandidates = candidates.map(c => ({
      id: c.id,
      name: c.name,
      location: c.location ?? "", 
      bio: c.bio ?? "", 
      skills: c.skills || [],
      interests : c.interests || [],
      education : c.education || [],
      personal_projects : c.personal_projects || [],
      experience : c.experience || []

    }));

    const requestBody: MatchRequestCandidate = {
      project : {
        title: user_project.title,
        description: user_project.description,
        skills: user_project.skills_needed,
        tags: user_project.tags,
      },
      candidates : apiCandidates,
    };

    const response = await fetch(`${MATCHING_API_URL}/match/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Matching API error: ${response.status} - ${errorText}`);
    }

    const data : MatchResponseCandidate = await response.json();
    return data.ranked_candidates;
  } catch (error) {
    console.error('Error calling matching algorithm:', error);
    throw error;
  }
}

/**
 * Check if the matching API is available
 */
export async function checkMatchingAPIHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${MATCHING_API_URL}/match/health`);
    return response.ok;
  } catch (error) {
    console.warn('Matching API not available:', error);
    return false;
  }
}
