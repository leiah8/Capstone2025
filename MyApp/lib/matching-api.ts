/**
 * Matching Algorithm API Integration
 * Connects to the FastAPI matching service
 */

import { ed, job, profile_project } from 'lib/candidates';
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const MATCHING_API_URL =
  process.env.EXPO_PUBLIC_MATCHING_EDGE_URL ||
  process.env.EXPO_PUBLIC_MATCHING_API_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/match-api` : "") ||
  "http://localhost:8000";

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
    skills?: string[];
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
  skill_match: number;
  interest_match: number;
  matched_skills: string[];
  missing_skills: string[];
  matched_interests: string[];
}


export interface MatchScoreCandidate { //might need to be fixed
  project_id: number;
  project_name: string;
  candidate_id : string; 
  candidate_name : string;
  overall_score: number;

  semantic_similarity: number;
  skill_match: number;
  interest_match: number;
  matched_skills: string[];
  missing_skills: string[];
  matched_interests: string[];

}

export interface MatchResponseProject {
  ranked_projects: MatchScoreProject[];
  total_projects: number;
}

export interface MatchResponseCandidate {
  ranked_candidates: MatchScoreCandidate[];
  total_projects: number;
}

export interface BatchMatchRequest {
  user_profiles: Array<{
    id: string;
    skills: string[];
    interests: string[];
    bio?: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    description: string;
    skills?: string[];
    tags?: string[];
  }>;
  weights?: {
    semantic?: number;
    skills?: number;
    interests?: number;
  };
}

export interface BatchMatchResponse {
  results: Array<{
    user_id: string;
    ranked_projects: MatchScoreProject[];
    count: number;
    error?: string;
  }>;
  total_profiles: number;
  total_projects: number;
  processing_time_seconds: number;
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
    const REQUEST_TIMEOUT_MS = 7000;
    // Transform projects to match API format
    const apiProjects = projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      skills: p.skillsNeeded || [],
      interests: p.interests || [],
      tags: p.interests || [],
    }));

    // Build a bio proxy from skills+interests so semantic scoring works even
    // when the user hasn't written a bio yet.
    const effectiveBio = userProfile.bio?.trim()
      || (userProfile.skills.length > 0 || userProfile.interests.length > 0
        ? [
            userProfile.skills.length > 0 ? `Skills: ${userProfile.skills.join(', ')}` : '',
            userProfile.interests.length > 0 ? `Interests: ${userProfile.interests.join(', ')}` : '',
          ].filter(Boolean).join('. ')
        : undefined);

    console.log(`[API] Sending ${apiProjects.length} projects to matching API`);
    console.log(`[API] First 3 project IDs:`, apiProjects.slice(0, 3).map(p => p.id));
    console.log(`[API] Sample project tags:`, apiProjects.slice(0, 2).map(p => ({ id: p.id, tags: p.tags })));
    console.log(`[API] User interests:`, userProfile.interests);
    console.log(`[API] Effective bio (raw/proxy):`, effectiveBio?.slice(0, 80));

    const requestBody: MatchRequestProject = {
      user_profile: {
        skills: userProfile.skills,
        interests: userProfile.interests,
        bio: effectiveBio,
      },
      projects: apiProjects,
    };

    const { data: { session } } = await supabase.auth.getSession();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${MATCHING_API_URL}/match/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify(requestBody),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Matching API error: ${response.status} - ${errorText}`);
    }

    const data: MatchResponseProject = await response.json();
    console.log(`[API] Received ${data.ranked_projects.length} ranked projects from API`);
    console.log(`[API] First 3 project_ids in response:`, data.ranked_projects.slice(0, 3).map(r => r.project_id));
    console.log(`[API] Response sample scores:`, data.ranked_projects.slice(0, 3).map(r => ({ id: r.project_id, overall_score: r.overall_score, total_score: r.total_score })));
    
    return data.ranked_projects.map((r: any) => ({
      project_id: r.project_id,
      project_name: r.project_name ?? "",
      overall_score: r.overall_score ?? r.total_score ?? 0,
      semantic_similarity: r.semantic_similarity ?? r.breakdown?.semantic_similarity ?? 0,
      skill_match: r.skill_match ?? r.breakdown?.skill_match ?? 0,
      interest_match: r.interest_match ?? r.breakdown?.interest_alignment ?? 0,
      matched_skills: r.matched_skills ?? r.explanation?.matched_skills ?? [],
      missing_skills: r.missing_skills ?? r.explanation?.missing_skills ?? [],
      matched_interests: r.matched_interests ?? r.explanation?.matched_interests ?? [],
    }));
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Matching API timed out after 7s');
      console.warn('Matching request timed out, falling back to default ordering');
      throw timeoutError;
    }

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

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${MATCHING_API_URL}/match/candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Matching API error: ${response.status} - ${errorText}`);
    }

    const data : MatchResponseCandidate = await response.json();
    return data.ranked_candidates.map((r: any) => ({
      project_id: user_project.id, 
      project_name: r.project_name ?? "",
      candidate_id: r.candidate_id ?? "",
      candidate_name: r.candidate_name ?? "",
      overall_score: r.overall_score ?? r.total_score ?? 0,
      semantic_similarity: r.semantic_similarity ?? r.breakdown?.semantic_similarity ?? 0,
      skill_match: r.skill_match ?? r.breakdown?.skill_match ?? 0,
      interest_match: r.interest_match ?? r.breakdown?.interest_alignment ?? 0,
      matched_skills: r.matched_skills ?? r.explanation?.matched_skills ?? [],
      missing_skills: r.missing_skills ?? r.explanation?.missing_skills ?? [],
      matched_interests: r.matched_interests ?? r.explanation?.matched_interests ?? [],
    }));
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
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${MATCHING_API_URL}/match/health`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    return response.ok;
  } catch (error) {
    console.warn('Matching API not available:', error);
    return false;
  }
}

