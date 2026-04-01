import {
  fetchProjectMatchesOptimized,
  fetchCandidateMatchesOptimized,
  fetchAllMatchesOptimized,
} from '../match-queries';
import {
  resetSupabaseMocks,
  mockSupabaseFrom,
  mockSupabaseFromSequence,
} from './helpers/supabase-mock';

beforeEach(() => {
  resetSupabaseMocks();
});

const makeMatchRow = (id: number) => ({
  id,
  owner_id: 'owner-1',
  candidate_id: 'cand-1',
  project_id: 'proj-1',
  created_at: '2025-01-01T00:00:00Z',
  projects: { id: 1, title: 'Project A', image: 'proj.jpg' },
  owner_profile: { id: 'owner-1', name: 'Owner', profile_image: 'owner.jpg' },
  candidate_profile: { id: 'cand-1', name: 'Candidate', profile_image: 'cand.jpg' },
});

describe('fetchProjectMatchesOptimized', () => {
  it('returns MatchUI array from JOIN query', async () => {
    mockSupabaseFrom('matches', {
      data: [makeMatchRow(1)],
      error: null,
    });

    const result = await fetchProjectMatchesOptimized('cand-1');
    expect(result).toHaveLength(1);
    expect(result[0].match_id).toBe(1);
    expect(result[0].project_name).toBe('Project A');
    expect(result[0].owner_name).toBe('Owner');
    expect(result[0].candidate_name).toBe('Candidate');
  });

  it('returns empty array on PGRST116 error', async () => {
    mockSupabaseFrom('matches', {
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });

    const result = await fetchProjectMatchesOptimized('cand-1');
    expect(result).toEqual([]);
  });

  it('returns empty array on other errors', async () => {
    mockSupabaseFrom('matches', {
      data: null,
      error: { code: 'OTHER', message: 'fail' },
    });

    const result = await fetchProjectMatchesOptimized('cand-1');
    expect(result).toEqual([]);
  });

  it('returns empty array when data is null', async () => {
    mockSupabaseFrom('matches', { data: null, error: null });

    const result = await fetchProjectMatchesOptimized('cand-1');
    expect(result).toEqual([]);
  });

  it('uses fallback "0" when nested profile data is null', async () => {
    mockSupabaseFrom('matches', {
      data: [
        {
          id: 1,
          owner_id: 'owner-1',
          candidate_id: 'cand-1',
          project_id: 'proj-1',
          created_at: '2025-01-01T00:00:00Z',
          projects: null,
          owner_profile: null,
          candidate_profile: null,
        },
      ],
      error: null,
    });

    const result = await fetchProjectMatchesOptimized('cand-1');
    expect(result[0].project_name).toBe('0');
    expect(result[0].owner_name).toBe('0');
    expect(result[0].candidate_name).toBe('0');
  });
});

describe('fetchCandidateMatchesOptimized', () => {
  it('returns MatchUI array for owner matches', async () => {
    mockSupabaseFrom('matches', {
      data: [makeMatchRow(2)],
      error: null,
    });

    const result = await fetchCandidateMatchesOptimized('owner-1');
    expect(result).toHaveLength(1);
    expect(result[0].match_id).toBe(2);
  });

  it('returns empty array on error', async () => {
    mockSupabaseFrom('matches', {
      data: null,
      error: { code: 'FAIL', message: 'fail' },
    });

    const result = await fetchCandidateMatchesOptimized('owner-1');
    expect(result).toEqual([]);
  });
});

describe('fetchAllMatchesOptimized', () => {
  it('returns both project and candidate matches', async () => {
    // Both fetchProjectMatches and fetchCandidateMatches call supabase.from('matches')
    // They run in parallel via Promise.all, so our mock returns the same data for both
    mockSupabaseFrom('matches', {
      data: [makeMatchRow(1)],
      error: null,
    });

    // Mock conversation_participants for enrichment — return empty to skip enrichment
    mockSupabaseFrom('conversation_participants', { data: [], error: null });

    const result = await fetchAllMatchesOptimized('cand-1');
    expect(result.projectMatches).toBeDefined();
    expect(result.candidateMatches).toBeDefined();
  });

  it('returns empty arrays when no matches', async () => {
    mockSupabaseFrom('matches', { data: [], error: null });
    mockSupabaseFrom('conversation_participants', { data: [], error: null });

    const result = await fetchAllMatchesOptimized('user-1');
    expect(result.projectMatches).toEqual([]);
    expect(result.candidateMatches).toEqual([]);
  });
});
