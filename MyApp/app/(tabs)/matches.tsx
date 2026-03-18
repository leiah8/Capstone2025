// import { Platform, StyleSheet } from 'react-native';

import { Ionicons } from "@expo/vector-icons";
import { MatchUI } from "../../lib/match";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

import { router } from "expo-router";
import { useNotifications } from "../../contexts/NotificationContext";
import { supabase } from "../../lib/supabase";

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

export default function MatchesPage() {
  const { session } = useAuth();
  const { matchNotifs, newMatchIds } = useNotifications();

  /* State */
  const [loading, setLoading] = useState(true);

  const [projectMatchesUI, setProjectMatchesUI] = useState<MatchUI[]>([]);
  const [candidateMatchesUI, setCandidateMatchesUI] = useState<MatchUI[]>([]);

  const [projectsPage, setPage] = useState(true);
  const [headerTrackWidth, setHeaderTrackWidth] = useState(0);
  const headerIndicatorX = useRef(new Animated.Value(0)).current;

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
  const activeMatches = projectsPage ? projectMatchesUI : candidateMatchesUI;

  const gotoMatch = (pid: string | number) => {
    router.push(`/match/${pid}`);
  };

  useEffect(() => {
    let pMatches: MatchUI[] = [];
    let cMatches: MatchUI[] = [];

    (async () => {
      //get project matches

      try {
        const { data: m1, error: e1 } = await supabase
          .from("matches")
          .select("*")
          .eq("candidate_id", session?.user?.id);

        if (e1 && e1.code !== "PGRST116") {
          console.error("Error loading project matches", e1);
        } else if (m1) {
          for (let i = 0; i < m1.length; i++) {
            let obj: MatchUI = {
              match_id: "0",
              candidate_name: "0",
              project_name: "0",
              owner_name: "0",

              owner_id: "0",
              candidate_id: "0",
              created_at: "",

              project_image: "0",
              candidate_image: "0",
              owner_image: "0",
            };

            obj.match_id = m1[i].id;
            obj.owner_id = m1[i].owner_id;
            obj.candidate_id = m1[i].candidate_id;
            obj.created_at = m1[i].created_at;

            const { data: d1, error: e11 } = await supabase
              .from("projects")
              .select("*")
              .eq("id", m1[i].project_id)
              .single();

            if (e11 && e11.code !== "PGRST116") {
              console.error("Error loading project data:", e11);
            } else if (d1) {
              obj.project_name = d1.title;
              obj.project_image = d1.image;
            }

            const { data: d2, error: e12 } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", m1[i].owner_id)
              .single();

            if (e12 && e12.code !== "PGRST116") {
              console.error("Error loading candidate data:", e12);
            } else if (d2) {
              obj.owner_name = d2.name;
              obj.owner_image = d2.profile_image;
            }

            const { data: d3, error: e13 } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", m1[i].candidate_id)
              .single();

            if (e13 && e13.code !== "PGRST116") {
              console.error("Error loading owner data:", e13);
            } else if (d3) {
              obj.candidate_name = d3.name;
              obj.candidate_image = d3.profile_image;
            }

            // console.log("OBJ")
            // console.log(obj)
            pMatches.push(obj);
          }

          setProjectMatchesUI(pMatches);
        }

        const { data: m2, error: e2 } = await supabase
          .from("matches")
          .select("*")
          .eq("owner_id", session?.user?.id);

        if (e2 && e2.code !== "PGRST116") {
          console.error("Error loading candidate matches:", e2);
        } else if (m2) {
          for (let i = 0; i < m2.length; i++) {
            let obj: MatchUI = {
              match_id: "0",
              candidate_name: "0",
              project_name: "0",
              owner_name: "0",

              owner_id: "0",
              candidate_id: "0",
              created_at: "",

              project_image: "0",
              candidate_image: "0",
              owner_image: "0",
            };

            obj.match_id = m2[i].id;
            obj.owner_id = m2[i].owner_id;
            obj.candidate_id = m2[i].candidate_id;
            obj.created_at = m2[i].created_at;

            const { data: d1, error: e11 } = await supabase
              .from("projects")
              .select("*")
              .eq("id", m2[i].project_id)
              .single();

            if (e11 && e11.code !== "PGRST116") {
              console.error("Error loading project data:", e11);
            } else if (d1) {
              obj.project_name = d1.title;
              obj.project_image = d1.image;
            }

            const { data: d2, error: e12 } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", m2[i].owner_id)
              .single();

            if (e12 && e12.code !== "PGRST116") {
              console.error("Error loading candidate data:", e12);
            } else if (d2) {
              obj.owner_name = d2.name;
              obj.owner_image = d2.profile_image;
            }

            const { data: d3, error: e13 } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", m2[i].candidate_id)
              .single();

            if (e13 && e13.code !== "PGRST116") {
              console.error("Error loading owner data:", e13);
            } else if (d3) {
              obj.candidate_name = d3.name;
              obj.candidate_image = d3.profile_image;
            }

            // console.log("OBJ")
            // console.log(obj)
            cMatches.push(obj);
          }

          setCandidateMatchesUI(cMatches);
        }
      } catch (e) {
        console.error("Error loading data", e);
      } finally {
        setLoading(false);
      }

      setPage(true);
    })();
  }, [session?.user?.id]);

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
        <ActivityIndicator size="large" color="#007AFF" />
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
          <View>
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
                    color={isActive ? "#2B4CD8" : "#172033"}
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

          <View style={styles.list}>
            {activeMatches.map((match, index) => {
              const notifCount = matchNotifs.get(String(match.match_id)) ?? 0;
              const isNewMatch = newMatchIds.has(String(match.match_id));
              const displayName = projectsPage
                ? match.project_name
                : match.candidate_name;

              return (
                <TouchableOpacity
                  key={index}
                  onPress={async () => {
                    gotoMatch(match.match_id);
                  }}
                >
                  <View style={styles.match}>
                    <Image
                      source={{ uri: match.project_image }}
                      style={styles.profileImage}
                    />
                    <Text>{displayName}</Text>
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
  scrollView: { flex: 1, padding: 20 },

  headerTitle: { fontSize: 28, fontWeight: "700", color: "#333" },
  headerTabsTrack: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE5F6",
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 56,
    overflow: "hidden",
    paddingHorizontal: MATCHES_TRACK_PADDING,
    paddingVertical: MATCHES_TRACK_PADDING,
    marginTop: 12,
    shadowColor: "#9EADD6",
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
    backgroundColor: "#E6EEFF",
    borderRadius: 24,
    bottom: MATCHES_TRACK_PADDING,
    left: MATCHES_TRACK_PADDING,
    position: "absolute",
    top: MATCHES_TRACK_PADDING,
    shadowColor: "#9EADD6",
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
  headerTabLabelActive: { color: "#2B4CD8" },
  headerTabBadge: {
    borderRadius: 999,
    height: 20,
    justifyContent: "center",
    minWidth: 20,
    paddingHorizontal: 6,
  },
  headerTabBadgeActive: { backgroundColor: "#3755E8" },
  headerTabBadgeInactive: { backgroundColor: "#EDF2FF" },
  headerTabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  headerTabBadgeTextActive: { color: "#FFFFFF" },
  headerTabBadgeTextInactive: { color: "#3755E8" },

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

//TODO: change output so only a couple things change per projectPage bool
//TODO: add in images
