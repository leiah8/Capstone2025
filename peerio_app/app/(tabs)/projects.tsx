// app/(tabs)/projects.tsx

/* =========================
   Imports & setup
   ========================= */
import { calcDist, fetchMyCoords } from "@/lib/candidates";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MatchCelebrationOverlay from "../../components/MatchCelebrationOverlay";
import { useAuth } from "../../contexts/AuthContext";
import {
  checkMatchingAPIHealth,
  getMatchedProjects,
} from "../../lib/matching-api";
import {
  deleteNonMatchedProjectLikes,
  fetchProjects,
  fetchSwipedProjectIds,
  likeProject,
  ProjectUI,
} from "../../lib/projects";
import { supabase } from "../../lib/supabase";
import { getUserProfile } from "../../lib/user-profile";
import {
  applyIncluded,
  calcDistKm,
  FeedItem,
  getNextIndex,
  getPeekIndex,
  markSwiped,
  toFeedItems,
} from "../../lib/feed-utils";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = 120;
const MAX_DISTANCE = 5000;

const HEADER_TRACK_PADDING = 6;
const DECK_CARD_WIDTH = Math.min(SCREEN_WIDTH - 32, 430);
const DECK_CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.68, 620);
const SWIPE_HINT_HEIGHT = 138;
const SWIPE_HINT_GAP = 16;
const HEADER_TABS = [
  { key: "browse", label: "Browse", icon: "compass-outline" },
  { key: "mine", label: "My Projects", icon: "folder-outline" },
] as const;
const PROJECT_SWIPE_HINT_SEEN_KEY = "projectSwipeHintSeen";
const deckCardShell = {
  backgroundColor: "#fff",
  borderRadius: 20,
  borderWidth: 1,
  borderColor: "#DCF0D4",
  shadowColor: "#7BAF6A",
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.18,
  shadowRadius: 18,
  elevation: 7,
} as const;

/* =========================
   Types
   ========================= */
type Project = ProjectUI & {
  skillsNeeded?: string[];
  interests?: string[];
  skills?: { name: string; level?: number }[];
  lat: number | null;
  lng: number | null;
};

type FilterSkill = {
  name: string;
  included: boolean;
};

type FilterInterest = {
  name: string;
  included: boolean;
};

type Coord = {
  lat: number | null;
  lng: number | null;
};

type MyProject = {
  id: number;
  title: string;
  description: string;
  skills_needed: string[] | null;
  tags: string[] | null;
  image: string | null;
  is_active: boolean;
  created_at: string;
};

/* =========================
   Filter predicate (pure)
   ========================= */
function buildProjectPredicate(opts: {
  myCoords: Coord;
  maxDist: number;
  showAllSkills: boolean;
  skills: FilterSkill[];
  showAllInterests: boolean;
  interests: FilterInterest[];
}): (p: Project) => boolean {
  const effectiveMaxDist = opts.maxDist < MAX_DISTANCE ? opts.maxDist : Infinity;
  const includedSkills = opts.skills.filter((s) => s.included).map((s) => s.name);
  const includedInterests = opts.interests.filter((i) => i.included).map((i) => i.name);

  return (p) => {
    const dist = calcDistKm(opts.myCoords.lat, opts.myCoords.lng, p.lat, p.lng);
    if (dist > effectiveMaxDist) return false;

    if (!opts.showAllSkills) {
      const projectSkills = p.skillsNeeded ?? [];
      if (!projectSkills.some((s) => includedSkills.includes(s))) return false;
    }

    if (!opts.showAllInterests) {
      const projectInterests = p.interests ?? [];
      if (!projectInterests.some((i) => includedInterests.includes(i))) return false;
    }

    return true;
  };
}

/* =========================
   Custom Slider
   ========================= */
const LocationSlider = ({
  min = 0,
  max = 100,
  value,
  onValueChange,
}: {
  min?: number;
  max?: number;
  value: number;
  onValueChange: (v: number) => void;
}) => {
  const trackWidth = useRef(0);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const sliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        onValueChange(clamp(Math.round(min + (x / trackWidth.current) * (max - min))));
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        onValueChange(clamp(Math.round(min + (x / trackWidth.current) * (max - min))));
      },
    }),
  ).current;

  const fillRatio = (value - min) / (max - min);

  return (
    <View style={sliderStyles.wrapper}>
      <View
        style={sliderStyles.track}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width; }}
        {...sliderPanResponder.panHandlers}
      >
        <View style={[sliderStyles.fill, { width: `${fillRatio * 100}%` }]} />
        <View
          style={[sliderStyles.thumb, { left: `${fillRatio * 100}%` as any }]}
          pointerEvents="none"
        />
      </View>
    </View>
  );
};

