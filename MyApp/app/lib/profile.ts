// lib/profile.ts
import { supabase } from './supabase';

const isAbsoluteUrl = (s?: string | null) => !!s && /^(https?:)?\/\//i.test(s);

/**
 * Accepts either:
 *  - full URL (https://... or //...) → returns as-is
 *  - storage path ("avatars/abc.png" or "/avatars/abc.png") → returns public URL
 *  - null/empty → returns fallback
 */
export function resolveProfileImageUrl(
  input: string | null,
  ownerId: string,
  bucket = 'avatars' // <-- set to your bucket name
): string {
  if (isAbsoluteUrl(input)) return input as string;

  if (input) {
    const path = input.replace(/^\/+/, ''); // strip leading slash
    // If your DB stores the full "avatars/..." path, keep it. If it stores just "abc.png",
    // either pass bucket here or prepend `${bucket}/` where you write the path.
    const key = path.startsWith(`${bucket}/`) ? path.split(`${bucket}/`)[1] : path;

    const { data } = supabase.storage.from(bucket).getPublicUrl(key);
    if (data?.publicUrl) return data.publicUrl;
  }

  return `https://i.pravatar.cc/150?u=${encodeURIComponent(ownerId)}`;
}

export type PersonUI = {
    id: string;
    name: string;
    image: string;
};