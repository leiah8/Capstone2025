// lib/match-queries.ts
import { supabase } from './supabase';
import { MatchUI } from './match';

/**
 * Efficiently fetch project matches with proper JOINs to avoid N+1 queries.
 *
 * Instead of fetching matches then looping through each to get project and profile data,
 * this function uses a single query with JOINs to fetch everything at once.
 */
export async function fetchProjectMatchesOptimized(userId: string): Promise<MatchUI[]> {
  try {
    // Single query with JOINs to fetch all data at once
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        owner_id,
        candidate_id,
        created_at,
        project_id,
        projects:project_id (
          id,
          title,
          image
        ),
        owner_profile:profiles!matches_owner_id_fkey (
          id,
          name,
          profile_image
        ),
        candidate_profile:profiles!matches_candidate_id_fkey (
          id,
          name,
          profile_image
        )
      `)
      .eq('candidate_id', userId);

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading project matches:', error);
      return [];
    }

    if (!data) {
      return [];
    }

    // Transform the joined data into MatchUI format
    const matches: MatchUI[] = data.map((match: any) => ({
      match_id: match.id,
      candidate_name: match.candidate_profile?.name || '0',
      project_name: match.projects?.title || '0',
      owner_name: match.owner_profile?.name || '0',
      owner_id: match.owner_id,
      candidate_id: match.candidate_id,
      created_at: match.created_at,
      project_image: match.projects?.image || '0',
      candidate_image: match.candidate_profile?.profile_image || '0',
      owner_image: match.owner_profile?.profile_image || '0',
    }));

    return matches;
  } catch (error) {
    console.error('Error in fetchProjectMatchesOptimized:', error);
    return [];
  }
}

/**
 * Efficiently fetch candidate matches with proper JOINs to avoid N+1 queries.
 *
 * Similar to fetchProjectMatchesOptimized but for matches where the user is the owner.
 */
export async function fetchCandidateMatchesOptimized(userId: string): Promise<MatchUI[]> {
  try {
    // Single query with JOINs to fetch all data at once
    const { data, error } = await supabase
      .from('matches')
      .select(`
        id,
        owner_id,
        candidate_id,
        created_at,
        project_id,
        projects:project_id (
          id,
          title,
          image
        ),
        owner_profile:profiles!matches_owner_id_fkey (
          id,
          name,
          profile_image
        ),
        candidate_profile:profiles!matches_candidate_id_fkey (
          id,
          name,
          profile_image
        )
      `)
      .eq('owner_id', userId);

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading candidate matches:', error);
      return [];
    }

    if (!data) {
      return [];
    }

    // Transform the joined data into MatchUI format
    const matches: MatchUI[] = data.map((match: any) => ({
      match_id: match.id,
      candidate_name: match.candidate_profile?.name || '0',
      project_name: match.projects?.title || '0',
      owner_name: match.owner_profile?.name || '0',
      owner_id: match.owner_id,
      candidate_id: match.candidate_id,
      created_at: match.created_at,
      project_image: match.projects?.image || '0',
      candidate_image: match.candidate_profile?.profile_image || '0',
      owner_image: match.owner_profile?.profile_image || '0',
    }));

    return matches;
  } catch (error) {
    console.error('Error in fetchCandidateMatchesOptimized:', error);
    return [];
  }
}

/**
 * Fetch both project and candidate matches in parallel.
 *
 * This function runs both queries concurrently for maximum performance.
 */
export async function fetchAllMatchesOptimized(
  userId: string
): Promise<{ projectMatches: MatchUI[]; candidateMatches: MatchUI[] }> {
  const [projectMatches, candidateMatches] = await Promise.all([
    fetchProjectMatchesOptimized(userId),
    fetchCandidateMatchesOptimized(userId),
  ]);

  return { projectMatches, candidateMatches };
}
