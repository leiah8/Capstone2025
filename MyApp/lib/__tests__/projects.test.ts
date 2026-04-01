import {
  likeProject,
  fetchCoords,
  fetchSwipedProjectIds,
  deleteNonMatchedProjectLikes,
  fetchProjects,
} from '../projects';
import {
  resetSupabaseMocks,
  mockSupabaseFrom,
  mockSupabaseFromSequence,
  mockSupabaseFunctionsInvoke,
  mockSupabaseStorage,
} from './helpers/supabase-mock';

beforeEach(() => {
  resetSupabaseMocks();
});

// --- likeProject ---

describe('likeProject', () => {
  it('upserts and invokes edge function on like, returns match result', async () => {
    mockSupabaseFrom('project_likes', { data: null, error: null });
    const matchResult = { match: true, message: 'Matched!' };
    mockSupabaseFunctionsInvoke({ data: matchResult });

    const result = await likeProject('user-1', 'owner-1', '10', 'like');
    expect(result).toEqual(matchResult);
  });

  it('returns null for pass reaction', async () => {
    mockSupabaseFrom('project_likes', { data: null, error: null });

    const result = await likeProject('user-1', 'owner-1', '10', 'pass');
    expect(result).toBeNull();
  });

  it('throws on upsert error', async () => {
    mockSupabaseFrom('project_likes', { data: null, error: { message: 'fail' } });

    await expect(likeProject('user-1', 'owner-1', '10', 'like')).rejects.toEqual({
      message: 'fail',
    });
  });

  it('throws on edge function error', async () => {
    mockSupabaseFrom('project_likes', { data: null, error: null });
    mockSupabaseFunctionsInvoke({ error: { message: 'edge fail' } });

    await expect(likeProject('user-1', 'owner-1', '10', 'like')).rejects.toEqual({
      message: 'edge fail',
    });
  });
});

// --- fetchCoords ---