const sliderStyles = StyleSheet.create({
  wrapper: { width: "80%", alignSelf: "center", paddingVertical: 12 },
  track: { height: 4, backgroundColor: "#E1E8F5", borderRadius: 2, position: "relative" },
  fill: { height: 4, backgroundColor: "#79BE58", borderRadius: 2, position: "absolute", left: 0, top: 0 },
  thumb: {
    position: "absolute", top: -9, width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#fff", borderWidth: 2, borderColor: "#79BE58", marginLeft: -11,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
});

/* =========================
   Swipeable Card
   ========================= */
const ProjectCard = ({
  project,
  isTop,
  onSwipe,
  onOpenHelp,
}: {
  project: Project;
  isTop: boolean;
  onSwipe: (d: "left" | "right") => void;
  onOpenHelp: () => void;
}) => {
  const position = useRef(new Animated.ValueXY()).current;
  const onSwipeRef = useRef(onSwipe);
  useEffect(() => { onSwipeRef.current = onSwipe; }, [onSwipe]);

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ["-10deg", "0deg", "10deg"],
    extrapolate: "clamp",
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: "clamp",
  });
  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: "clamp",
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 10,
      onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: 0 }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) swipeRight();
        else if (g.dx < -SWIPE_THRESHOLD) swipeLeft();
        else resetPosition();
      },
    }),
  ).current;

  const swipeRight = () =>
    Animated.timing(position, { toValue: { x: SCREEN_WIDTH + 100, y: 0 }, duration: 250, useNativeDriver: false })
      .start(() => onSwipeRef.current("right"));
  const swipeLeft = () =>
    Animated.timing(position, { toValue: { x: -SCREEN_WIDTH - 100, y: 0 }, duration: 250, useNativeDriver: false })
      .start(() => onSwipeRef.current("left"));
  const resetPosition = () =>
    Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();

  const skills =
    project.skillsNeeded && project.skillsNeeded.length > 0
      ? project.skillsNeeded
      : (project.skills?.map((s) => s.name) ?? []);
  const interests = project.interests ?? [];

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateX: position.x }, { rotate }] }, !isTop && styles.cardBehind]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      <View style={styles.cardSurface}>
        {isTop && (
          <>
            <Animated.View style={[styles.likeOverlay, { opacity: likeOpacity }]}>
              <Text style={styles.overlayText}>INTERESTED</Text>
            </Animated.View>
            <Animated.View style={[styles.nopeOverlay, { opacity: nopeOpacity }]}>
              <Text style={styles.nopeOverlayText}>PASS</Text>
            </Animated.View>
            <TouchableOpacity
              accessibilityLabel="Show matching help"
              accessibilityRole="button"
              activeOpacity={0.85}
              hitSlop={8}
              onPress={onOpenHelp}
              style={styles.cardHelpButton}
            >
              <Text style={styles.cardHelpButtonLabel}>?</Text>
            </TouchableOpacity>
          </>
        )}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <Text style={styles.projectName}>{project.name}</Text>
          <Text style={styles.location}>{project.location}</Text>
          <View style={styles.imageContainer}>
            <Image source={{ uri: project.image }} style={styles.projectImage} />
          </View>
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>Project Description</Text>
            <Text style={styles.description}>{project.description}</Text>
          </View>
          {skills.length > 0 && (
            <View style={{ marginTop: 6, marginBottom: 20 }}>
              <Text style={styles.sectionTitle}>Skills Needed</Text>
              <View style={styles.chipsWrap}>
                {skills.map((s, i) => (
                  <View key={`${s}-${i}`} style={styles.chip}>
                    <Text style={styles.chipText}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {interests.length > 0 && (
            <View style={{ marginTop: 6, marginBottom: 20 }}>
              <Text style={styles.sectionTitle}>Interests</Text>
              <View style={styles.chipsWrap}>
                {interests.map((interest, i) => (
                  <View key={`${interest}-${i}`} style={styles.chip}>
                    <Text style={styles.chipText}>{interest}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Animated.View>
  );
};

/* =========================
   Screen
   ========================= */
export default function ProjectFeed() {
  const { session } = useAuth();
  const tabBarHeight = useBottomTabBarHeight();
  const swipeHintBottomOffset = Math.max(tabBarHeight, 88) + 12;
  const [tab, setTab] = useState<"browse" | "mine">("browse");

  // ---------------------------------------------------------------------------
  // Core feed state — same FeedItem<Project>[] pattern as candidates.tsx
  // ---------------------------------------------------------------------------
  const [feedItems, setFeedItems] = useState<FeedItem<Project>[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Full unfiltered list; kept so we can re-apply filters without a network call
  const [allProjects, setAllProjects] = useState<Project[]>([]);

  // ---------------------------------------------------------------------------
  // Applied filter state (source of truth)
  // ---------------------------------------------------------------------------
  const [filterSkills, setFilterSkills] = useState<FilterSkill[]>([]);
  const [showAllSkills, setShowAllSkills] = useState(true);
  const [filterInterests, setFilterInterests] = useState<FilterInterest[]>([]);
  const [showAllInterests, setShowAllInterests] = useState(true);
  const [maxFilterDist, setMaxFilterDist] = useState(MAX_DISTANCE);
  const [myCoords, setMyCoords] = useState<Coord>({ lat: null, lng: null });
  // Refs mirror applied state so async callbacks never read stale closures
  const myCoordsRef = useRef<Coord>({ lat: null, lng: null });
  const filterSkillsRef = useRef<FilterSkill[]>([]);
  const showAllSkillsRef = useRef(true);
  const filterInterestsRef = useRef<FilterInterest[]>([]);
  const showAllInterestsRef = useRef(true);
  const maxFilterDistRef = useRef(MAX_DISTANCE);

  const syncSetFilterSkills = (v: FilterSkill[]) => { filterSkillsRef.current = v; setFilterSkills(v); };
  const syncSetShowAllSkills = (v: boolean) => { showAllSkillsRef.current = v; setShowAllSkills(v); };
  const syncSetFilterInterests = (v: FilterInterest[]) => { filterInterestsRef.current = v; setFilterInterests(v); };
  const syncSetShowAllInterests = (v: boolean) => { showAllInterestsRef.current = v; setShowAllInterests(v); };
  const syncSetMaxFilterDist = (v: number) => { maxFilterDistRef.current = v; setMaxFilterDist(v); };

  // ---------------------------------------------------------------------------
  // UI (staged) filter state — only committed on Apply
  // ---------------------------------------------------------------------------
  const [filterSkillsUI, setFilterSkillsUI] = useState<FilterSkill[]>([]);
  const [showAllSkillsUI, setShowAllSkillsUI] = useState(true);
  const [filterInterestsUI, setFilterInterestsUI] = useState<FilterInterest[]>([]);
  const [showAllInterestsUI, setShowAllInterestsUI] = useState(true);
  const [maxFilterDistUI, setMaxFilterDistUI] = useState(MAX_DISTANCE);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [myProjects, setMyProjects] = useState<MyProject[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [headerTrackWidth, setHeaderTrackWidth] = useState(0);
  const [deckHeight, setDeckHeight] = useState(DECK_CARD_HEIGHT);
  const [matchCelebrationTarget, setMatchCelebrationTarget] = useState<string | null>(null);
  const [hasSeenSwipeHint, setHasSeenSwipeHint] = useState<boolean | null>(null);
  const [swipeHintVisible, setSwipeHintVisible] = useState(false);
  const [filterDropDownOpen, setFilterDropDownOpen] = useState(false);

  const headerIndicatorX = useRef(new Animated.Value(0)).current;
  const swipeHintOpacity = useRef(new Animated.Value(0)).current;
  const swipeHintTranslateY = useRef(new Animated.Value(12)).current;
  const swipeHintHasShown = useRef(false);
  const swipeHintAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const activeHeaderIndex = tab === "browse" ? 0 : 1;
  const headerSegmentWidth =
    headerTrackWidth > 0
      ? Math.max((headerTrackWidth - HEADER_TRACK_PADDING * 2) / HEADER_TABS.length, 0)
      : 0;

  // ---------------------------------------------------------------------------
  // rebuildFeedItems — pure helper: re-stamps included on the full project list
  // and resets the cursor to the first visible card.  Preserves swiped flags.
  // ---------------------------------------------------------------------------
  const rebuildFeedItems = useCallback(
    (
      projects: Project[],
      coords: Coord,
      skills: FilterSkill[],
      showAllSkills: boolean,
      interests: FilterInterest[],
      showAllInterests: boolean,
      maxDist: number,
      existingItems?: FeedItem<Project>[],
    ): { items: FeedItem<Project>[]; index: number } => {
      const predicate = buildProjectPredicate({ myCoords: coords, maxDist, showAllSkills, skills, showAllInterests, interests });

      // If we have an existing list (e.g. after applying filters), preserve swiped flags
      if (existingItems && existingItems.length === projects.length) {
        const items = applyIncluded(existingItems, (p) => predicate(p));
        return { items, index: getNextIndex(items, 0) };
      }

      // Fresh build — wrap projects into FeedItem slots
      const items = applyIncluded(toFeedItems(projects), (p) => predicate(p));
      return { items, index: getNextIndex(items, 0) };
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // loadBrowseProjects
  // ---------------------------------------------------------------------------
  const loadBrowseProjects = useCallback(
    async (isActive: () => boolean = () => true) => {
      try {
        setLoading(true);

        const swipedIds = session?.user?.id
          ? await fetchSwipedProjectIds(session.user.id)
          : ([] as string[]);
        const rawProjects = await fetchProjects(50, session?.user?.id, swipedIds);
        if (!isActive()) return;

        const coords = await fetchMyCoords(session?.user?.id);
        if (!isActive()) return;
        myCoordsRef.current = coords;
        setMyCoords(coords);

        const matchingAvailable = await checkMatchingAPIHealth();
        if (!isActive()) return;

        const userProfile = await getUserProfile();
        if (!isActive()) return;

        const freshSkills: FilterSkill[] = userProfile.skills.map((s: string) => ({ name: s, included: true }));
        const freshInterests: FilterInterest[] = (userProfile.interests ?? []).map((i: string) => ({ name: i, included: true }));

        // Detect profile changes to decide whether to reset filter selections
        const skillsChanged =
          filterSkillsRef.current.length !== freshSkills.length ||
          filterSkillsRef.current.some((s, idx) => s.name !== freshSkills[idx]?.name);
        const interestsChanged =
          filterInterestsRef.current.length !== freshInterests.length ||
          filterInterestsRef.current.some((s, idx) => s.name !== freshInterests[idx]?.name);

        let effectiveSkills = filterSkillsRef.current;
        let effectiveShowAllSkills = showAllSkillsRef.current;
        let effectiveInterests = filterInterestsRef.current;
        let effectiveShowAllInterests = showAllInterestsRef.current;

        if (skillsChanged) {
          syncSetFilterSkills(freshSkills);
          setFilterSkillsUI(freshSkills);
          syncSetShowAllSkills(true);
          setShowAllSkillsUI(true);
          effectiveSkills = freshSkills;
          effectiveShowAllSkills = true;
        }
        if (interestsChanged) {
          syncSetFilterInterests(freshInterests);
          setFilterInterestsUI(freshInterests);
          syncSetShowAllInterests(true);
          setShowAllInterestsUI(true);
          effectiveInterests = freshInterests;
          effectiveShowAllInterests = true;
        }

        // Rank via matching API if available
        let rankedProjects: Project[] = rawProjects as Project[];
        if (matchingAvailable) {
          try {
            const matchScores = await getMatchedProjects(userProfile, rawProjects);
            if (!isActive()) return;
            const scoreMap = new Map(matchScores.map((m) => [m.project_id, m.overall_score]));
            rankedProjects = [...rawProjects]
              .map((p, i) => ({ p, i }))
              .sort((a, b) => {
                const sa = scoreMap.get(a.p.id) ?? 0;
                const sb = scoreMap.get(b.p.id) ?? 0;
                return sb !== sa ? sb - sa : a.i - b.i;
              })
              .map(({ p }) => p) as Project[];
          } catch (matchErr) {
            console.warn("Failed to rank projects:", matchErr);
          }
        }

        if (!isActive()) return;
        setAllProjects(rankedProjects);

        const { items, index } = rebuildFeedItems(
          rankedProjects, coords,
          effectiveSkills, effectiveShowAllSkills,
          effectiveInterests, effectiveShowAllInterests,
          maxFilterDistRef.current,
        );
        setFeedItems(items);
        setCurrentIndex(index);
      } catch (e: any) {
        if (!isActive()) return;
        setErr(e.message ?? String(e));
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [session?.user?.id, rebuildFeedItems],
  );

  // ---------------------------------------------------------------------------
  // advance — move cursor to the next visible (included && !swiped) item
  // ---------------------------------------------------------------------------
  const advance = useCallback((fromIndex: number, list: FeedItem<Project>[]) => {
    const next = getNextIndex(list, fromIndex + 1);
    setCurrentIndex(next);
  }, []);

  // ---------------------------------------------------------------------------
  // handleSwipe
  // ---------------------------------------------------------------------------
  const handleSwipe = async (direction: "left" | "right") => {
    const slot = feedItems[currentIndex];
    if (!slot) return;

    // 1. Mark swiped
    const updated = markSwiped(feedItems, currentIndex);
    setFeedItems(updated);

    // 2. Advance cursor
    advance(currentIndex, updated);

    if (!session?.user?.id) return;
    try {
      const matchResult = await likeProject(
        session.user.id,
        slot.item.owner_id,
        slot.item.id,
        direction === "right" ? "like" : "pass",
      );
      if (matchResult?.match) {
        setMatchCelebrationTarget(slot.item.name);
        // Exclude matched project from feed entirely
        setFeedItems((prev) =>
          prev.map((fi) => fi.item.id === slot.item.id ? { ...fi, included: false } : fi),
        );
      }
    } catch (e: any) {
      console.warn("Failed to record project like:", e.message ?? e);
    }
  };

  // ---------------------------------------------------------------------------
  // My Projects tab
  // ---------------------------------------------------------------------------
  const fetchMyProjects = useCallback(async () => {
    if (!session?.user?.id) return;
    setMyLoading(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, description, skills_needed, tags, image, is_active, created_at")
        .eq("owner_id", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setMyProjects((data ?? []) as MyProject[]);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to load your projects.");
    } finally {
      setMyLoading(false);
    }
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      void loadBrowseProjects(() => isActive);
      fetchMyProjects();
      return () => { isActive = false; };
    }, [loadBrowseProjects, fetchMyProjects]),
  );

  useEffect(() => {
    if (tab === "mine") fetchMyProjects();
  }, [tab, fetchMyProjects]);

  useEffect(() => {
    setFeedItems([]);
    setAllProjects([]);
    setCurrentIndex(0);
    setErr(null);
  }, [session?.user?.id]);

  // Swipe hint
  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(PROJECT_SWIPE_HINT_SEEN_KEY).then((v) => {
      if (isMounted) setHasSeenSwipeHint(v === "true");
    }).catch(() => { if (isMounted) setHasSeenSwipeHint(false); });
    return () => {
      isMounted = false;
      swipeHintAnimation.current?.stop();
    };
  }, []);

  const persistSwipeHintSeen = useCallback(async () => {
    try { await AsyncStorage.setItem(PROJECT_SWIPE_HINT_SEEN_KEY, "true"); } catch { /* ignore */ }
  }, []);

  const showSwipeHint = useCallback(() => {
    swipeHintAnimation.current?.stop();
    setSwipeHintVisible(true);
    swipeHintOpacity.setValue(0);
    swipeHintTranslateY.setValue(12);
    const anim = Animated.parallel([
      Animated.timing(swipeHintOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(swipeHintTranslateY, { toValue: 0, speed: 18, bounciness: 5, useNativeDriver: true }),
    ]);
    swipeHintAnimation.current = anim;
    anim.start(() => { swipeHintAnimation.current = null; });
  }, [swipeHintOpacity, swipeHintTranslateY]);

  const dismissSwipeHint = () => {
    swipeHintAnimation.current?.stop();
    const anim = Animated.parallel([
      Animated.timing(swipeHintOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(swipeHintTranslateY, { toValue: 10, duration: 180, useNativeDriver: true }),
    ]);
    swipeHintAnimation.current = anim;
    anim.start(() => { swipeHintAnimation.current = null; setSwipeHintVisible(false); });
  };

  useEffect(() => {
    const deckExhausted = currentIndex >= feedItems.length;
    if (loading || tab !== "browse" || deckExhausted || hasSeenSwipeHint !== false || swipeHintHasShown.current) return;
    swipeHintHasShown.current = true;
    setHasSeenSwipeHint(true);
    void persistSwipeHintSeen();
    showSwipeHint();
  }, [hasSeenSwipeHint, loading, persistSwipeHintSeen, currentIndex, feedItems.length, showSwipeHint, tab]);

  useEffect(() => {
    const nextPosition = headerSegmentWidth * activeHeaderIndex;
    if (headerSegmentWidth === 0) { headerIndicatorX.setValue(nextPosition); return; }
    Animated.timing(headerIndicatorX, { toValue: nextPosition, duration: 220, useNativeDriver: true }).start();
  }, [activeHeaderIndex, headerIndicatorX, headerSegmentWidth]);

  const handleHeaderTrackLayout = (e: LayoutChangeEvent) => setHeaderTrackWidth(e.nativeEvent.layout.width);
  const handleDeckLayout = (e: LayoutChangeEvent) => {
    const next = Math.max(e.nativeEvent.layout.height, DECK_CARD_HEIGHT);
    setDeckHeight((h) => Math.abs(h - next) > 1 ? next : h);
  };

  const toggleActive = async (project: MyProject) => {
    const newStatus = !project.is_active;
    const { error } = await supabase.from("projects").update({ is_active: newStatus }).eq("id", project.id).eq("owner_id", session?.user?.id);
    if (error) { Alert.alert("Error", error.message || "Failed to update project status."); return; }
    setMyProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, is_active: newStatus } : p));
  };

  const deleteProject = (project: MyProject) => {
    Alert.alert("Delete Project", `Are you sure you want to delete "${project.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("projects").delete().eq("id", project.id);
          if (error) { Alert.alert("Error", "Failed to delete project."); return; }
          setMyProjects((prev) => prev.filter((p) => p.id !== project.id));
        },
      },
    ]);
  };

  // ---------------------------------------------------------------------------
  // Derive top two visible cards
  // ---------------------------------------------------------------------------
  const topIndex = getNextIndex(feedItems, currentIndex);
  const peekIndex = topIndex < feedItems.length ? getPeekIndex(feedItems, topIndex) : feedItems.length;
  const deckExhausted = topIndex >= feedItems.length;

  const visibleCards: { slot: FeedItem<Project>; idx: number }[] = [];
  if (topIndex < feedItems.length) visibleCards.push({ slot: feedItems[topIndex], idx: topIndex });
  if (peekIndex < feedItems.length) visibleCards.push({ slot: feedItems[peekIndex], idx: peekIndex });

  if (loading && tab === "browse")
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#79BE58" />
        <Text style={{ margin: 15, color: "#999" }}>Loading projects...</Text>
      </View>
    );
  if (err && tab === "browse")
    return <View style={styles.center}><Text>Failed to load projects: {err}</Text></View>;

  // ---------------------------------------------------------------------------
  // Filter panel
  // ---------------------------------------------------------------------------
  return filterDropDownOpen ? (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#FFF" }}>
      <ScrollView style={styles.container}>
        <View style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 20 }}>
          <Text style={[styles.pageHeader]}>Filter Projects</Text>
          <TouchableOpacity
            style={styles.closeDropDownButton}
            onPress={() => {
              setFilterDropDownOpen(false);
              // Discard staged UI changes
              setMaxFilterDistUI(maxFilterDistRef.current);
              setFilterSkillsUI(filterSkillsRef.current);
              setShowAllSkillsUI(showAllSkillsRef.current);
              setFilterInterestsUI(filterInterestsRef.current);
              setShowAllInterestsUI(showAllInterestsRef.current);
            }}
          >
            <Ionicons name="close" size={35} color="000" />
          </TouchableOpacity>
        </View>

        {myCoords.lat && (
          <View>
            <Text style={styles.sectionTitle}>Location</Text>
            <LocationSlider min={0} max={MAX_DISTANCE} value={maxFilterDistUI} onValueChange={setMaxFilterDistUI} />
            <Text style={{ textAlign: "center", color: "#888", fontSize: 13 }}>
              {maxFilterDistUI >= MAX_DISTANCE ? "Worldwide" : `${maxFilterDistUI}km`}
            </Text>
          </View>
        )}

        {filterSkills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <TouchableOpacity style={styles.filterRow} onPress={() => setShowAllSkillsUI((v) => !v)}>
              <Ionicons name={showAllSkillsUI ? "checkmark-circle" : "ellipse-outline"} size={20} color="#333" />
              <Text style={styles.filterLabel}>Show All Skills</Text>
            </TouchableOpacity>
            {filterSkillsUI.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.filterRow, { paddingHorizontal: 40 }]}
                onPress={() => {
                  if (!showAllSkillsUI)
                    setFilterSkillsUI((prev) => prev.map((sk, j) => j === i ? { ...sk, included: !sk.included } : sk));
                }}
              >
                <Ionicons name={s.included || showAllSkillsUI ? "checkbox" : "square-outline"} size={20} color={showAllSkillsUI ? "#ddd" : "#333"} />
                <Text style={[styles.filterLabel, { color: showAllSkillsUI ? "#ddd" : "#333" }]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {filterInterests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <TouchableOpacity style={styles.filterRow} onPress={() => setShowAllInterestsUI((v) => !v)}>
              <Ionicons name={showAllInterestsUI ? "checkmark-circle" : "ellipse-outline"} size={20} color="#333" />
              <Text style={styles.filterLabel}>Show All Interests</Text>
            </TouchableOpacity>
            {filterInterestsUI.map((interest, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.filterRow, { paddingHorizontal: 40 }]}
                onPress={() => {
                  if (!showAllInterestsUI)
                    setFilterInterestsUI((prev) => prev.map((it, j) => j === i ? { ...it, included: !it.included } : it));
                }}
              >
                <Ionicons name={interest.included || showAllInterestsUI ? "checkbox" : "square-outline"} size={20} color={showAllInterestsUI ? "#ddd" : "#333"} />
                <Text style={[styles.filterLabel, { color: showAllInterestsUI ? "#ddd" : "#333" }]}>{interest.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.center}>
          <TouchableOpacity
            style={[styles.center, styles.resetButton, { width: SCREEN_WIDTH * 0.5 }]}
            onPress={() => {
              // Commit staged values as the new applied state
              syncSetShowAllSkills(showAllSkillsUI);
              syncSetFilterSkills(filterSkillsUI);
              syncSetShowAllInterests(showAllInterestsUI);
              syncSetFilterInterests(filterInterestsUI);
              syncSetMaxFilterDist(maxFilterDistUI);
              setFilterDropDownOpen(false);

              // Re-apply filters preserving swiped flags
              const { items, index } = rebuildFeedItems(
                allProjects, myCoordsRef.current,
                filterSkillsUI, showAllSkillsUI,
                filterInterestsUI, showAllInterestsUI,
                maxFilterDistUI,
                feedItems,
              );
              setFeedItems(items);
              setCurrentIndex(index);
            }}
          >
            <Text style={styles.resetButtonText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  ) : (
    /* ================================================================
       MAIN SCREEN
       ================================================================ */
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={tab !== "browse"}
          onPress={() => setFilterDropDownOpen(true)}
          style={[styles.headerIconButton, tab !== "browse" && styles.headerIconButtonHidden]}
        >
          <Ionicons name="filter" size={22} color="#172033" />
        </TouchableOpacity>

        <View style={styles.headerTabsWrapper}>
          <View onLayout={handleHeaderTrackLayout} style={styles.headerTabsTrack}>
            {headerSegmentWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[styles.headerTabsIndicator, { width: headerSegmentWidth, transform: [{ translateX: headerIndicatorX }] }]}
              />
            )}
            {HEADER_TABS.map((headerTab) => {
              const isActive = tab === headerTab.key;
              return (
                <TouchableOpacity key={headerTab.key} activeOpacity={0.85} onPress={() => setTab(headerTab.key)} style={styles.headerTabSegment}>
                  <Ionicons name={headerTab.icon} size={17} color={isActive ? "#5EA03E" : "#172033"} />
                  <Text numberOfLines={1} style={[styles.headerTabLabel, isActive && styles.headerTabLabelActive]}>{headerTab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity style={styles.createButton} onPress={() => router.push("/create-project")}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Browse tab */}
      {tab === "browse" && (
        <View style={[styles.browseLayout, { paddingBottom: swipeHintBottomOffset + SWIPE_HINT_HEIGHT + SWIPE_HINT_GAP }]}>
          <View style={styles.cardContainer} onLayout={handleDeckLayout}>
            <View style={[styles.deckSlot, { height: deckHeight }]}>
              {/* Render peek first, then top card (reverse so top is last = highest z) */}
              {!deckExhausted &&
                [...visibleCards].reverse().map(({ slot, idx }, i, arr) => (
                  <ProjectCard
                    key={slot.item.id}
                    project={slot.item}
                    isTop={i === arr.length - 1}
                    onSwipe={handleSwipe}
                    onOpenHelp={showSwipeHint}
                  />
                ))}

              {deckExhausted && (
                <View style={styles.endCard}>
                  <Text style={styles.endText}>No more projects!</Text>
                  <TouchableOpacity
                    style={styles.resetButton}
                    onPress={async () => {
                      try {
                        if (session?.user?.id) await deleteNonMatchedProjectLikes(session.user.id);
                        await loadBrowseProjects();
                      } catch (e: any) {
                        console.warn("Failed to reset projects feed:", e.message ?? e);
                      }
                    }}
                  >
                    <Text style={styles.resetButtonText}>Start Over</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {swipeHintVisible && !deckExhausted && (
            <Animated.View
              style={[styles.swipeHintContainer, { bottom: swipeHintBottomOffset, opacity: swipeHintOpacity, transform: [{ translateY: swipeHintTranslateY }] }]}
            >
              <View style={styles.swipeHint}>
                <View style={styles.swipeHintHeader}>
                  <Text style={styles.swipeHintTitle}>How matching works</Text>
                  <TouchableOpacity style={styles.swipeHintClose} onPress={dismissSwipeHint}>
                    <Ionicons name="close" size={18} color="#C7D1E8" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.swipeHintBody}>Swipe the card left to pass or right if you&apos;re interested.</Text>
                <View style={styles.swipeHintRow}>
                  <View style={styles.swipeHintPill}>
                    <Ionicons name="arrow-back" size={14} color="red" />
                    <Text style={styles.swipeHintPillTextMuted}>Pass</Text>
                  </View>
                  <View style={styles.swipeHintPill}>
                    <Text style={styles.swipeHintPillTextMuted}>Interested</Text>
                    <Ionicons name="arrow-forward" size={14} color="green" />
                  </View>
                </View>
                <TouchableOpacity style={styles.swipeHintDismissButton} onPress={dismissSwipeHint}>
                  <Text style={styles.swipeHintDismissText}>Got it</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        </View>
      )}

      {/* My Projects tab */}
      {tab === "mine" &&
        (myLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#79BE58" /></View>
        ) : myProjects.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ fontSize: 16, color: "#999", marginBottom: 16 }}>You haven&apos;t created any projects yet.</Text>
            <TouchableOpacity style={styles.resetButton} onPress={() => router.push("/create-project" as any)}>
              <Text style={styles.resetButtonText}>Create Your First Project</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
            {[...myProjects]
              .sort((a, b) => Number(b.is_active) - Number(a.is_active))
              .map((p) => (
                <View key={p.id} style={styles.myProjectCard}>
                  {p.image && <Image source={{ uri: p.image }} style={styles.myProjectImage} />}
                  <View style={styles.myProjectInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={styles.myProjectTitle} numberOfLines={1}>{p.title}</Text>
                      <View style={[styles.statusBadge, !p.is_active && styles.statusBadgeInactive]}>
                        <Text style={styles.statusBadgeText}>{p.is_active ? "Active" : "Paused"}</Text>
                      </View>
                    </View>
                    <Text style={styles.myProjectDesc} numberOfLines={2}>{p.description}</Text>
                    {p.skills_needed && p.skills_needed.length > 0 && (
                      <View style={[styles.chipsWrap, { justifyContent: "flex-start", marginTop: 8 }]}>
                        {p.skills_needed.slice(0, 3).map((s, i) => (
                          <View key={`${s}-${i}`} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>
                        ))}
                        {p.skills_needed.length > 3 && <Text style={{ fontSize: 12, color: "#999" }}>+{p.skills_needed.length - 3}</Text>}
                      </View>
                    )}
                    <View style={styles.myProjectActions}>
                      <TouchableOpacity onPress={() => router.push({ pathname: "/edit-project", params: { id: String(p.id) } })} style={styles.actionButton}>
                        <Ionicons name="create-outline" size={22} color="#79BE58" />
                        <Text style={styles.actionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => toggleActive(p)} style={styles.actionButton}>
                        <Ionicons name={p.is_active ? "pause-circle-outline" : "play-circle-outline"} size={22} color="#79BE58" />
                        <Text style={styles.actionText}>{p.is_active ? "Pause" : "Activate"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteProject(p)} style={styles.actionButton}>
                        <Ionicons name="trash-outline" size={22} color="#F44336" />
                        <Text style={[styles.actionText, { color: "#F44336" }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
          </ScrollView>
        ))}

      <MatchCelebrationOverlay
        accentColor="#79BE58"
        highlight={matchCelebrationTarget ?? ""}
        onHidden={() => setMatchCelebrationTarget(null)}
        surfaceColor="#E8F5E2"
        visible={matchCelebrationTarget !== null}
      />
    </SafeAreaView>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, gap: 12 },
  headerIconButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#C8E4BC",
    alignItems: "center", justifyContent: "center", shadowColor: "#7BAF6A",
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 4 },
      default: { shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12 },
    }),
  },
  headerIconButtonHidden: { opacity: 0 },
  headerTabsWrapper: { flex: 1 },
  headerTabsTrack: {
    alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#C8E4BC", borderRadius: 30, borderWidth: 1,
    flexDirection: "row", minHeight: 56, overflow: "hidden", paddingHorizontal: HEADER_TRACK_PADDING, paddingVertical: HEADER_TRACK_PADDING,
    shadowColor: "#7BAF6A",
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 18 },
      android: { elevation: 7 },
      default: { shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 18 },
    }),
  },
  headerTabsIndicator: {
    backgroundColor: "#E8F5E2", borderRadius: 24, bottom: HEADER_TRACK_PADDING, left: HEADER_TRACK_PADDING,
    position: "absolute", top: HEADER_TRACK_PADDING, shadowColor: "#7BAF6A",
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 2 },
      default: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
    }),
  },
  headerTabSegment: { alignItems: "center", flex: 1, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 44, paddingHorizontal: 10, zIndex: 1 },
  headerTabLabel: { color: "#172033", fontSize: 13, fontWeight: "700", letterSpacing: -0.1 },
  headerTabLabelActive: { color: "#5EA03E" },
  createButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#79BE58", justifyContent: "center", alignItems: "center" },
  browseLayout: { flex: 1, paddingTop: 12 },
  cardContainer: { flex: 1, justifyContent: "flex-start", alignItems: "center", paddingHorizontal: 16 },
  deckSlot: { width: DECK_CARD_WIDTH, maxWidth: 430, position: "relative", alignSelf: "center" },
  card: { position: "absolute", width: SCREEN_WIDTH * 0.9, maxWidth: 430, height: SCREEN_HEIGHT * 0.65, backgroundColor: "#fff", borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  cardSurface: { flex: 1, backgroundColor: "#fff", borderRadius: 20, overflow: "hidden" },
  cardBehind: { transform: [{ scale: 0.95 }], opacity: 0.8 },
  content: { flex: 1 },
  contentContainer: { padding: 20, paddingTop: 30, paddingBottom: 24 },
  cardHelpButton: { position: "absolute", top: 18, right: 18, zIndex: 12, width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "#E8F5E2", backgroundColor: "#E8F5E2", alignItems: "center", justifyContent: "center" },
  cardHelpButtonLabel: { color: "#79BE58", fontSize: 16, fontWeight: "700", lineHeight: 18 },
  pageHeader: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginTop: 0, marginBottom: 4 },
  projectName: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginTop: 0, marginBottom: 4 },
  location: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 20 },
  imageContainer: { width: "100%", height: 180, borderRadius: 16, overflow: "hidden", marginBottom: 20, backgroundColor: "#8FBC8F" },
  projectImage: { width: "100%", height: "100%" },
  descriptionSection: { marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "600", textAlign: "center", marginBottom: 8 },
  description: { fontSize: 14, color: "#333", lineHeight: 20, textAlign: "center" },
  likeOverlay: { position: "absolute", top: 50, right: 30, zIndex: 5, transform: [{ rotate: "20deg" }], borderWidth: 4, borderColor: "#4CAF50", borderRadius: 10, padding: 10 },
  nopeOverlay: { position: "absolute", top: 50, left: 30, zIndex: 5, transform: [{ rotate: "-20deg" }], borderWidth: 4, borderColor: "#F44336", borderRadius: 10, padding: 10 },
  overlayText: { fontSize: 32, fontWeight: "bold", color: "#4CAF50" },
  nopeOverlayText: { fontSize: 32, fontWeight: "bold", color: "#F44336" },
  swipeHintContainer: { left: 16, right: 16, position: "absolute", alignItems: "center" },
  swipeHint: { width: DECK_CARD_WIDTH, maxWidth: 430, minHeight: SWIPE_HINT_HEIGHT, borderRadius: 28, backgroundColor: "rgba(23, 32, 51, 0.94)", paddingHorizontal: 20, paddingVertical: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 6 },
  swipeHintHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 8, position: "relative" },
  swipeHintTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", textAlign: "center" },
  swipeHintClose: { position: "absolute", right: 0, top: -2, width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  swipeHintBody: { color: "#E8EEFF", fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 12 },
  swipeHintRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 14 },
  swipeHintPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  swipeHintPillTextMuted: { color: "#C7D1E8", fontSize: 12, fontWeight: "700" },
  swipeHintDismissButton: { alignSelf: "center", minWidth: 112, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: "#E8F5E2" },
  swipeHintDismissText: { color: "#79BE58", fontSize: 13, fontWeight: "700", textAlign: "center" },
  endCard: { width: DECK_CARD_WIDTH, maxWidth: 430, height: DECK_CARD_HEIGHT, ...deckCardShell, justifyContent: "center", alignItems: "center" },
  endText: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  resetButton: { backgroundColor: "#79BE58", paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 },
  resetButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  chip: { backgroundColor: "#fff", borderColor: "#ddd", borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 8 },
  chipText: { fontSize: 13, color: "#333" },
  myProjectCard: { backgroundColor: "#fff", borderRadius: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2, overflow: "hidden" },
  myProjectImage: { width: "100%", height: 140 },
  myProjectInfo: { padding: 14 },
  myProjectTitle: { fontSize: 17, fontWeight: "600", color: "#333", flex: 1, marginRight: 8 },
  myProjectDesc: { fontSize: 13, color: "#666", lineHeight: 18, marginTop: 4 },
  statusBadge: { backgroundColor: "#E8F5E9", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeInactive: { backgroundColor: "#FFF3E0" },
  statusBadgeText: { fontSize: 12, fontWeight: "600", color: "#333" },
  myProjectActions: { flexDirection: "row", marginTop: 12, gap: 16 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 13, color: "#79BE58", fontWeight: "500" },
  closeDropDownButton: { alignSelf: "flex-end", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, width: 100, height: 70, borderRadius: 25 },
  section: { marginBottom: 12 },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 20 },
  filterLabel: { fontSize: 14, color: "#333" },
});
