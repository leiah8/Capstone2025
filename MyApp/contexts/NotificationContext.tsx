import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

type NotificationContextType = {
  matchCount: number;
  clearMatchCount: () => void;
};

const NotificationContext = createContext<NotificationContextType>({
  matchCount: 0,
  clearMatchCount: () => {},
});

const LAST_SEEN_KEY = 'notifications_last_seen';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [matchCount, setMatchCount] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;

    const userId = session.user.id;

    (async () => {
      // 1. Load last-seen timestamp; default to now if first launch
      const stored = await AsyncStorage.getItem(LAST_SEEN_KEY);
      const lastSeen = stored ?? new Date().toISOString();
      if (!stored) await AsyncStorage.setItem(LAST_SEEN_KEY, lastSeen);

      // 2. Count matches created while the app was closed
      const { count: ownerCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .gt('created_at', lastSeen);

      const { count: candidateCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('candidate_id', userId)
        .gt('created_at', lastSeen);

      const missed = (ownerCount ?? 0) + (candidateCount ?? 0);
      if (missed > 0) setMatchCount(missed);

      // 3. Subscribe to new matches going forward
      const channel = supabase
        .channel(`new-matches-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `owner_id=eq.${userId}` },
          () => setMatchCount((c) => c + 1))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `candidate_id=eq.${userId}` },
          () => setMatchCount((c) => c + 1))
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    })();
  }, [session?.user?.id]);

  const clearMatchCount = async () => {
    setMatchCount(0);
    // Mark now as the new last-seen so missed matches reset
    await AsyncStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
  };

  return (
    <NotificationContext.Provider value={{ matchCount, clearMatchCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