describe('fetchCoords', () => {
  it('returns coordinates via profiles then city_locations', async () => {
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

    const result = await fetchCoords('owner-1');
    expect(result).toEqual({ lat: 43.65, lng: -79.38 });
  });

  it('returns {null, null} when profile location is null', async () => {
    const chain = mockSupabaseFrom('profiles', { data: null, error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue({
      data: { location: null },
      error: null,
    });

    const result = await fetchCoords('owner-1');
    expect(result).toEqual({ lat: null, lng: null });
  });

  it('returns {null, null} on error', async () => {
    const chain = mockSupabaseFrom('profiles', { data: null, error: null });
    chain.maybeSingle = jest.fn().mockRejectedValue(new Error('fail'));

    const result = await fetchCoords('owner-1');
    expect(result).toEqual({ lat: null, lng: null });
  });
});

// --- fetchSwipedProjectIds ---

describe('fetchSwipedProjectIds', () => {
  it('returns string array of project IDs', async () => {
    mockSupabaseFrom('project_likes', {
      data: [{ project_id: 1 }, { project_id: 2 }, { project_id: 1 }],
      error: null,
    });

    const result = await fetchSwipedProjectIds('user-1');
    expect(result).toEqual(['1', '2']);
  });

  it('returns empty array on error', async () => {
    mockSupabaseFrom('project_likes', { data: null, error: { message: 'fail' } });

    const result = await fetchSwipedProjectIds('user-1');
    expect(result).toEqual([]);
  });
});

// --- deleteNonMatchedProjectLikes ---

describe('deleteNonMatchedProjectLikes', () => {
  it('deletes non-matched project likes', async () => {
    mockSupabaseFrom('matches', {
      data: [{ project_id: 10 }],
      error: null,
    });

    const chain = mockSupabaseFrom('project_likes', { data: null, error: null });

    await deleteNonMatchedProjectLikes('user-1');
    // Should call delete().eq().not() to exclude matched project IDs
    expect(chain.delete).toHaveBeenCalled();
  });

  it('deletes all likes when no matches exist', async () => {
    mockSupabaseFrom('matches', { data: [], error: null });
    const chain = mockSupabaseFrom('project_likes', { data: null, error: null });

    await deleteNonMatchedProjectLikes('user-1');
    expect(chain.delete).toHaveBeenCalled();
  });

  it('throws on matches query error', async () => {
    mockSupabaseFrom('matches', { data: null, error: { message: 'fail' } });

    await expect(deleteNonMatchedProjectLikes('user-1')).rejects.toEqual({
      message: 'fail',
    });
  });

  it('throws on delete error', async () => {
    mockSupabaseFrom('matches', { data: [], error: null });
    mockSupabaseFrom('project_likes', { data: null, error: { message: 'delete fail' } });

    await expect(deleteNonMatchedProjectLikes('user-1')).rejects.toEqual({
      message: 'delete fail',
    });
  });
});

// --- fetchProjects ---

describe('fetchProjects', () => {
  it('returns ProjectUI array with JOINed profile and city coords', async () => {
    mockSupabaseStorage('https://storage.example.com/avatar.jpg');
    mockSupabaseFrom('projects', {
      data: [
        {
          id: 1,
          owner_id: 'owner-1',
          title: 'Cool Project',
          description: 'A cool project',
          image: 'https://example.com/proj.jpg',
          is_active: true,
          created_at: '2025-01-01',
          skills_needed: ['React', 'Node'],
          tags: ['web'],
          profiles: { location: 'Toronto', profile_image: 'avatar.jpg' },
        },
      ],
      error: null,
    });

    mockSupabaseFrom('city_locations', {
      data: [{ name: 'Toronto', lat: 43.65, lng: -79.38 }],
      error: null,
    });

    const result = await fetchProjects(50);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Cool Project');
    expect(result[0].location).toBe('Toronto');
    expect(result[0].lat).toBe(43.65);
    expect(result[0].skillsNeeded).toEqual(['React', 'Node']);
    expect(result[0].interests).toEqual(['web']);
  });

  it('handles null profile location with dash fallback', async () => {
    mockSupabaseStorage('https://storage.example.com/avatar.jpg');
    mockSupabaseFrom('projects', {
      data: [
        {
          id: 1,
          owner_id: 'owner-1',
          title: 'No Location',
          description: 'desc',
          image: null,
          is_active: true,
          created_at: '2025-01-01',
          skills_needed: null,
          tags: null,
          profiles: { location: null, profile_image: null },
        },
      ],
      error: null,
    });
    mockSupabaseFrom('city_locations', { data: [], error: null });

    const result = await fetchProjects(50);
    expect(result[0].location).toBe('\u2014'); // em dash
    expect(result[0].image).toBe('https://picsum.photos/400/300?blur=2');
    expect(result[0].skillsNeeded).toEqual([]);
  });

  it('handles profiles as array (join inference variant)', async () => {
    mockSupabaseStorage('https://storage.example.com/avatar.jpg');
    mockSupabaseFrom('projects', {
      data: [
        {
          id: 1,
          owner_id: 'owner-1',
          title: 'Array Profile',
          description: 'desc',
          image: null,
          is_active: true,
          created_at: '2025-01-01',
          skills_needed: [],
          tags: [],
          profiles: [{ location: 'Vancouver', profile_image: null }],
        },
      ],
      error: null,
    });

    mockSupabaseFrom('city_locations', {
      data: [{ name: 'Vancouver', lat: 49.28, lng: -123.12 }],
      error: null,
    });

    const result = await fetchProjects(50);
    expect(result[0].location).toBe('Vancouver');
  });

  it('throws on query error', async () => {
    mockSupabaseFrom('projects', { data: null, error: { message: 'fail' } });

    await expect(fetchProjects(50)).rejects.toEqual({ message: 'fail' });
  });
});
