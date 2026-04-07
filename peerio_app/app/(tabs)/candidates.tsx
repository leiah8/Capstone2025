// app/(tabs)/candidates.tsx

/* =========================
   Imports & setup
   ========================= */
import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  LayoutChangeEvent,
  Linking,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MatchCelebrationOverlay from "../../components/MatchCelebrationOverlay";
import {
  calcDist,
  CandidateUI,
  deleteNonMatchedCandidateLikes,
  fetchCandidates,
  fetchMyCoords,
  fetchMyProjects,
  fetchSwipedCandidateIds,
  likeCandidate,
  MyProject,
} from "../../lib/candidates";
import {
  checkMatchingAPIHealth,
  getMatchedCandidates,
} from "../../lib/matching-api";
import {
  applyIncluded,
  calcDistKm,
  FeedItem,
  getNextIndex,
  getPeekIndex,
  markSwiped,
  resetSwiped,
  toFeedItems,
} from "../../lib/feed-utils";

import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MAX_DISTANCE = 5000;
const SWIPE_THRESHOLD = 120;
const DECK_CARD_WIDTH = Math.min(SCREEN_WIDTH - 32, 430);
const DECK_CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.68, 620);
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

const PREFETCH_THRESHOLD = 3;
const BATCH_SIZE = 20;
const INITIAL_BATCH_SIZE = 50;

let persistedProjectId: string | null = null;

/* =========================
   Types
   ========================= */
type Candidate = CandidateUI & {
  project_id: string;
  project_name: string;
  lat: number | null;
  lng: number | null;
};

