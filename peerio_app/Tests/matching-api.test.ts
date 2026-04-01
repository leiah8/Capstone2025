import { mockSupabaseAuthSession, resetSupabaseMocks } from './helpers/supabase-mock';

// Set env before module import
process.env.EXPO_PUBLIC_MATCHING_API_URL = 'http://test-api';

import {
  getMatchedProjects,
  getMatchedCandidates,
  checkMatchingAPIHealth,
  getBatchMatchedProjects,
} from '../lib/matching-api';

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
  resetSupabaseMocks();
  mockFetch.mockReset();
  mockSupabaseAuthSession({ access_token: 'test-token' });
});

// --- getMatchedProjects ---

describe('getMatchedProjects', () => {
  const userProfile = { skills: ['React'], interests: ['AI'], bio: 'A developer' };
  const projects = [
    { id: '1', name: 'Project A', description: 'desc', skillsNeeded: ['React'], interests: ['AI'] },
  ];

  it('returns empty array when projects is empty', async () => {
    const result = await getMatchedProjects(userProfile, [], []);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('makes POST to /match/score and transforms response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ranked_projects: [
          {
            project_id: '1',
            project_name: 'Project A',
            overall_score: 0.9,
            semantic_similarity: 0.8,
            skill_match: 0.7,
            interest_match: 0.6,
            matched_skills: ['React'],
            missing_skills: [],
            matched_interests: ['AI'],
          },
        ],
      }),
    });

    const result = await getMatchedProjects(userProfile, projects);
    expect(result).toHaveLength(1);
    expect(result[0].project_id).toBe('1');
    expect(result[0].overall_score).toBe(0.9);
    // URL is resolved at module load time; just verify the endpoint path and method
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/match/score'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('handles fallback field names (total_score, breakdown)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ranked_projects: [
          {
            project_id: '1',
            total_score: 0.85,
            breakdown: { semantic_similarity: 0.7, skill_match: 0.5, interest_alignment: 0.4 },
            explanation: { matched_skills: ['JS'], missing_skills: ['Go'], matched_interests: ['Web'] },
          },
        ],
      }),
    });

    const result = await getMatchedProjects(userProfile, projects);
    expect(result[0].overall_score).toBe(0.85);
    expect(result[0].semantic_similarity).toBe(0.7);
    expect(result[0].interest_match).toBe(0.4);
    expect(result[0].matched_skills).toEqual(['JS']);
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(getMatchedProjects(userProfile, projects)).rejects.toThrow(
      'Matching API error: 500',
    );
  });

  it('constructs bio proxy from skills+interests when bio is empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ranked_projects: [] }),
    });

    await getMatchedProjects({ skills: ['React'], interests: ['AI'], bio: '' }, projects);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.user_profile.bio).toContain('Skills: React');
    expect(body.user_profile.bio).toContain('Interests: AI');
  });

  it('includes Authorization header when session exists', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ranked_projects: [] }),
    });

    await getMatchedProjects(userProfile, projects);
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer test-token');
  });
});

// --- getMatchedCandidates ---

describe('getMatchedCandidates', () => {
  const project = {
    id: 1,
    title: 'Proj',
    description: 'desc',
    skills_needed: ['React'],
    tags: ['web'],
    image: null,
    is_active: true,
    created_at: '2025-01-01',
  };
  const candidates = [
    {
      id: 'c1',
      name: 'Bob',
      location: 'Toronto',
      bio: 'dev',
      skills: ['React'],
      interests: ['AI'],
      education: [],
      personal_projects: [],
      experience: [],
    },
  ];

  it('returns empty array when candidates is empty', async () => {
    const result = await getMatchedCandidates(project, [], []);
    expect(result).toEqual([]);
  });

  it('makes POST and transforms response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ranked_candidates: [
          {
            candidate_id: 'c1',
            candidate_name: 'Bob',
            overall_score: 0.8,
            semantic_similarity: 0.7,
            skill_match: 0.6,
            interest_match: 0.5,
            matched_skills: ['React'],
            missing_skills: [],
            matched_interests: ['AI'],
          },
        ],
      }),
    });

    const result = await getMatchedCandidates(project, candidates);
    expect(result).toHaveLength(1);
    expect(result[0].candidate_id).toBe('c1');
    expect(result[0].project_id).toBe(1); // Uses the project's id
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    await expect(getMatchedCandidates(project, candidates)).rejects.toThrow(
      'Matching API error: 400',
    );
  });
});

// --- checkMatchingAPIHealth ---

describe('checkMatchingAPIHealth', () => {
  it('returns true when API is healthy', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    expect(await checkMatchingAPIHealth()).toBe(true);
  });

  it('returns false when response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    expect(await checkMatchingAPIHealth()).toBe(false);
  });

  it('returns false when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    expect(await checkMatchingAPIHealth()).toBe(false);
  });
});

// --- getBatchMatchedProjects ---

describe('getBatchMatchedProjects', () => {
  it('makes POST to /match/batch and transforms response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            user_id: 'u1',
            ranked_projects: [
              {
                project_id: '1',
                project_name: 'P1',
                overall_score: 0.9,
                semantic_similarity: 0.8,
                skill_match: 0.7,
                interest_match: 0.6,
                matched_skills: ['React'],
                missing_skills: [],
                matched_interests: ['AI'],
              },
            ],
            count: 1,
          },
        ],
        total_profiles: 1,
        total_projects: 1,
        processing_time_seconds: 0.5,
      }),
    });

    const result = await getBatchMatchedProjects(
      [{ id: 'u1', skills: ['React'], interests: ['AI'] }],
      [{ id: '1', name: 'P1', description: 'desc' }],
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0].ranked_projects[0].project_id).toBe('1');
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'error',
    });

    await expect(
      getBatchMatchedProjects(
        [{ id: 'u1', skills: [], interests: [] }],
        [{ id: '1', name: 'P', description: 'd' }],
      ),
    ).rejects.toThrow('Batch matching API error: 500');
  });
});
