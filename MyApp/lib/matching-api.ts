/**
 * Matching Algorithm API Integration
 * Connects to the FastAPI matching service
 */

const MATCHING_API_URL = 'http://localhost:8000';

export interface MatchRequest {
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

export interface MatchScore {
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

export interface MatchResponse {
  ranked_projects: MatchScore[];
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
): Promise<MatchScore[]> {
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

    const requestBody: MatchRequest = {
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

    const data: MatchResponse = await response.json();
    return data.ranked_projects;
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
