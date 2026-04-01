import { resolveProfileImageUrl } from '../lib/profile';
import { mockSupabaseStorage, resetSupabaseMocks } from './helpers/supabase-mock';

beforeEach(() => {
  resetSupabaseMocks();
});

describe('resolveProfileImageUrl', () => {
  it('returns absolute https URL as-is', () => {
    const url = 'https://example.com/photo.jpg';
    expect(resolveProfileImageUrl(url, 'owner1')).toBe(url);
  });

  it('returns protocol-relative URL as-is', () => {
    const url = '//example.com/photo.jpg';
    expect(resolveProfileImageUrl(url, 'owner1')).toBe(url);
  });

  it('resolves relative storage path via supabase storage', () => {
    mockSupabaseStorage('https://storage.example.com/profiles/avatars/abc.png');
    const result = resolveProfileImageUrl('avatars/abc.png', 'owner1', 'profiles');
    expect(result).toBe('https://storage.example.com/profiles/avatars/abc.png');
  });

  it('strips leading slashes from storage path', () => {
    mockSupabaseStorage('https://storage.example.com/photo.png');
    const result = resolveProfileImageUrl('/avatars/abc.png', 'owner1');
    expect(result).toBe('https://storage.example.com/photo.png');
  });

  it('strips bucket prefix from path', () => {
    mockSupabaseStorage('https://storage.example.com/photo.png');
    const result = resolveProfileImageUrl('profiles/avatars/abc.png', 'owner1', 'profiles');
    expect(result).toBe('https://storage.example.com/photo.png');
  });

  it('returns pravatar fallback when input is null', () => {
    const result = resolveProfileImageUrl(null, 'owner1');
    expect(result).toBe('https://i.pravatar.cc/150?u=owner1');
  });

  it('returns pravatar fallback when input is empty string', () => {
    const result = resolveProfileImageUrl('', 'owner1');
    expect(result).toBe('https://i.pravatar.cc/150?u=owner1');
  });

  it('encodes special characters in ownerId for fallback URL', () => {
    const result = resolveProfileImageUrl(null, 'user@test.com');
    expect(result).toBe('https://i.pravatar.cc/150?u=user%40test.com');
  });
});