type FilterProject = MyProject & {
  included: boolean;
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

/**
 * Per-project candidate list.
 *
 * `filteredCandidates` is a FeedItem<Candidate>[] where each slot carries:
 *   - item     : the Candidate
 *   - included : passes current filter settings
 *   - swiped   : user has already swiped this card in the current session
 *
 * `index` stores the last known deck position so we can restore it when the
 * user switches back to this project.
 */
type CandidateList = {
  fullCandidates: Candidate[];
  filteredCandidates: FeedItem<Candidate>[];
  project: FilterProject;
  index: number;
};

/* =========================
   Filter predicate (pure)
   ========================= */
function buildCandidatePredicate(opts: {
  myCoords: Coord;
  maxDist: number; // raw slider value; >= MAX_DISTANCE means "worldwide"
  showAllSkills: boolean;
  skills: FilterSkill[];
  showAllInterests: boolean;
  interests: FilterInterest[];
}): (c: Candidate) => boolean {
  const effectiveMaxDist = opts.maxDist < MAX_DISTANCE ? opts.maxDist : Infinity;
  const includedSkills = opts.skills.filter((s) => s.included).map((s) => s.name);
  const includedInterests = opts.interests.filter((i) => i.included).map((i) => i.name);

  return (c) => {
    // Distance
    const dist = calcDistKm(opts.myCoords.lat, opts.myCoords.lng, c.lat, c.lng);
    if (dist > effectiveMaxDist) return false;

    // Skills
    if (!opts.showAllSkills) {
      if (!c.skills.some((s) => includedSkills.includes(s))) return false;
    }

    // Interests
    if (!opts.showAllInterests) {
      if (!c.interests.some((i) => includedInterests.includes(i))) return false;
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
        onLayout={(e) => {
          trackWidth.current = e.nativeEvent.layout.width;
        }}
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
    position: "absolute",
    top: -9,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#79BE58",
    marginLeft: -11,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
});

/* =========================
   Link Row
   ========================= */
const LINK_ICONS: Record<string, string> = {
  github: "logo-github",
  linkedin: "logo-linkedin",
  twitter: "logo-twitter",
  instagram: "logo-instagram",
  portfolio: "globe-outline",
  other: "link-outline",
};

const LinkRow = ({ label, url }: { label: string; url?: string }) => {
  if (!url) return null;
  return (
    <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(url)}>
      <Ionicons name={LINK_ICONS[label] as any} size={16} color="#555" style={{ marginRight: 8 }} />
      <Text style={styles.linkText} numberOfLines={1}>{url}</Text>
    </TouchableOpacity>
  );
};

/* =========================
   Experience / Education / Project Blocks
   ========================= */
const ExperienceBlock = ({ item }: { item: any }) => (
  <View style={styles.timelineItem}>
    <View style={styles.timelineDot} />
    <View style={styles.timelineContent}>
      <Text style={styles.timelineTitle}>{item.position}</Text>
      <Text style={styles.timelineSubtitle}>{item.company}</Text>
      <Text style={styles.timelineMeta}>{item.duration}</Text>
      {item.description ? <Text style={styles.timelineDesc}>{item.description}</Text> : null}
    </View>
  </View>
);

const EducationBlock = ({ item }: { item: any }) => (
  <View style={styles.timelineItem}>
    <View style={styles.timelineDot} />
    <View style={styles.timelineContent}>
      <Text style={styles.timelineTitle}>{item.degree}</Text>
      <Text style={styles.timelineSubtitle}>{item.school}</Text>
      <Text style={styles.timelineMeta}>{item.year}</Text>
    </View>
  </View>
);

const ProjectBlock = ({ item }: { item: any }) => (
  <View style={styles.projectBlock}>
    <View style={styles.projectBlockHeader}>
      <Text style={styles.projectBlockName}>{item.name}</Text>
      {item.link ? (
        <TouchableOpacity onPress={() => Linking.openURL(item.link)}>
          <Ionicons name="open-outline" size={14} color="#888" />
        </TouchableOpacity>
      ) : null}
    </View>
    {item.description ? <Text style={styles.timelineDesc}>{item.description}</Text> : null}
  </View>
);

/* =========================
   Swipeable Card
   ========================= */
const CandidateCard = ({
  candidate,
  isTop,
  onSwipe,
}: {
  candidate: Candidate;
  isTop: boolean;
  onSwipe: (d: "left" | "right") => void;
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
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 8,
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

  const hasLinks = candidate.links && Object.values(candidate.links).some(Boolean);

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
          </>
        )}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
          {candidate.project_name && (
            <View style={styles.projectTagRow}>
              <View style={styles.projectTag}>
                <Ionicons name="briefcase-outline" size={11} color="#000" style={{ marginRight: 5 }} />
                <Text>{candidate.project_name}</Text>
              </View>
            </View>
          )}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              <Image source={{ uri: candidate.profile_image }} style={styles.avatar} />
            </View>
            <Text style={styles.candidateName}>{candidate.name}</Text>
            {candidate.location ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={13} color="#888" />
                <Text style={styles.locationText}>{candidate.location}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.descriptionSection}>
            <Text style={styles.description}>{candidate.bio}</Text>
          </View>
          {candidate.skills.length > 0 && (
            <View style={{ marginTop: 6, marginBottom: 20 }}>
              <Text style={styles.sectionTitle}>Skills</Text>
              <View style={styles.chipsWrap}>
                {candidate.skills.map((s, i) => (
                  <View key={`${s}-${i}`} style={styles.chip}>
                    <Text style={styles.chipText}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {candidate.interests.length > 0 && (
            <View style={{ marginTop: 6, marginBottom: 20 }}>
              <Text style={styles.sectionTitle}>Interests</Text>
              <View style={styles.chipsWrap}>
                {candidate.interests.map((s, i) => (
                  <View key={`${s}-${i}`} style={styles.chip}>
                    <Text style={styles.chipText}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {candidate.experience?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Experience</Text>
              <View style={styles.timeline}>
                {candidate.experience.map((e, i) => <ExperienceBlock key={`ex-${i}`} item={e} />)}
              </View>
            </View>
          )}
          {candidate.education?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Education</Text>
              <View style={styles.timeline}>
                {candidate.education.map((e, i) => <EducationBlock key={`ed-${i}`} item={e} />)}
              </View>
            </View>
          )}
          {candidate.personal_projects.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personal Projects</Text>
              {candidate.personal_projects.map((p, i) => <ProjectBlock key={`pp-${i}`} item={p} />)}
            </View>
          )}
          {hasLinks && (
            <View style={[styles.section, { marginBottom: 32 }]}>
              <Text style={styles.sectionTitle}>Links</Text>
              <View style={styles.linksContainer}>
                {candidate.links.github != null && <LinkRow label="github" url={candidate.links.github} />}
                {candidate.links.linkedin != null && <LinkRow label="linkedin" url={candidate.links.linkedin} />}
                {candidate.links.twitter != null && <LinkRow label="twitter" url={candidate.links.twitter} />}
                {candidate.links.instagram != null && <LinkRow label="instagram" url={candidate.links.instagram} />}
                {candidate.links.portfolio != null && <LinkRow label="portfolio" url={candidate.links.portfolio} />}
                {candidate.links.other != null && <LinkRow label="other" url={candidate.links.other} />}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Animated.View>
  );
};

/* =========================
   Matching helper
   ========================= */
async function rankCandidatesBatch(
  batch: CandidateUI[],
  userProjects: MyProject[],
  matchingAvailable: boolean,
  excludeCandidateIds?: string[],
): Promise<Candidate[]> {
  const activeProjects = userProjects.filter((p) => p.is_active);
  const fallback = (pid: string, pName: string) =>
    batch.map((c) => ({ ...c, project_id: pid, project_name: pName })) as Candidate[];

  if (!matchingAvailable || activeProjects.length === 0) {
    const p = activeProjects[0] ?? userProjects[0];
    return fallback(String(p?.id ?? ""), String(p?.title ?? ""));
  }

  try {
    const perProjectResults = await Promise.all(
      activeProjects.map((project) =>
        getMatchedCandidates(
          project,
          batch.map((c) => ({
            id: c.id, name: c.name, location: c.location, bio: c.bio,
            skills: c.skills, interests: c.interests, education: c.education,
            personal_projects: c.personal_projects, experience: c.experience,
          })),
          excludeCandidateIds,
        ).then((ranked) => ({ projectId: String(project.id), projectName: project.title, ranked })),
      ),
    );

    const allRanked = new Map<string, { candidateId: string; projectId: string; projectName: string; score: number }>();
    for (const { projectId, projectName, ranked } of perProjectResults) {
      for (const score of ranked) {
        allRanked.set(`${score.candidate_id}::${projectId}`, {
          candidateId: score.candidate_id, projectId, projectName, score: score.overall_score,
        });
      }
    }

    const outTemp: { candidate: Candidate; index: number; overallScore: number }[] = [];
    allRanked.forEach((v, _key) => {
      const candidate = batch.find((c) => c.id === v.candidateId);
      if (!candidate) return;
      const fallbackProject = activeProjects[0] ?? userProjects[0];
      outTemp.push({
        candidate: {
          ...candidate,
          project_id: v.projectId ?? String(fallbackProject?.id ?? ""),
          project_name: v.projectName ?? String(fallbackProject?.title ?? ""),
        } as Candidate,
        index: outTemp.length,
        overallScore: v.score ?? -1,
      });
    });

    return outTemp
      .sort((a, b) => b.overallScore !== a.overallScore ? b.overallScore - a.overallScore : a.index - b.index)
      .map(({ candidate }) => candidate);
  } catch (matchError) {
    console.warn("[CANDIDATES] Failed to rank candidates:", matchError);
    const p = activeProjects[0] ?? userProjects[0];
    return fallback(String(p?.id ?? ""), String(p?.title ?? ""));
  }
}

/* =========================
   Screen
   ========================= */
export default function CandidateFeed() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const browseBottomPadding = Math.max(tabBarHeight, 88) + 12;

  const { session } = useAuth();

  // ---------------------------------------------------------------------------
  // Core feed state
  // ---------------------------------------------------------------------------
  const [activeFeedItems, setActiveFeedItems] = useState<FeedItem<Candidate>[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [allCandidateLists, setAllCandidateLists] = useState<Map<string, CandidateList>>(new Map());
  const [overallCandidates, setAllCandidates] = useState<Candidate[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deckHeight, setDeckHeight] = useState(DECK_CARD_HEIGHT);
  const [matchCelebrationTarget, setMatchCelebrationTarget] = useState<string | null>(null);
  const [hasProjects, setHasProjects] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [allFetched, setAllFetched] = useState(false);

  const isFetchingMoreRef = useRef(false);
  const swipedCandidateIdsRef = useRef<string[]>([]);

  // ---------------------------------------------------------------------------
  // Filter state — "applied" (committed) vs "UI" (staged, only committed on Apply)
  // ---------------------------------------------------------------------------
  const [myCoords, setMyCoords] = useState<Coord>({ lat: null, lng: null });
  const [myProjects, setMyProjects] = useState<FilterProject[]>([]);
  const [filterSkills, setFilterSkills] = useState<FilterSkill[]>([]);
  const [showAllSkills, setShowAllSkills] = useState(true);
  const [filterInterests, setFilterInterests] = useState<FilterInterest[]>([]);
  const [showAllInterests, setShowAllInterests] = useState(true);
  const [maxFilterDist, setMaxFilterDist] = useState(MAX_DISTANCE);

  // UI (staged) copies
  const [myProjectsUI, setMyProjectsUI] = useState<FilterProject[]>([]);
  const [filterSkillsUI, setFilterSkillsUI] = useState<FilterSkill[]>([]);
  const [showAllSkillsUI, setShowAllSkillsUI] = useState(true);
  const [filterInterestsUI, setFilterInterestsUI] = useState<FilterInterest[]>([]);
  const [showAllInterestsUI, setShowAllInterestsUI] = useState(true);
  const [maxFilterDistUI, setMaxFilterDistUI] = useState(MAX_DISTANCE);

  // ---------------------------------------------------------------------------
  // applyFiltersToList — pure helper
  // ---------------------------------------------------------------------------
  const applyFiltersToList = useCallback(
    (
      list: FeedItem<Candidate>[],
      opts: {
        myCoords: Coord;
        maxDist: number;
        showAllSkills: boolean;
        skills: FilterSkill[];
        showAllInterests: boolean;
        interests: FilterInterest[];
      },
    ): { items: FeedItem<Candidate>[]; index: number } => {
      const predicate = buildCandidatePredicate(opts);
      const items = applyIncluded(list, (c) => predicate(c));
      const index = getNextIndex(items, 0);
      return { items, index };
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // switchToProject
  // ---------------------------------------------------------------------------
  const switchToProject = useCallback(
    (
      newPid: string,
      listsSnapshot: Map<string, CandidateList>,
      currentIdx: number,
    ): { newItems: FeedItem<Candidate>; newIndex: number } | null => {
      void currentIdx;
      const target = listsSnapshot.get(newPid);
      if (!target) return null;
      return { newItems: target.filteredCandidates as any, newIndex: target.index };
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // filterFetchedCandidates — FIX: compute items/index synchronously before
  // setState calls so all three updates land in the same React batch, preventing
  // the intermediate render that caused the flash.
  // ---------------------------------------------------------------------------
  const filterFetchedCandidates = useCallback(
    (pidOverride?: number) => {
      const newPidStr = pidOverride
        ? String(pidOverride)
        : myProjectsUI.find((p) => p.included)?.id
        ? String(myProjectsUI.find((p) => p.included)!.id)
        : null;

      if (!newPidStr) return;

      const isSwitchingProject =
        persistedProjectId !== null && newPidStr !== persistedProjectId;

      // ── FIX: compute the new feed items synchronously here, before any
      // setState call, so we have the correct values ready to pass directly
      // to setActiveFeedItems and setCurrentIndex in the same flush. ──
      const filterOpts = {
        myCoords,
        maxDist: maxFilterDistUI,
        showAllSkills: showAllSkillsUI,
        skills: filterSkillsUI,
        showAllInterests: showAllInterestsUI,
        interests: filterInterestsUI,
      };
      const predicate = buildCandidatePredicate(filterOpts);

      // We need the current lists snapshot to compute new items.
      // Capture it via a ref so we don't need to put allCandidateLists in deps.
      const currentLists = allCandidateListsRef.current;
      const target = currentLists.get(newPidStr);

      let newItems: FeedItem<Candidate>[] = activeFeedItems;
      let newIndex = currentIndex;

      if (target) {
        const updatedItems = applyIncluded(target.filteredCandidates, (c) => predicate(c));
        newIndex = isSwitchingProject
          ? getNextIndex(updatedItems, target.index)
          : getNextIndex(updatedItems, 0);
        newItems = updatedItems;
      }

      // Now update all state synchronously in one event-handler call — React
      // will batch these into a single commit, eliminating the flash.
      setActiveFeedItems(newItems);
      setCurrentIndex(newIndex);

      setAllCandidateLists((prevLists) => {
        const next = new Map(prevLists);

        if (isSwitchingProject && persistedProjectId) {
          const old = next.get(persistedProjectId);
          if (old) {
            next.set(persistedProjectId, { ...old, index: currentIndex });
          }
        }

        persistedProjectId = newPidStr;

        const t = next.get(newPidStr);
        if (!t) return prevLists;

        const updatedItems = applyIncluded(t.filteredCandidates, (c) => predicate(c));
        const updatedIndex = isSwitchingProject
          ? getNextIndex(updatedItems, t.index)
          : getNextIndex(updatedItems, 0);

        next.set(newPidStr, {
          ...t,
          filteredCandidates: updatedItems,
          index: updatedIndex,
        });

        return next;
      });

      // Commit filter settings
      setMyProjects(myProjectsUI);
      setFilterSkills(filterSkillsUI);
      setShowAllSkills(showAllSkillsUI);
      setFilterInterests(filterInterestsUI);
      setShowAllInterests(showAllInterestsUI);
      setMaxFilterDist(maxFilterDistUI);
    },
    [
      myProjectsUI, filterSkillsUI, showAllSkillsUI, filterInterestsUI,
      showAllInterestsUI, maxFilterDistUI, myCoords, currentIndex,
      activeFeedItems,
    ],
  );

  // Ref that always holds the latest allCandidateLists so filterFetchedCandidates
  // can read it synchronously without adding it to its dependency array.
  const allCandidateListsRef = useRef<Map<string, CandidateList>>(new Map());
  useEffect(() => {
    allCandidateListsRef.current = allCandidateLists;
  }, [allCandidateLists]);

  // ---------------------------------------------------------------------------
  // loadCandidates — initial + refresh load
  // ---------------------------------------------------------------------------
  const loadCandidates = useCallback(
    async (startingOver?: boolean) => {
      try {
        setLoading(true);
        setAllCandidates([]);
        setActiveFeedItems([]);
        setAllFetched(false);
        isFetchingMoreRef.current = false;

        const userProjects = await fetchMyProjects(session?.user?.id);

        if (!persistedProjectId && userProjects.length > 0) {
          persistedProjectId = null;
        }

        const tempProjects: FilterProject[] = userProjects.map((p) => ({
          ...p,
          included: String(p.id) === persistedProjectId,
        }));

        setMyProjects(tempProjects);
        setMyProjectsUI(tempProjects);

        const oneActive = userProjects.length > 0;
        setHasProjects(oneActive);

        if (!oneActive) return;

        const coords = await fetchMyCoords(session?.user?.id);
        setMyCoords(coords);

        const allSkillsSet = new Set<string>();
        const allInterestsSet = new Set<string>();
        userProjects.forEach((p) => {
          (p.skills_needed ?? []).forEach((s) => allSkillsSet.add(s));
          (p.tags ?? []).forEach((t) => allInterestsSet.add(t));
        });
        const initSkills: FilterSkill[] = Array.from(allSkillsSet).map((s) => ({ name: s, included: true }));
        const initInterests: FilterInterest[] = Array.from(allInterestsSet).map((t) => ({ name: t, included: true }));

        setFilterSkills(initSkills);
        setFilterSkillsUI(initSkills);
        setFilterInterests(initInterests);
        setFilterInterestsUI(initInterests);
        setShowAllSkills(true);
        setShowAllSkillsUI(true);
        setShowAllInterests(true);
        setShowAllInterestsUI(true);

        swipedCandidateIdsRef.current = session?.user?.id
          ? await fetchSwipedCandidateIds(session.user.id)
          : [];

        const allCandidates = await fetchCandidates(
          INITIAL_BATCH_SIZE, session?.user?.id, swipedCandidateIdsRef.current,
        );

        const matchingAvailable = await checkMatchingAPIHealth();
        const ranked = await rankCandidatesBatch(
          allCandidates, userProjects, matchingAvailable, swipedCandidateIdsRef.current,
        );
        setAllCandidates(ranked);

        const buildList = (proj: FilterProject, candidates: Candidate[]): CandidateList => {
          let pCandidates = candidates.filter((c) => c.project_id === String(proj.id));
          if (pCandidates.length === 0 && String(proj.id) === persistedProjectId) {
            pCandidates = candidates;
          }
          const feedItems = toFeedItems(pCandidates);
          return { fullCandidates: pCandidates, filteredCandidates: feedItems, project: proj, index: 0 };
        };

        if (startingOver) {
          const proj = tempProjects.find((p) => String(p.id) === persistedProjectId);
          if (proj) {
            const list = buildList(proj, ranked);
            const startIdx = getNextIndex(list.filteredCandidates, 0);
            setAllCandidateLists((prev) => new Map(prev).set(String(proj.id), { ...list, index: startIdx }));
            setActiveFeedItems(list.filteredCandidates);
            setCurrentIndex(startIdx);
          }
        } else {
          const allLists = new Map<string, CandidateList>();
          tempProjects.forEach((proj) => {
            const list = buildList(proj, ranked);
            allLists.set(String(proj.id), list);
            if (persistedProjectId === String(proj.id)) {
              const startIdx = getNextIndex(list.filteredCandidates, 0);
              setActiveFeedItems(list.filteredCandidates);
              setCurrentIndex(startIdx);
            }
          });
          setAllCandidateLists(allLists);
        }

        if (allCandidates.length < INITIAL_BATCH_SIZE) setAllFetched(true);
      } catch (e: any) {
        setErr(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    },
    [session?.user?.id],
  );

  // ---------------------------------------------------------------------------
  // refreshProjectMetadata — lightweight focus refresh.
  // Re-fetches project data from the server and patches ALL changed fields
  // (title, skills_needed, tags, description, is_active, etc.) into:
  //   • myProjects / myProjectsUI  — filter UI project list
  //   • filterSkills / filterSkillsUI  — rebuilt from updated skills_needed
  //   • filterInterests / filterInterestsUI — rebuilt from updated tags
  //   • allCandidateLists + activeFeedItems — project_name on every card
  //
  // myProjectsUI preserves the user's staged `included` selection so any
  // in-progress filter panel changes aren't clobbered.
  // Does NOT trigger a full candidate re-fetch or re-rank.
  // ---------------------------------------------------------------------------
  const refreshProjectMetadata = useCallback(async () => {
    try {
      const userProjects = await fetchMyProjects(session?.user?.id);
      if (userProjects.length === 0) return;

      // If a new project was created since we last loaded, do a full reload
      // so the new project gets its own candidate list built properly.
      const currentLists = allCandidateListsRef.current;
      const hasNewProject = userProjects.some((p) => !currentLists.has(String(p.id)));
      if (hasNewProject) {
        void loadCandidates();
        return;
      }

      // Build a full project lookup by id
      const projectById = new Map<string, MyProject>(
        userProjects.map((p) => [String(p.id), p]),
      );

      // 1. Patch myProjects — replace all server-owned fields, keep `included`
      const nextMyProjects: FilterProject[] = userProjects.map((p) => {
        const existing = allCandidateListsRef.current.get(String(p.id))?.project;
        return { ...p, included: existing?.included ?? (String(p.id) === persistedProjectId) };
      });
      setMyProjects(nextMyProjects);

      // 2. Patch myProjectsUI — preserve the user's current staged `included`
      //    selection but update every other field so the panel shows fresh data.
      setMyProjectsUI((prevUI) => {
        const includedById = new Map(prevUI.map((p) => [String(p.id), p.included]));
        return userProjects.map((p) => ({
          ...p,
          // Keep whatever the user had staged; fall back to persisted selection
          included: includedById.get(String(p.id)) ?? (String(p.id) === persistedProjectId),
        }));
      });

      // 3. Rebuild filterSkills / filterSkillsUI from the updated projects.
      //    Preserve `included` for skills that still exist; new skills default to true.
      const allSkillsSet = new Set<string>();
      const allInterestsSet = new Set<string>();
      userProjects.forEach((p) => {
        (p.skills_needed ?? []).forEach((s) => allSkillsSet.add(s));
        (p.tags ?? []).forEach((t) => allInterestsSet.add(t));
      });

      setFilterSkills((prevSkills) => {
        const prevMap = new Map(prevSkills.map((s) => [s.name, s.included]));
        return Array.from(allSkillsSet).map((name) => ({
          name,
          included: prevMap.get(name) ?? true,
        }));
      });
      setFilterSkillsUI((prevSkills) => {
        const prevMap = new Map(prevSkills.map((s) => [s.name, s.included]));
        return Array.from(allSkillsSet).map((name) => ({
          name,
          included: prevMap.get(name) ?? true,
        }));
      });

      setFilterInterests((prevInterests) => {
        const prevMap = new Map(prevInterests.map((i) => [i.name, i.included]));
        return Array.from(allInterestsSet).map((name) => ({
          name,
          included: prevMap.get(name) ?? true,
        }));
      });
      setFilterInterestsUI((prevInterests) => {
        const prevMap = new Map(prevInterests.map((i) => [i.name, i.included]));
        return Array.from(allInterestsSet).map((name) => ({
          name,
          included: prevMap.get(name) ?? true,
        }));
      });

      // 4. Patch project_name on every Candidate so card headers reflect the
      //    new title, and patch the embedded project object in each CandidateList.
      const patchCandidate = (c: Candidate): Candidate => {
        const updated = projectById.get(c.project_id);
        return updated && updated.title !== c.project_name
          ? { ...c, project_name: updated.title }
          : c;
      };
      const patchFeedItems = (items: FeedItem<Candidate>[]): FeedItem<Candidate>[] =>
        items.map((fi) => {
          const patched = patchCandidate(fi.item);
          return patched !== fi.item ? { ...fi, item: patched } : fi;
        });

      setActiveFeedItems((prev) => patchFeedItems(prev));

      setAllCandidateLists((prev) => {
        let changed = false;
        const next = new Map(prev);
        next.forEach((list, pid) => {
          const updatedProject = projectById.get(pid);
          const patchedFull = list.fullCandidates.map(patchCandidate);
          const patchedFiltered = patchFeedItems(list.filteredCandidates);
          // Merge ALL server fields into the stored project, keep `included`
          const patchedProject: FilterProject = updatedProject
            ? { ...updatedProject, included: list.project.included }
            : list.project;
          const didChange =
            patchedFull.some((c, i) => c !== list.fullCandidates[i]) ||
            patchedFiltered.some((fi, i) => fi !== list.filteredCandidates[i]) ||
            patchedProject !== list.project;
          if (didChange) {
            changed = true;
            next.set(pid, {
              ...list,
              fullCandidates: patchedFull,
              filteredCandidates: patchedFiltered,
              project: patchedProject,
            });
          }
        });
        return changed ? next : prev;
      });
    } catch (e) {
      console.warn("[refreshProjectMetadata] failed:", e);
    }
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      // On first mount (no candidates loaded yet) do the full expensive load.
      // On subsequent focuses (returning from edit-project, etc.) only refresh
      // project metadata — fast and non-disruptive to the existing feed.
      if (allCandidateListsRef.current.size === 0) {
        void loadCandidates();
      } else {
        void refreshProjectMetadata();
      }
    }, [loadCandidates, refreshProjectMetadata]),
  );

  useEffect(() => {
    isFetchingMoreRef.current = false;
    swipedCandidateIdsRef.current = [];
    setActiveFeedItems([]);
    setAllCandidates([]);
    setCurrentIndex(0);
    persistedProjectId = null;
    setAllFetched(false);
    setErr(null);
  }, [session?.user?.id]);

  // ---------------------------------------------------------------------------
  // fetchMore — incremental load when deck is running low
  // ---------------------------------------------------------------------------
  const fetchMore = async () => {
    if (isFetchingMoreRef.current || allFetched || !session?.user?.id || !hasProjects) return;
    isFetchingMoreRef.current = true;
    setIsFetchingMore(true);
    try {
      const excludeList = Array.from(
        new Set([...overallCandidates.map((c) => c.id), ...swipedCandidateIdsRef.current]),
      );
      const newBatch = await fetchCandidates(BATCH_SIZE, session.user.id, excludeList);
      if (newBatch.length === 0) { setAllFetched(true); return; }
      if (newBatch.length < BATCH_SIZE) setAllFetched(true);

      const matchingAvailable = await checkMatchingAPIHealth();
      const includedProjects = myProjects.filter((p) => p.included);
      const ranked = await rankCandidatesBatch(newBatch, includedProjects, matchingAvailable, swipedCandidateIdsRef.current);

      setAllCandidates((prev) => [...prev, ...ranked]);

      if (persistedProjectId) {
        const newItems = toFeedItems(ranked.filter((c) => c.project_id === persistedProjectId));
        setActiveFeedItems((prev) => [...prev, ...newItems]);
        setAllCandidateLists((prev) => {
          const next = new Map(prev);
          const existing = next.get(persistedProjectId!);
          if (existing) {
            next.set(persistedProjectId!, {
              ...existing,
              fullCandidates: [...existing.fullCandidates, ...newItems.map((i) => i.item)],
              filteredCandidates: [...existing.filteredCandidates, ...newItems],
            });
          }
          return next;
        });
      }
    } catch (e: any) {
      console.warn("Failed to fetch more candidates:", e.message ?? e);
    } finally {
      isFetchingMoreRef.current = false;
      setIsFetchingMore(false);
    }
  };

  // ---------------------------------------------------------------------------
  // advance
  // ---------------------------------------------------------------------------
  const advance = useCallback((fromIndex: number, list: FeedItem<Candidate>[]) => {
    const next = getNextIndex(list, fromIndex + 1);
    setCurrentIndex(next);
    if (persistedProjectId) {
      setAllCandidateLists((prev) => {
        const m = new Map(prev);
        const entry = m.get(persistedProjectId!);
        if (entry) m.set(persistedProjectId!, { ...entry, index: next });
        return m;
      });
    }
  }, []);

  // ---------------------------------------------------------------------------
  // handleSwipe
  // ---------------------------------------------------------------------------
  const handleSwipe = async (direction: "left" | "right") => {
    const slot = activeFeedItems[currentIndex];
    if (!slot) return;

    const updatedItems = markSwiped(activeFeedItems, currentIndex);
    setActiveFeedItems(updatedItems);

    if (persistedProjectId) {
      setAllCandidateLists((prev) => {
        const m = new Map(prev);
        const entry = m.get(persistedProjectId!);
        if (entry) {
          m.set(persistedProjectId!, { ...entry, filteredCandidates: updatedItems });
        }
        return m;
      });
    }

    advance(currentIndex, updatedItems);

    const remaining = updatedItems.slice(currentIndex + 1).filter((i) => i.included && !i.swiped).length;
    if (remaining <= PREFETCH_THRESHOLD) void fetchMore();

    if (!session?.user?.id) return;
    try {
      const matchResult = await likeCandidate(
        session.user.id,
        slot.item.project_id,
        slot.item.id,
        direction === "right" ? "like" : "pass",
      );
      if (matchResult?.match) {
        setMatchCelebrationTarget(slot.item.name);
        setActiveFeedItems((prev) =>
          prev.map((fi) => fi.item.id === slot.item.id ? { ...fi, included: false } : fi),
        );
        setAllCandidateLists((prev) => {
          const m = new Map(prev);
          m.forEach((list, pid) => {
            m.set(pid, {
              ...list,
              filteredCandidates: list.filteredCandidates.map((fi) =>
                fi.item.id === slot.item.id ? { ...fi, included: false } : fi,
              ),
            });
          });
          return m;
        });
      }
    } catch (e: any) {
      console.warn("Failed to record candidate like:", e.message ?? e);
    }
  };

  const handleDeckLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.max(event.nativeEvent.layout.height, DECK_CARD_HEIGHT);
    setDeckHeight((h) => Math.abs(h - nextHeight) > 1 ? nextHeight : h);
  };

  // ---------------------------------------------------------------------------
  // Derive top two visible cards for the deck
  // ---------------------------------------------------------------------------
  const topIndex = currentIndex < activeFeedItems.length
    ? activeFeedItems[currentIndex].included && !activeFeedItems[currentIndex].swiped
      ? currentIndex
      : getNextIndex(activeFeedItems, currentIndex)
    : activeFeedItems.length;

  const peekIndex = topIndex < activeFeedItems.length
    ? getPeekIndex(activeFeedItems, topIndex)
    : activeFeedItems.length;

  const visibleCards: { slot: FeedItem<Candidate>; idx: number }[] = [];
  if (topIndex < activeFeedItems.length) visibleCards.push({ slot: activeFeedItems[topIndex], idx: topIndex });
  if (peekIndex < activeFeedItems.length) visibleCards.push({ slot: activeFeedItems[peekIndex], idx: peekIndex });
  const deckExhausted = topIndex >= activeFeedItems.length;

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#79BE58" />
        <Text style={{ margin: 20, color: "#999" }}>Loading candidates...</Text>
      </View>
    );
  if (err)
    return (
      <View style={styles.center}>
        <Text>Failed to load candidates: {err}</Text>
      </View>
    );

  return hasProjects ? (
    dropdownOpen ? (
      /* ================================================================
         FILTER PANEL
         ================================================================ */
      <ScrollView style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={{ marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 20 }}>
          <Text style={styles.pageHeader}>Filter Candidates</Text>
          <TouchableOpacity
            style={styles.closeDropDownButton}
            onPress={() => {
              setDropdownOpen(false);
              setMyProjectsUI(myProjects);
              setFilterSkillsUI(filterSkills);
              setShowAllSkillsUI(showAllSkills);
              setFilterInterestsUI(filterInterests);
              setShowAllInterestsUI(showAllInterests);
              setMaxFilterDistUI(maxFilterDist);
            }}
          >
            <Ionicons name="close" size={35} color="000" />
          </TouchableOpacity>
        </View>

        {/* Location */}
        {myCoords.lat && myCoords.lng && (
          <View>
            <Text style={styles.sectionTitle}>Location</Text>
            <LocationSlider min={0} max={MAX_DISTANCE} value={maxFilterDistUI} onValueChange={setMaxFilterDistUI} />
            <Text style={{ textAlign: "center", color: "#888", fontSize: 13 }}>
              {maxFilterDistUI >= MAX_DISTANCE ? "Worldwide" : `${maxFilterDistUI}km`}
            </Text>
          </View>
        )}

        {/* Projects */}
        {myProjectsUI.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My Projects</Text>
            {myProjectsUI.map((p, i) => (
              <TouchableOpacity
                key={p.id}
                style={styles.filterRow}
                onPress={() => setMyProjectsUI((prev) => prev.map((proj, j) => ({ ...proj, included: j === i })))}
              >
                <Ionicons name={p.included ? "checkmark-circle" : "ellipse-outline"} size={20} color="#333" />
                <Text style={styles.filterLabel}>{p.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Skills */}
        {filterSkillsUI.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <TouchableOpacity
              style={styles.filterRow}
              onPress={() => {
                setShowAllSkillsUI((v) => !v);
                if (!showAllSkillsUI) setFilterSkillsUI((prev) => prev.map((s) => ({ ...s, included: true })));
              }}
            >
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

        {/* Interests */}
        {filterInterestsUI.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <TouchableOpacity
              style={styles.filterRow}
              onPress={() => {
                setShowAllInterestsUI((v) => !v);
                if (!showAllInterestsUI) setFilterInterestsUI((prev) => prev.map((it) => ({ ...it, included: true })));
              }}
            >
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
            onPress={() => { setDropdownOpen(false); filterFetchedCandidates(); }}
          >
            <Text style={styles.resetButtonText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    ) : (
      /* ================================================================
         MAIN FEED
         ================================================================ */
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Filter button */}
        <View>
          <TouchableOpacity style={styles.headerIconButton} onPress={() => setDropdownOpen(true)}>
            <Ionicons name="filter" size={30} color="000" />
          </TouchableOpacity>
        </View>

        <View style={[styles.browseLayout, { paddingBottom: browseBottomPadding }]}>
          <View style={styles.cardContainer} onLayout={handleDeckLayout}>
            <View style={[styles.deckSlot, { height: deckHeight }]}>
              {!deckExhausted &&
                [...visibleCards].reverse().map(({ slot, idx }, i, arr) => (
                  <CandidateCard
                    key={`${slot.item.id}-${slot.item.project_id}`}
                    candidate={slot.item}
                    isTop={i === arr.length - 1}
                    onSwipe={handleSwipe}
                  />
                ))}

              {deckExhausted &&
                (isFetchingMore ? (
                  <View style={styles.endCard}>
                    <ActivityIndicator size="large" color="#79BE58" />
                    <Text style={{ marginTop: 16, color: "#999" }}>Finding more candidates...</Text>
                  </View>
                ) : (
                  <View style={styles.endCard}>
                    <Text style={styles.endText}>{"You've seen everyone!"}</Text>
                    <TouchableOpacity
                      style={styles.resetButton}
                      onPress={async () => {
                        try {
                          if (session?.user?.id) {
                            await deleteNonMatchedCandidateLikes(session.user.id, Number(persistedProjectId));
                          }
                          await loadCandidates(true);
                        } catch (e: any) {
                          console.warn("Failed to reset candidates feed:", e.message ?? e);
                        }
                      }}
                    >
                      <Text style={styles.resetButtonText}>Start Over</Text>
                    </TouchableOpacity>
                    <Text style={styles.endSubtext}>Or edit your filter settings</Text>
                  </View>
                ))}
            </View>
          </View>
        </View>

        <MatchCelebrationOverlay
          accentColor="#79BE58"
          highlight={matchCelebrationTarget ?? ""}
          onHidden={() => setMatchCelebrationTarget(null)}
          surfaceColor="#E8F5E2"
          visible={matchCelebrationTarget !== null}
        />

        {/* Project picker modal */}
        {persistedProjectId == null && myProjects.length > 0 && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.pageHeader}>Choose a Project</Text>
              <Text style={{ color: "#888", textAlign: "center", marginBottom: 16, fontSize: 14 }}>
                Select a project to browse candidates for
              </Text>
              {myProjects.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.filterRow}
                  onPress={() => {
                    const newProjects = myProjects.map((proj, j) =>
                      j === i ? { ...proj, included: true } : { ...proj, included: false }
                    );
                    setMyProjects(newProjects);
                    setMyProjectsUI(newProjects);
                    persistedProjectId = String(p.id);
                    filterFetchedCandidates(p.id);
                  }}
                >
                  <Ionicons name="ellipse-outline" size={20} color="#333" />
                  <Text style={styles.filterLabel}>{p.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    )
  ) : (
    <View style={[styles.center, { backgroundColor: "#fff" }]}>
      <Text style={{ fontSize: 16, color: "#999", marginBottom: 16, width: "75%", textAlign: "center" }}>
        You must have an active project to browse candidates.
      </Text>
      <TouchableOpacity style={styles.resetButton} onPress={() => router.push("/create-project" as any)}>
        <Text style={styles.resetButtonText}>Create Your First Project</Text>
      </TouchableOpacity>
    </View>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: "#fff" },
  browseLayout: { flex: 1, paddingTop: 12 },
  cardContainer: { flex: 1, justifyContent: "flex-start", alignItems: "center", paddingHorizontal: 16 },
  deckSlot: { width: DECK_CARD_WIDTH, maxWidth: 430, position: "relative", alignSelf: "center" },
  card: { ...StyleSheet.absoluteFillObject, ...deckCardShell },
  cardSurface: { flex: 1, backgroundColor: "#fff", borderRadius: 20, overflow: "hidden" },
  cardBehind: { transform: [{ scale: 0.95 }], opacity: 0.8 },
  targetIcon: { position: "absolute", top: -5, right: -5, backgroundColor: "#fff", borderRadius: 15, padding: 3 },
  targetOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#333", justifyContent: "center", alignItems: "center" },
  targetInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#333" },
  content: { flex: 1 },
  contentContainer: { padding: 20, paddingTop: 30, paddingBottom: 24 },
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
  endCard: { ...StyleSheet.absoluteFillObject, ...deckCardShell, justifyContent: "center", alignItems: "center" },
  endText: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  endSubtext: { paddingVertical: 10, fontSize: 16, color: "#999", marginBottom: 16, width: "75%", textAlign: "center" },
  resetButton: { backgroundColor: "#79BE58", paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 },
  resetButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  chip: { backgroundColor: "#fff", borderColor: "#ddd", borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 8 },
  chipText: { fontSize: 13, color: "#333" },
  section: { marginBottom: 12 },
  avatarSection: { alignItems: "center", paddingTop: 32, paddingBottom: 20, paddingHorizontal: 24 },
  avatarWrapper: { width: 88, height: 88, borderRadius: 44, overflow: "hidden", borderWidth: 2, borderColor: "#fff", marginBottom: 14, elevation: 3 },
  avatar: { width: "100%", height: "100%" },
  pageHeader: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginTop: 0, marginBottom: 4 },
  candidateName: { fontSize: 26, fontWeight: "700", color: "#1A1A1A", letterSpacing: 0.3, textAlign: "center", marginBottom: 6 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 13, color: "#888", letterSpacing: 0.2 },
  timeline: { paddingLeft: 4, marginBottom: 4 },
  timelineItem: { flexDirection: "row", marginBottom: 16, alignItems: "flex-start" },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#1A1A1A", marginTop: 5, marginRight: 14, flexShrink: 0 },
  timelineContent: { flex: 1 },
  timelineTitle: { fontSize: 14, fontWeight: "700", color: "#1A1A1A", marginBottom: 2 },
  timelineSubtitle: { fontSize: 13, color: "#555", marginBottom: 1, fontWeight: "500" },
  timelineMeta: { fontSize: 11, color: "#AAA", letterSpacing: 0.5, marginBottom: 5 },
  timelineDesc: { fontSize: 13, color: "#666", lineHeight: 19 },
  projectBlock: { backgroundColor: "#f5f5f5", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#f5f5f5" },
  projectBlockHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  projectBlockName: { fontSize: 14, fontWeight: "700", flex: 1, marginRight: 8 },
  linksContainer: { gap: 10 },
  linkRow: { flexDirection: "row", alignItems: "center" },
  linkText: { fontSize: 12, color: "#666", flex: 1 },
  projectTagRow: { alignItems: "flex-start", marginBottom: 8 },
  projectTag: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5f5f5", borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12, alignSelf: "flex-start" },
  headerIconButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#C8E4BC",
    alignItems: "center", justifyContent: "center", shadowColor: "#7BAF6A", marginLeft: 15,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 4 },
      default: { shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12 },
    }),
  },
  closeDropDownButton: { alignSelf: "flex-end", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, width: 100, height: 70, borderRadius: 25 },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 20 },
  filterLabel: { fontSize: 14, color: "#333" },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
});
