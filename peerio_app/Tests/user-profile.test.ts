import { fetchUserProfile, getUserProfile, updateUserProfile, MOCK_USER_PROFILE } from '../lib/user-profile';
import {
  resetSupabaseMocks,
  mockSupabaseFrom,
  mockSupabaseAuthUser,
} from './helpers/supabase-mock';

beforeEach(() => {
  resetSupabaseMocks();
});

const fakeProfile = {
  id: 'user-1',
  name: 'Alice',
  bio: 'Developer',
  location: 'Toronto',
  skills: ['React'],
  interests: ['AI'],
  visible: true,
  created_at: '2025-01-01T00:00:00Z',
};

describe('fetchUserProfile', () => {
  it('returns profile on success', async () => {
    const chain = mockSupabaseFrom('profiles', { data: fakeProfile, error: null });
    chain.single = jest.fn().mockResolvedValue({ data: fakeProfile, error: null });

    const result = await fetchUserProfile('user-1');
    expect(result).toEqual(fakeProfile);
  });

  it('returns null on supabase error', async () => {
    const chain = mockSupabaseFrom('profiles', { data: null, error: { message: 'fail' } });
    chain.single = jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } });

    const result = await fetchUserProfile('user-1');
    expect(result).toBeNull();
  });
});

describe('getUserProfile', () => {
  it('returns DB profile when userId is provided', async () => {
    const chain = mockSupabaseFrom('profiles', { data: fakeProfile, error: null });
    chain.single = jest.fn().mockResolvedValue({ data: fakeProfile, error: null });

    const result = await getUserProfile('user-1');
    expect(result).toEqual(fakeProfile);
  });

  it('returns MOCK_USER_PROFILE when userId provided but no profile found', async () => {
    const chain = mockSupabaseFrom('profiles', { data: null, error: null });
    chain.single = jest.fn().mockResolvedValue({ data: null, error: null });

    const result = await getUserProfile('user-1');
    expect(result).toEqual(MOCK_USER_PROFILE);
  });

  it('uses auth user ID when no userId provided', async () => {
    mockSupabaseAuthUser({ id: 'auth-user-1' });
    const chain = mockSupabaseFrom('profiles', { data: fakeProfile, error: null });
    chain.single = jest.fn().mockResolvedValue({ data: fakeProfile, error: null });

    const result = await getUserProfile();
    expect(result).toEqual(fakeProfile);
  });

  it('returns MOCK_USER_PROFILE when no userId and no auth user', async () => {
    mockSupabaseAuthUser(null);

    const result = await getUserProfile();
    expect(result).toEqual(MOCK_USER_PROFILE);
  });
});

describe('updateUserProfile', () => {
  it('returns updated profile on success', async () => {
    const updated = { ...fakeProfile, name: 'Alice Updated' };
    const chain = mockSupabaseFrom('profiles', { data: updated, error: null });
    chain.single = jest.fn().mockResolvedValue({ data: updated, error: null });

    const result = await updateUserProfile('user-1', { name: 'Alice Updated' });
    expect(result).toEqual(updated);
  });

  it('returns null on error', async () => {
    const chain = mockSupabaseFrom('profiles', { data: null, error: { message: 'fail' } });
    chain.single = jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } });

    const result = await updateUserProfile('user-1', { name: 'fail' });
    expect(result).toBeNull();
  });
});
