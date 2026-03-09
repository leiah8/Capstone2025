import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

type NotificationContextType = {
  matchCount: number;
  sessionLastSeen: string | null;
  seenMatchIds: Set<string>;
  markMatchSeen: (id: string) => void;
  clearMatchCount: () => void;
};

const NotificationContext = createContext<NotificationContextType>({
  matchCount: 0,
  sessionLastSeen: null,
  seenMatchIds: new Set(),
  markMatchSeen: () => {},
  clearMatchCount: () => {},
});

const LAST_SEEN_KEY = 'notifications_last_seen';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [matchCount, setMatchCount] = useState(0);
  const [sessionLastSeen, setSessionLastSeen] = useState<string | null>(null);
  const [seenMatchIds, setSeenMatchIds] = useState<Set<string>>(new Set());
  // Keep conversation IDs in a ref so realtime callbacks always see the latest set
  const myConversationIds = useRef<Set<string | number>>(new Set());

  useEffect(() => {
    if (!session?.user?.id) return;

    const userId = session.user.id;

    (async () => {
      // 1. Load last-seen timestamp; default to now if first launch.
      //    Use the stored value as the stable baseline for this session,
      //    then immediately advance storage to now so the next session
      //    only shows matches/messages created after this moment.
      const stored = await AsyncStorage.getItem(LAST_SEEN_KEY);
      const baseline = stored ?? new Date().toISOString();
      await AsyncStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
      setSessionLastSeen(baseline);

      // 2. Fetch conversations the user participates in
      const { data: participantRows } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId);
      const convIds = (participantRows ?? []).map((r) => r.conversation_id);
      myConversationIds.current = new Set(convIds);

      // 3. Count missed matches while app was closed
      const { count: ownerCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', userId)
        .gt('created_at', baseline);

      const { count: candidateCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('candidate_id', userId)
        .gt('created_at', baseline);

      // 4. Count missed messages while app was closed (not sent by self)
      let missedMessages = 0;
      if (convIds.length > 0) {
        const { count: msgCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .neq('sender_id', userId)
          .gt('created_at', baseline);
        missedMessages = msgCount ?? 0;
      }

      const total = (ownerCount ?? 0) + (candidateCount ?? 0) + missedMessages;
      if (total > 0) setMatchCount(total);

      // 5. Subscribe to new matches and messages going forward
      const channel = supabase
        .channel(`notifications-${userId}`)
        // New match as owner
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `owner_id=eq.${userId}` },
          () => setMatchCount((c) => c + 1))
        // New match as candidate
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `candidate_id=eq.${userId}` },
          () => setMatchCount((c) => c + 1))
        // New conversation participant row (added to a new conversation)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` },
          (payload) => {
            myConversationIds.current.add(payload.new.conversation_id);
          })
        // New message — filter client-side
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const msg = payload.new;
            if (
              msg.sender_id !== userId &&
              myConversationIds.current.has(msg.conversation_id)
            ) {
              setMatchCount((c) => c + 1);
            }
          })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    })();
  }, [session?.user?.id]);

  const clearMatchCount = () => {
    setMatchCount(0);
  };

  const markMatchSeen = (id: string) => {
    setSeenMatchIds((prev) => {
      if (prev.has(id)) return prev; // already seen, no change
      setMatchCount((c) => Math.max(0, c - 1));
      return new Set(prev).add(id);
    });
  };

  return (
    <NotificationContext.Provider value={{ matchCount, sessionLastSeen, seenMatchIds, markMatchSeen, clearMatchCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
