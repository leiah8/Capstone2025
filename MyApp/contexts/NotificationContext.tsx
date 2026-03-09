import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// matchNotifs: matchId → unread count (new match + unread messages combined)
// matchCount: sum of all values → drives the bottom-bar badge
type NotificationContextType = {
  matchCount: number;
  matchNotifs: Map<string, number>;
  markMatchSeen: (matchId: string) => void;
  setActiveMatchId: (matchId: string | null) => void;
};

const NotificationContext = createContext<NotificationContextType>({
  matchCount: 0,
  matchNotifs: new Map(),
  markMatchSeen: () => {},
  setActiveMatchId: () => {},
});

// Global baseline: when the app was last open (for counting new matches)
const LAST_SEEN_KEY = 'notifications_last_seen';
// Per-match read time: notifications_match_seen_<matchId>
const matchSeenKey = (matchId: string) => `notifications_match_seen_${matchId}`;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [matchCount, setMatchCount] = useState(0);
  const [matchNotifs, setMatchNotifs] = useState<Map<string, number>>(new Map());

  // Refs so realtime callbacks always see up-to-date mappings without stale closures
  const conversationToMatch = useRef<Map<string | number, string>>(new Map());
  const projectIdToMatch = useRef<Map<string, string>>(new Map());
  const activeMatchId = useRef<string | null>(null);

  // Apply a functional update and keep matchCount in sync atomically
  const applyUpdate = (updater: (prev: Map<string, number>) => Map<string, number>) => {
    setMatchNotifs((prev) => {
      const next = updater(prev);
      setMatchCount(Array.from(next.values()).reduce((a, b) => a + b, 0));
      return next;
    });
  };

  const incrementMatch = (matchId: string, by = 1) => {
    // Skip silently if the user is currently viewing this chat
    if (activeMatchId.current === matchId) return;
    applyUpdate((prev) => {
      const next = new Map(prev);
      next.set(matchId, (next.get(matchId) ?? 0) + by);
      return next;
    });
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    // Store channel ref so cleanup works even though setup is async
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // ── 1. Global baseline (used for new match detection) ─────────────────
      const stored = await AsyncStorage.getItem(LAST_SEEN_KEY);
      const baseline = stored ?? new Date().toISOString();
      // Advance so the next launch only counts events after right now
      await AsyncStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());

      // ── 2. Load all of the user's matches ─────────────────────────────────
      const [{ data: ownerMatches }, { data: candidateMatches }] = await Promise.all([
        supabase.from('matches').select('id, project_id, created_at').eq('owner_id', userId),
        supabase.from('matches').select('id, project_id, created_at').eq('candidate_id', userId),
      ]);
      const allMatches = [...(ownerMatches ?? []), ...(candidateMatches ?? [])];

      for (const m of allMatches) {
        projectIdToMatch.current.set(String(m.project_id), String(m.id));
      }

      // ── 3. Load per-match last-read timestamps from AsyncStorage ──────────
      const matchIds = allMatches.map((m) => String(m.id));
      const matchSeenEntries = await AsyncStorage.multiGet(matchIds.map(matchSeenKey));
      // matchSeen: matchId → last time user read that chat (or null)
      const matchSeen = new Map<string, string>();
      for (const [key, value] of matchSeenEntries) {
        if (value) {
          const matchId = key.replace('notifications_match_seen_', '');
          matchSeen.set(matchId, value);
        }
      }

      // ── 4. New matches since baseline → +1 per match ──────────────────────
      const notifsInit = new Map<string, number>();
      for (const m of allMatches) {
        const mid = String(m.id);
        // A match is "new" if it was created after the global baseline AND
        // the user has never opened that chat (no per-match seen timestamp)
        if (m.created_at > baseline && !matchSeen.has(mid)) {
          notifsInit.set(mid, (notifsInit.get(mid) ?? 0) + 1);
        }
      }

      // ── 5. Load user's conversations ──────────────────────────────────────
      const { data: participantRows } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId);
      const convIds = (participantRows ?? []).map((r) => r.conversation_id);

      // ── 6. Build conversationId → matchId via conversations.project_id ────
      if (convIds.length > 0) {
        const { data: convRows } = await supabase
          .from('conversations')
          .select('id, project_id')
          .in('id', convIds);
        for (const conv of convRows ?? []) {
          const matchId = projectIdToMatch.current.get(String(conv.project_id));
          if (matchId) conversationToMatch.current.set(conv.id, matchId);
        }
      }

      // ── 7. Missed messages — use per-match threshold where available ───────
      // Fetch all messages since the oldest threshold (one query), then
      // filter each message against the correct per-match read time.
      if (convIds.length > 0) {
        const { data: missedMsgs } = await supabase
          .from('messages')
          .select('conversation_id, created_at')
          .in('conversation_id', convIds)
          .neq('sender_id', userId)
          .gt('created_at', baseline);           // outer bound: global baseline

        for (const msg of missedMsgs ?? []) {
          const matchId = conversationToMatch.current.get(msg.conversation_id);
          if (!matchId) continue;
          // Per-match threshold: if the user has read this chat before, use that
          // timestamp; otherwise fall back to the global baseline.
          const threshold = matchSeen.get(matchId) ?? baseline;
          if (msg.created_at > threshold) {
            notifsInit.set(matchId, (notifsInit.get(matchId) ?? 0) + 1);
          }
        }
      }

      // Commit initial state
      const total = Array.from(notifsInit.values()).reduce((a, b) => a + b, 0);
      setMatchNotifs(new Map(notifsInit));
      setMatchCount(total);

      // ── 7. Realtime subscriptions ─────────────────────────────────────────
      const channel = supabase
        .channel(`notifications-${userId}`)
        // New match where I am the owner
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `owner_id=eq.${userId}` },
          (payload) => {
            const matchId = String(payload.new.id);
            projectIdToMatch.current.set(String(payload.new.project_id), matchId);
            incrementMatch(matchId);
          })
        // New match where I am the candidate
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches', filter: `candidate_id=eq.${userId}` },
          (payload) => {
            const matchId = String(payload.new.id);
            projectIdToMatch.current.set(String(payload.new.project_id), matchId);
            incrementMatch(matchId);
          })
        // Added to a new conversation — wire up conversationToMatch
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` },
          async (payload) => {
            const convId = payload.new.conversation_id;
            const { data: convData } = await supabase
              .from('conversations')
              .select('project_id')
              .eq('id', convId)
              .single();
            if (convData) {
              const matchId = projectIdToMatch.current.get(String(convData.project_id));
              if (matchId) conversationToMatch.current.set(convId, matchId);
            }
          })
        // New message — look up which match it belongs to
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const msg = payload.new;
            if (msg.sender_id === userId) return;
            const matchId = conversationToMatch.current.get(msg.conversation_id);
            if (matchId) incrementMatch(matchId);
          })
        .subscribe();

      channelRef = channel;
    })();

    return () => {
      if (channelRef) supabase.removeChannel(channelRef);
    };
  }, [session?.user?.id]);

  // Zero out a specific match's count and persist the read timestamp
  const markMatchSeen = (matchId: string) => {
    const now = new Date().toISOString();
    // Persist so the next session knows this chat was read at this time
    AsyncStorage.setItem(matchSeenKey(matchId), now);
    applyUpdate((prev) => {
      if (!prev.has(matchId) || prev.get(matchId) === 0) return prev;
      const next = new Map(prev);
      next.set(matchId, 0);
      return next;
    });
  };

  const setActiveMatchId = (matchId: string | null) => {
    activeMatchId.current = matchId;
    // Also clear any count that may have snuck in before this was set
    if (matchId) markMatchSeen(matchId);
  };

  return (
    <NotificationContext.Provider value={{ matchCount, matchNotifs, markMatchSeen, setActiveMatchId }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
