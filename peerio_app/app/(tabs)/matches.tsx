// import { Platform, StyleSheet } from 'react-native';

import { Ionicons } from "@expo/vector-icons";
import { MatchUI } from "../../lib/match";
import { fetchAllMatchesOptimized } from "../../lib/match-queries";
import { formatRelativeDate } from "../../lib/format-time";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

import { router, useFocusEffect } from "expo-router";
import { useNotifications } from "../../contexts/NotificationContext";

import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const MATCHES_TRACK_PADDING = 6;
const MATCHES_TABS = [
  { key: "projects", label: "Projects", icon: "briefcase-outline" },
  { key: "candidates", label: "Candidates", icon: "people-outline" },
] as const;

const SORT_OPTIONS = [
  { key: 'latest_message', label: 'Latest Message' },
  { key: 'earliest_message', label: 'Earliest Message' },
  { key: 'newest_match', label: 'Newest Match' },
  { key: 'oldest_match', label: 'Oldest Match' },
  { key: 'alpha_asc', label: 'A → Z' },
  { key: 'alpha_desc', label: 'Z → A' },
] as const;

export default function MatchesPage() {
  const { session } = useAuth();
  const { matchNotifs, newMatchIds } = useNotifications();

  /* State */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [projectMatchesUI, setProjectMatchesUI] = useState<MatchUI[]>([]);
  const [candidateMatchesUI, setCandidateMatchesUI] = useState<MatchUI[]>([]);

  const [projectsPage, setPageRaw] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [showProjectFilter, setShowProjectFilter] = useState(false);
  const [sortBy, setSortBy] = useState<string>('latest_message');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [headerTrackWidth, setHeaderTrackWidth] = useState(0);
  const headerIndicatorX = useRef(new Animated.Value(0)).current;

  // Tracks whether this is the very first load so we can show the full
  // loading spinner only once; subsequent focus-refreshes use `refreshing`.
  const hasLoadedOnce = useRef(false);

  const projectNewCount = projectMatchesUI.reduce(
    (sum, m) => sum + (matchNotifs.get(String(m.match_id)) ?? 0),
    0,
  );
  const candidateNewCount = candidateMatchesUI.reduce(
    (sum, m) => sum + (matchNotifs.get(String(m.match_id)) ?? 0),
    0,
  );
  const activeTabKey = projectsPage ? "projects" : "candidates";
  const activeHeaderIndex = projectsPage ? 0 : 1;
  const headerSegmentWidth =
    headerTrackWidth > 0
      ? Math.max(
          (headerTrackWidth - MATCHES_TRACK_PADDING * 2) / MATCHES_TABS.length,
          0,
        )
      : 0;

  const setPage = (val: boolean) => {
    setPageRaw(val);
    setSelectedProject('all');
    setShowProjectFilter(false);
    setSortBy('latest_message');
    setShowSortMenu(false);
  };

  const activeMatches = projectsPage ? projectMatchesUI : candidateMatchesUI;

  const uniqueProjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of activeMatches) {
      if (m.project_id && m.project_name) seen.set(m.project_id, m.project_name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [activeMatches]);

  const filteredMatches = selectedProject === 'all'
    ? activeMatches
    : activeMatches.filter(m => m.project_id === selectedProject);

  const sortedMatches = useMemo(() => {
    const sorted = [...filteredMatches];
    switch (sortBy) {
      case 'latest_message':
        return sorted.sort((a, b) => {
          const aTime = a.last_message_at ?? a.created_at;
          const bTime = b.last_message_at ?? b.created_at;
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        });
      case 'earliest_message':
        return sorted.sort((a, b) => {
          const aTime = a.last_message_at ?? a.created_at;
          const bTime = b.last_message_at ?? b.created_at;
          return new Date(aTime).getTime() - new Date(bTime).getTime();
        });
      case 'newest_match':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'oldest_match':
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'alpha_asc':
        return sorted.sort((a, b) => (a.candidate_name ?? '').localeCompare(b.candidate_name ?? ''));
      case 'alpha_desc':
        return sorted.sort((a, b) => (b.candidate_name ?? '').localeCompare(a.candidate_name ?? ''));
      default:
        return sorted;
    }
  }, [filteredMatches, sortBy]);

  const gotoMatch = (pid: string | number) => {
    router.push(`/match/${pid}`);
  };

  // ---------------------------------------------------------------------------
  // loadMatches — single source of truth for fetching match data.
  //
  // `isInitial`: true on first mount and when newMatchIds changes (full spinner).
  //              false on every focus-refresh (silent background update).
  //
  // Returns a cleanup flag pattern so callers can cancel stale updates.
  // ---------------------------------------------------------------------------
  const loadMatches = useCallback(
    async (isInitial: boolean, isActive: () => boolean) => {
      if (!session?.user?.id) {
        if (isActive()) {
          setProjectMatchesUI([]);
          setCandidateMatchesUI([]);
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }

      if (isInitial) {
        // First load: show full spinner; clear stale data immediately so
        // deleted matches don't linger while the fetch is in flight.
        if (isActive()) {
          setLoading(true);
          setProjectMatchesUI([]);
          setCandidateMatchesUI([]);
        }
      } else {
        // Subsequent focus refreshes: silent — no spinner, no clear.
        // State is replaced atomically when the fetch resolves, so
        // the user sees the current list until fresh data arrives.
        if (isActive()) setRefreshing(true);
      }

      try {
        const { projectMatches, candidateMatches } =
          await fetchAllMatchesOptimized(session.user.id);

        if (!isActive()) return;

        setProjectMatchesUI(projectMatches);
        setCandidateMatchesUI(candidateMatches);
      } catch (e) {
        console.error("Error loading matches:", e);
      } finally {
        if (isActive()) {
          setLoading(false);
          setRefreshing(false);
          hasLoadedOnce.current = true;
        }
      }
    },
    [session?.user?.id],
  );

  // ---------------------------------------------------------------------------
  // Initial load + re-load when a new match notification arrives.
  // Does NOT reset tab/sort/filter — those are UI-only state.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let active = true;
    void loadMatches(true, () => active);
    return () => { active = false; };
  }, [loadMatches, newMatchIds.size]);

  // ---------------------------------------------------------------------------
  // Focus refresh — runs every time the screen comes into focus.
  // This is what catches deleted projects/matches without an app restart.
  // Uses isInitial=false so it never clears or spins — just silently replaces.
  // ---------------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      // Skip the very first focus because the useEffect above already handles
      // the initial load. Every subsequent focus (navigating back from
      // delete-project, edit, etc.) triggers a silent refresh.
      if (!hasLoadedOnce.current) return;

      let active = true;
      void loadMatches(false, () => active);
      return () => { active = false; };
    }, [loadMatches]),
  );

  useEffect(() => {
    const nextPosition = headerSegmentWidth * activeHeaderIndex;
    if (headerSegmentWidth === 0) {
      headerIndicatorX.setValue(nextPosition);
      return;
    }

    Animated.timing(headerIndicatorX, {
      toValue: nextPosition,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [activeHeaderIndex, headerIndicatorX, headerSegmentWidth]);

  const handleHeaderTrackLayout = (event: LayoutChangeEvent) => {
    setHeaderTrackWidth(event.nativeEvent.layout.width);
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#79BE58" />
        <Text style={{ margin: 20, color: "#999" }}>Loading matches...</Text>
      </View>
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image
              source={require('../../assets/images/peeriologo.png')}
              style={{ width: 32, height: 32 }}
              resizeMode="contain"
            />
            <Text style={styles.headerTitle}>Matches</Text>
          </View>

          <View
            onLayout={handleHeaderTrackLayout}
            style={styles.headerTabsTrack}
          >
            {headerSegmentWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.headerTabsIndicator,
                  {
                    width: headerSegmentWidth,
                    transform: [{ translateX: headerIndicatorX }],
                  },
                ]}
              />
            )}

            {MATCHES_TABS.map((tab) => {
              const isActive = activeTabKey === tab.key;
              const badgeCount =
                tab.key === "projects" ? projectNewCount : candidateNewCount;

              return (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.85}
                  onPress={() => setPage(tab.key === "projects")}
                  style={styles.headerTabSegment}
                >
                  <Ionicons
                    name={tab.icon}
                    size={17}
                    color={isActive ? "#5EA03E" : "#172033"}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.headerTabLabel,
                      isActive && styles.headerTabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {badgeCount > 0 && (
                    <View
                      style={[
                        styles.headerTabBadge,
                        isActive
                          ? styles.headerTabBadgeActive
                          : styles.headerTabBadgeInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.headerTabBadgeText,
                          isActive
                            ? styles.headerTabBadgeTextActive
                            : styles.headerTabBadgeTextInactive,
                        ]}
                      >
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ zIndex: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {!projectsPage && uniqueProjects.length >= 1 && (
                <TouchableOpacity
                  onPress={() => { setShowProjectFilter(!showProjectFilter); setShowSortMenu(false); }}
                  style={styles.filterButton}
                >
                  <Ionicons name="filter" size={18} color={showProjectFilter ? "#79BE58" : "#333"} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => { setShowSortMenu(!showSortMenu); setShowProjectFilter(false); }}
                style={styles.filterButton}
              >
                <Ionicons name="swap-vertical" size={18} color={showSortMenu ? "#79BE58" : "#333"} />
              </TouchableOpacity>
            </View>
            {showProjectFilter && (
              <View style={styles.filterDropdown}>
                <TouchableOpacity
                  style={[styles.filterOption, selectedProject === 'all' && styles.filterOptionActive]}
                  onPress={() => { setSelectedProject('all'); setShowProjectFilter(false); }}
                >
                  <Text style={styles.filterOptionText}>All Projects</Text>
                </TouchableOpacity>
                {uniqueProjects.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.filterOption, selectedProject === p.id && styles.filterOptionActive]}
                    onPress={() => { setSelectedProject(p.id); setShowProjectFilter(false); }}
                  >
                    <Text style={styles.filterOptionText}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {showSortMenu && (
              <View style={styles.filterDropdown}>
                {SORT_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.filterOption, sortBy === opt.key && styles.filterOptionActive]}
                    onPress={() => { setSortBy(opt.key); setShowSortMenu(false); }}
                  >
                    <Text style={styles.filterOptionText}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.list}>
            {sortedMatches.map((match, index) => {
              const notifCount = matchNotifs.get(String(match.match_id)) ?? 0;
              const isNewMatch = newMatchIds.has(String(match.match_id));
              const displayName = projectsPage ? match.project_name : match.candidate_name;
              const subtitle = projectsPage ? match.owner_name : match.project_name;

              return (
                <TouchableOpacity
                  key={index}
                  onPress={async () => {
                    gotoMatch(match.match_id);
                  }}
                >
                  <View style={styles.match}>
                    <Image
                      source={projectsPage ? {uri : match.project_image} : {uri: match.candidate_image}}
                      style={styles.profileImage}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchName}>{displayName}</Text>
                      <Text style={styles.matchProject} numberOfLines={1}>{subtitle}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {(match.last_message_body || match.last_message_at) ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 140 }}>
                          {match.last_message_body && (
                            <Text style={styles.lastMessage} numberOfLines={1}>
                              {match.last_message_body}
                            </Text>
                          )}
                          {match.last_message_at && (
                            <Text style={styles.lastMessageTime}>
                              {formatRelativeDate(match.last_message_at)}
                            </Text>
                          )}
                        </View>
                      ) : null}
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {isNewMatch && (
                          <View style={styles.newMatchPill}>
                            <Text style={styles.newMatchPillText}>new</Text>
                          </View>
                        )}
                        {notifCount > 0 && (
                          <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>{notifCount}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  match: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 10,
  },

  list: { marginTop: 10, gap: 10 },

  container: { flex: 1, backgroundColor: "#ffffff" },
  scrollView: { flex: 1, padding: 20, paddingTop : 22 },

  headerTitle: { fontSize: 28, fontWeight: "700", color: "#333", marginTop : 0, marginBottom: 4 },
  
  
  headerTabsTrack: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#C8E4BC",
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 56,
    overflow: "hidden",
    paddingHorizontal: MATCHES_TRACK_PADDING,
    paddingVertical: MATCHES_TRACK_PADDING,
    marginTop: 12,
    shadowColor: "#7BAF6A",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: {
        elevation: 7,
      },
      default: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
    }),
  },
  headerTabsIndicator: {
    backgroundColor: "#E8F5E2",
    borderRadius: 24,
    bottom: MATCHES_TRACK_PADDING,
    left: MATCHES_TRACK_PADDING,
    position: "absolute",
    top: MATCHES_TRACK_PADDING,
    shadowColor: "#7BAF6A",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
      default: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
    }),
  },
  headerTabSegment: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 10,
    zIndex: 1,
  },
  headerTabLabel: {
    color: "#172033",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  headerTabLabelActive: { color: "#5EA03E" },
  headerTabBadge: {
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 6,
  },
  headerTabBadgeActive: { backgroundColor: "#5EA03E" },
  headerTabBadgeInactive: { backgroundColor: "#E8F5E2" },
  headerTabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  headerTabBadgeTextActive: { color: "#FFFFFF" },
  headerTabBadgeTextInactive: { color: "#5EA03E" },

  section: { marginBottom: 25 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "normal", color: "#333" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  profileImage: { width: 60, height: 60, borderRadius: 60 },
  matchName: { fontSize: 15, fontWeight: '600', color: '#333' },
  matchProject: { fontSize: 12, color: '#999', marginTop: 2 },
  lastMessage: { fontSize: 12, color: '#999', flex: 1 },
  lastMessageTime: { fontSize: 11, color: '#aaa' },
  filterButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#C8E4BC',
    borderRadius: 20,
  },
  filterDropdown: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    overflow: 'hidden',
  },
  filterOption: { paddingVertical: 10, paddingHorizontal: 14 },
  filterOptionActive: { backgroundColor: '#E8F5E2' },
  filterOptionText: { fontSize: 14, color: '#333' },

  placeholderImage: {
    width: 60,
    height: 60,
    borderRadius: 60,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
  },

  activeTab: { fontWeight: "bold", fontSize: 18, justifyContent: "center" },
  center: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  newBadge: {
    backgroundColor: "red",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 6,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  newMatchPill: {
    backgroundColor: "#22c55e",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  newMatchPillText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
});
