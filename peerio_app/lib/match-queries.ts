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
      project_id: match.project_id,
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
      project_id: match.project_id,
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
 * Enrich matches with last message data.
 * Finds conversations between match participants and gets the latest message.
 */
async function enrichMatchesWithLastMessage(
  matches: MatchUI[],
  userId: string
): Promise<MatchUI[]> {
  if (matches.length === 0) return matches;

  try {
    // Step 1: Get all conversations the current user participates in
    const { data: myParts } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id')
      .eq('user_id', userId);
    if (!myParts || myParts.length === 0) return matches;

    const myConvIds = myParts.map((r) => r.conversation_id);

    // Step 2: Get all participants for those conversations to map conv → participants
    const { data: allParts } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', myConvIds);
    if (!allParts) return matches;

    // Build map: conversation_id → Set of participant user_ids
    const convParticipants = new Map<string, Set<string>>();
    for (const p of allParts) {
      const key = String(p.conversation_id);
      if (!convParticipants.has(key)) convParticipants.set(key, new Set());
      convParticipants.get(key)!.add(p.user_id);
    }

    // Step 3: Fetch latest messages for all conversations (ordered desc, pick first per conv in JS)
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('conversation_id, body, created_at')
      .in('conversation_id', myConvIds)
      .order('created_at', { ascending: false });
    if (!recentMessages) return matches;

    // Pick latest message per conversation
    const latestPerConv = new Map<string, { body: string; created_at: string }>();
    for (const msg of recentMessages) {
      const key = String(msg.conversation_id);
      if (!latestPerConv.has(key)) {
        latestPerConv.set(key, { body: msg.body, created_at: msg.created_at });
      }
    }

    // Step 4: Map conversations back to matches
    // For each match, find the conversation where both owner_id and candidate_id participate
    return matches.map((match) => {
      for (const [convId, participants] of convParticipants) {
        if (participants.has(match.owner_id) && participants.has(match.candidate_id)) {
          const latest = latestPerConv.get(convId);
          if (latest) {
            return {
              ...match,
              last_message_body: latest.body,
              last_message_at: latest.created_at,
            };
          }
        }
      }
      return match;
    });
  } catch (e) {
    console.error('Error enriching matches with last message:', e);
    return matches;
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

  // Enrich all matches with last message data in one batch
  const allMatches = [...projectMatches, ...candidateMatches];
  const enriched = await enrichMatchesWithLastMessage(allMatches, userId);

  // Split back into project and candidate matches
  const enrichedProject = enriched.slice(0, projectMatches.length);
  const enrichedCandidate = enriched.slice(projectMatches.length);

  return { projectMatches: enrichedProject, candidateMatches: enrichedCandidate };
}
