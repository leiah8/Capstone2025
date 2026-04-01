import {
  calcDist,
  fetchCoords,
  fetchMyCoords,
  likeCandidate,
  fetchSwipedCandidateIds,
  deleteNonMatchedCandidateLikes,
  fetchCandidates,
  fetchMyProjects,
} from '../candidates';
import {
  resetSupabaseMocks,
  mockSupabaseFrom,
  mockSupabaseFromSequence,
  mockSupabaseFunctionsInvoke,
} from './helpers/supabase-mock';

beforeEach(() => {
  resetSupabaseMocks();
});

// --- calcDist (pure math) ---

describe('calcDist', () => {
  it('returns correct distance for NY to LA (~3944 km)', () => {
    // New York: 40.7128, -74.0060 | Los Angeles: 34.0522, -118.2437
    const dist = calcDist(40.7128, -74.006, 34.0522, -118.2437);
    expect(dist).toBeCloseTo(3944, -2); // within ~100 km
  });

  it('returns 0 for same point', () => {
    expect(calcDist(40, -74, 40, -74)).toBe(0);
  });

  it('returns Infinity when lat1 is null', () => {
    expect(calcDist(null, -74, 34, -118)).toBe(Infinity);
  });

  it('returns Infinity when lng1 is null', () => {
    expect(calcDist(40, null, 34, -118)).toBe(Infinity);
  });

  it('returns Infinity when lat2 is null', () => {
    expect(calcDist(40, -74, null, -118)).toBe(Infinity);
  });

  it('returns Infinity when lng2 is null', () => {
    expect(calcDist(40, -74, 34, null)).toBe(Infinity);
  });
});

// --- fetchCoords ---

describe('fetchCoords', () => {
  it('returns coordinates when city is found', async () => {
    const chain = mockSupabaseFrom('city_locations', { data: { lat: 43.65, lng: -79.38 }, error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: { lat: 43.65, lng: -79.38 }, error: null });

    const result = await fetchCoords('Toronto');
    expect(result).toEqual({ lat: 43.65, lng: -79.38 });
  });

  it('returns {null, null} when city not found', async () => {
    const chain = mockSupabaseFrom('city_locations', { data: null, error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

    const result = await fetchCoords('Nonexistent');
    expect(result).toEqual({ lat: null, lng: null });
  });

  it('returns {null, null} when city_name is null', async () => {
    const result = await fetchCoords(null);
    expect(result).toEqual({ lat: null, lng: null });
  });

  it('throws on supabase error', async () => {
    const chain = mockSupabaseFrom('city_locations', { data: null, error: { message: 'fail' } });
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } });

    await expect(fetchCoords('Toronto')).rejects.toEqual({ message: 'fail' });
  });
});

// --- fetchMyCoords ---

describe('fetchMyCoords', () => {
  it('returns coordinates when profile has location', async () => {
    // First call: profiles → location
    // Second call: city_locations → coords
    const profileChain = mockSupabaseFrom('profiles', { data: null, error: null });
    profileChain.maybeSingle = jest.fn().mockResolvedValue({
      data: { location: 'Toronto' },
      error: null,
    });

    const cityChain = mockSupabaseFrom('city_locations', { data: null, error: null });
    cityChain.maybeSingle = jest.fn().mockResolvedValue({
      data: { lat: 43.65, lng: -79.38 },
      error: null,
    });

    const result = await fetchMyCoords('user-1');
    expect(result).toEqual({ lat: 43.65, lng: -79.38 });
  });

  it('returns {null, null} on error', async () => {
    const chain = mockSupabaseFrom('profiles', { data: null, error: null });
    chain.maybeSingle = jest.fn().mockRejectedValue(new Error('fail'));

    const result = await fetchMyCoords('user-1');
    expect(result).toEqual({ lat: null, lng: null });
  });
});

// --- likeCandidate ---

describe('likeCandidate', () => {
  it('upserts and invokes edge function on like, returns match result', async () => {
    mockSupabaseFrom('candidate_likes', { data: null, error: null });
    const matchResult = { match: true, message: 'Matched!' };
    mockSupabaseFunctionsInvoke({ data: matchResult });

    const result = await likeCandidate('user-1', 'proj-1', 'cand-1', 'like');
    expect(result).toEqual(matchResult);
  });

  it('returns null for pass reaction without invoking edge function', async () => {
    mockSupabaseFrom('candidate_likes', { data: null, error: null });

    const result = await likeCandidate('user-1', 'proj-1', 'cand-1', 'pass');
    expect(result).toBeNull();
  });

  it('throws on upsert error', async () => {
    mockSupabaseFrom('candidate_likes', { data: null, error: { message: 'upsert fail' } });

    // The upsert chain resolves with error, but likeCandidate accesses .upsert() result
    // We need the upsert to resolve with the error
    await expect(likeCandidate('user-1', 'proj-1', 'cand-1', 'like')).rejects.toEqual({
      message: 'upsert fail',
    });
  });

  it('throws on edge function error', async () => {
    mockSupabaseFrom('candidate_likes', { data: null, error: null });
    mockSupabaseFunctionsInvoke({ error: { message: 'edge fail' } });

    await expect(likeCandidate('user-1', 'proj-1', 'cand-1', 'like')).rejects.toEqual({
      message: 'edge fail',
    });
  });
});