/**
 * Batch process multiple user profiles against a set of projects.
 *
 * This is more efficient than calling getMatchedProjects() multiple times
 * because it:
 * - Shares embedding cache across all users
 * - Computes project embeddings only once
 * - Processes all users in a single API request
 *
 * Use this when you need to match multiple candidates to the same set of projects.
 */
export async function getBatchMatchedProjects(
  userProfiles: Array<{
    id: string;
    skills: string[];
    interests: string[];
    bio?: string;
  }>,
  projects: Array<{
    id: string;
    name: string;
    description: string;
    skillsNeeded?: string[];
    interests?: string[];
  }>
): Promise<BatchMatchResponse> {
  try {
    // Transform projects to match API format
    const apiProjects = projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      skills: p.skillsNeeded || [],
      tags: p.interests || [],
    }));

    const requestBody: BatchMatchRequest = {
      user_profiles: userProfiles,
      projects: apiProjects,
    };

    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${MATCHING_API_URL}/match/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Batch matching API error: ${response.status} - ${errorText}`);
    }

    const data: BatchMatchResponse = await response.json();

    // Transform the response to match our expected format
    return {
      ...data,
      results: data.results.map(result => ({
        ...result,
        ranked_projects: result.ranked_projects?.map((r: any) => ({
          project_id: r.project_id,
          project_name: r.project_name ?? "",
          overall_score: r.overall_score ?? r.total_score ?? 0,
          semantic_similarity: r.semantic_similarity ?? r.breakdown?.semantic_similarity ?? 0,
          skill_match: r.skill_match ?? r.breakdown?.skill_match ?? 0,
          interest_match: r.interest_match ?? r.breakdown?.interest_alignment ?? 0,
          matched_skills: r.matched_skills ?? r.explanation?.matched_skills ?? [],
          missing_skills: r.missing_skills ?? r.explanation?.missing_skills ?? [],
          matched_interests: r.matched_interests ?? r.explanation?.matched_interests ?? [],
        })) || []
      }))
    };
  } catch (error) {
    console.error('Error calling batch matching algorithm:', error);
    throw error;
  }
}
