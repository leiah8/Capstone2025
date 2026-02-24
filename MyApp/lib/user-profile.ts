/**
 * User Profile Utilities
 * Handles fetching and managing user profile data
 */

import { supabase } from './supabase';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface UserProfile {
  id: string;
  name: string;
  bio?: string;
  location?: string;
  skills: string[];
  interests: string[];
  links?: Array<{ label: string; url: string }>;
  visible: boolean;
  elo_rating?: number;
  experience_level?: ExperienceLevel;
  created_at: string;
  updated_at?: string;
}

export const MOCK_USER_PROFILE: UserProfile = {
  id: 'mock-user-id',
  name: 'Test Student',
  bio: 'Computer Science student interested in AI and web development. Looking for exciting projects to contribute to!',
  location: 'Toronto, ON',
  skills: ['Python', 'React', 'TypeScript', 'Machine Learning', 'JavaScript', 'Node.js'],
  interests: ['AI', 'Web Development', 'Gaming', 'Mobile Apps', 'Data Science'],
  visible: true,
  elo_rating: 1200,
  experience_level: 'intermediate',
  created_at: new Date().toISOString(),
};

/**
 * Fetch the current user's profile from the database
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return data as UserProfile;
  } catch (error) {
    console.error('Error in fetchUserProfile:', error);
    return null;
  }
}

/**
 * Get user profile - fetches from authenticated user or falls back to mock for testing
 */
export async function getUserProfile(userId?: string): Promise<UserProfile> {
  // If no userId provided, try to get current authenticated user
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('No authenticated user found, using mock profile for testing');
      return MOCK_USER_PROFILE;
    }
    
    userId = user.id;
  }

  const profile = await fetchUserProfile(userId);
  
  if (!profile) {
    console.log('No profile found in database for user, using mock profile for testing');
    return MOCK_USER_PROFILE;
  }

  console.log(`Loaded profile for user: ${profile.name}`);
  return profile;
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<Omit<UserProfile, 'id' | 'created_at'>>
): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      return null;
    }

    return data as UserProfile;
  } catch (error) {
    console.error('Error in updateUserProfile:', error);
    return null;
  }
}
