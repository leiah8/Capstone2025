/**
 * Matching Algorithm API Integration
 * Connects to the FastAPI matching service
 */

const MATCHING_API_URL = 'http://localhost:8000';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface UserProfile {
  id?: string;
  skills: string[];
  interests: string[];
  bio?: string;
  elo_rating?: number;
  experience_level?: ExperienceLevel;
  location?: string;
}

export interface Project {
  id: string;
  name?: string;
  description: string;
  skills_needed?: string[];
  nice_to_have_skills?: string[];
  tags?: string[];
  elo_rating?: number;
  required_experience_level?: ExperienceLevel;
  location?: string;
}

export interface MatchScoreBreakdown {
  semantic_similarity: number;
  must_have_skills: number;
  nice_to_have_skills: number;
  interest_alignment: number;
  elo_rating: number;
  experience_match: number;
  location_match: number;
}

export interface MatchExplanation {
  matched_must_have_skills: string[];
  matched_nice_to_have_skills: string[];
  matched_interests: string[];
  missing_must_have_skills: string[];
  experience_level_match?: string;
  location_distance?: string;
}

export interface MatchScore {
  project_id: string;
  total_score: number;
  breakdown: MatchScoreBreakdown;
  explanation: MatchExplanation;
}

export interface MatchWeights {
  semantic?: number;
  must_have_skills?: number;
  nice_to_have_skills?: number;
  interests?: number;
  elo_rating?: number;
  experience_match?: number;
  location_match?: number;
}

export interface PersonToProjectRequest {
  user_profile: UserProfile;
  projects: Project[];
  weights?: MatchWeights;
  limit?: number;
}

export interface ProjectToPersonRequest {
  project: Project;
  candidates: UserProfile[];
  weights?: MatchWeights;
  limit?: number;
}

export interface MatchResponse {
  ranked_projects: MatchScore[];
  count: number;
}

export interface EloUpdateRequest {
  user_id: string;
  project_id: string;
  user_elo?: number;
  project_elo?: number;
  match_quality: number;
}

export interface EloUpdateResponse {
  user_id: string;
  project_id: string;
  new_user_elo: number;
  new_project_elo: number;
}

export async function matchPersonToProject(
  request: PersonToProjectRequest
): Promise<MatchScore[]> {
  try {
    const response = await fetch(`${MATCHING_API_URL}/match/person-to-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Matching API error: ${response.status} - ${errorText}`);
    }

    const data: MatchResponse = await response.json();
    return data.ranked_projects;
  } catch (error) {
    throw error;
  }
}

export async function matchProjectToPerson(
  request: ProjectToPersonRequest
): Promise<MatchScore[]> {
  try {
    const response = await fetch(`${MATCHING_API_URL}/match/project-to-person`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Matching API error: ${response.status} - ${errorText}`);
    }

    const data: MatchResponse = await response.json();
    return data.ranked_projects;
  } catch (error) {
    throw error;
  }
}

export async function updateEloRatings(
  request: EloUpdateRequest
): Promise<EloUpdateResponse> {
  try {
    const response = await fetch(`${MATCHING_API_URL}/match/update-elo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Elo update error: ${response.status} - ${errorText}`);
    }

    const data: EloUpdateResponse = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
}

export async function getMatchedProjects(
  userProfile: UserProfile,
  projects: Project[]
): Promise<MatchScore[]> {
  return matchPersonToProject({
    user_profile: userProfile,
    projects: projects,
  });
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