// --- fetchSwipedCandidateIds ---

describe('fetchSwipedCandidateIds', () => {
  it('returns deduplicated candidate IDs', async () => {
    mockSupabaseFrom('candidate_likes', {
      data: [
        { candidate_id: 'c1' },
        { candidate_id: 'c2' },
        { candidate_id: 'c1' }, // duplicate
      ],
      error: null,
    });

    const result = await fetchSwipedCandidateIds('owner-1');
    expect(result).toEqual(['c1', 'c2']);
  });

  it('returns empty array on error', async () => {
    mockSupabaseFrom('candidate_likes', {
      data: null,
      error: { message: 'fail' },
    });

    const result = await fetchSwipedCandidateIds('owner-1');
    expect(result).toEqual([]);
  });
});

// --- deleteNonMatchedCandidateLikes ---

describe('deleteNonMatchedCandidateLikes', () => {
  it('deletes non-matched likes', async () => {
    const chains = mockSupabaseFromSequence('candidate_likes', [
      // First call: select likes
      {
        data: [
          { id: '1', project_id: 10, candidate_id: 'c1' },
          { id: '2', project_id: 10, candidate_id: 'c2' },
        ],
        error: null,
      },
      // Third call: delete
      { data: null, error: null },
    ]);

    mockSupabaseFrom('matches', {
      data: [{ project_id: 10, candidate_id: 'c1' }],
      error: null,
    });

    await deleteNonMatchedCandidateLikes('user-1', 10);
    // Should delete only id '2' (c2 is not matched)
    expect(chains[1].in).toHaveBeenCalled();
  });

  it('returns early when no likes exist', async () => {
    mockSupabaseFromSequence('candidate_likes', [
      { data: [], error: null },
    ]);

    await deleteNonMatchedCandidateLikes('user-1', 10);
    // Should not query matches
  });

  it('returns early when all likes are matched', async () => {
    mockSupabaseFromSequence('candidate_likes', [
      { data: [{ id: '1', project_id: 10, candidate_id: 'c1' }], error: null },
      { data: null, error: null },
    ]);

    mockSupabaseFrom('matches', {
      data: [{ project_id: 10, candidate_id: 'c1' }],
      error: null,
    });

    await deleteNonMatchedCandidateLikes('user-1', 10);
    // No deletion needed since all are matched
  });

  it('throws on likes query error', async () => {
    mockSupabaseFromSequence('candidate_likes', [
      { data: null, error: { message: 'fail' } },
    ]);

    await expect(deleteNonMatchedCandidateLikes('user-1', 10)).rejects.toEqual({
      message: 'fail',
    });
  });
});

// --- fetchCandidates ---

describe('fetchCandidates', () => {
  it('returns transformed CandidateUI array with coordinates', async () => {
    mockSupabaseFrom('profiles', {
      data: [
        {
          id: 'c1',
          name: 'Bob',
          bio: 'Dev',
          location: 'Toronto',
          skills: ['React'],
          interests: ['AI'],
          links: { github: 'https://github.com/bob', twitter: null, linkedin: null, instagram: null, portfolio: null, other: null },
          education: [{ year: '2024', degree: 'BSc', school: 'UofT' }],
          personal_projects: [],
          experience: [],
          profile_image: 'https://example.com/photo.jpg',
        },
      ],
      error: null,
    });

    mockSupabaseFrom('city_locations', {
      data: [{ name: 'Toronto', lat: 43.65, lng: -79.38 }],
      error: null,
    });

    const result = await fetchCandidates(50, 'user-1', []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c1');
    expect(result[0].name).toBe('Bob');
    expect(result[0].lat).toBe(43.65);
    expect(result[0].lng).toBe(-79.38);
    expect(result[0].skills).toEqual(['React']);
  });

  it('returns default image when profile_image is null', async () => {
    mockSupabaseFrom('profiles', {
      data: [
        {
          id: 'c1',
          name: 'Bob',
          bio: null,
          location: null,
          skills: null,
          interests: null,
          links: [],
          education: null,
          personal_projects: null,
          experience: null,
          profile_image: null,
        },
      ],
      error: null,
    });

    mockSupabaseFrom('city_locations', { data: [], error: null });

    const result = await fetchCandidates(50, undefined, []);
    expect(result[0].profile_image).toBe('https://picsum.photos/400/300?blur=2');
    expect(result[0].skills).toEqual([]);
    expect(result[0].interests).toEqual([]);
  });

  it('throws on profiles query error', async () => {
    mockSupabaseFrom('profiles', { data: null, error: { message: 'fail' } });

    await expect(fetchCandidates(50, 'user-1', [])).rejects.toEqual({ message: 'fail' });
  });
});

// --- fetchMyProjects ---

describe('fetchMyProjects', () => {
  it('returns projects on success', async () => {
    const projects = [
      {
        id: 1,
        title: 'Project A',
        description: 'Desc',
        skills_needed: ['React'],
        tags: ['web'],
        image: null,
        is_active: true,
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    mockSupabaseFrom('projects', { data: projects, error: null });

    const result = await fetchMyProjects('owner-1');
    expect(result).toEqual(projects);
  });

  it('returns empty array on error', async () => {
    mockSupabaseFrom('projects', { data: null, error: { message: 'fail' } });

    const result = await fetchMyProjects('owner-1');
    expect(result).toEqual([]);
  });
});
