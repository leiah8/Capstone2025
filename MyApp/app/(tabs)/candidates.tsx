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
  CandidateUI,
  fetchCandidates,
  fetchMyProjects,
  likeCandidate,
  MyProject,
} from "../../lib/candidates";
import {
  checkMatchingAPIHealth,
  getMatchedCandidates,
} from "../../lib/matching-api";

import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../contexts/AuthContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
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

const PREFETCH_THRESHOLD = 3;    // fetch more when this many cards remain
const BATCH_SIZE = 20;            // candidates per incremental fetch
const INITIAL_BATCH_SIZE = 50;   // candidates fetched on first load

/* =========================
   Types (make skills optional & flexible)
   ========================= */
type Candidate = CandidateUI & {
  project_id: string;
  project_name: string;
};

type FilterProject = MyProject & {
  included: boolean;
};

type FilterSkill = {
  name: string;
  included: boolean;
};

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
    <TouchableOpacity
      style={styles.linkRow}
      onPress={() => Linking.openURL(url)}
    >
      <Ionicons
        name={LINK_ICONS[label] as any}
        size={16}
        color="#555"
        style={{ marginRight: 8 }}
      />
      <Text style={styles.linkText} numberOfLines={1}>
        {url}
      </Text>
    </TouchableOpacity>
  );
};

/* =========================
   Experience Block
   ========================= */
const ExperienceBlock = ({ item }: { item: any }) => (
  <View style={styles.timelineItem}>
    <View style={styles.timelineDot} />
    <View style={styles.timelineContent}>
      <Text style={styles.timelineTitle}>{item.position}</Text>
      <Text style={styles.timelineSubtitle}>{item.company}</Text>
      <Text style={styles.timelineMeta}>{item.duration}</Text>
      {item.description ? (
        <Text style={styles.timelineDesc}>{item.description}</Text>
      ) : null}
    </View>
  </View>
);

/* =========================
   Education Block
   ========================= */
const EducationBlock = ({ item }: { item: any }) => (
  <View style={styles.timelineItem}>
    <View style={[styles.timelineDot]} />
    <View style={styles.timelineContent}>
      <Text style={styles.timelineTitle}>{item.degree}</Text>
      <Text style={styles.timelineSubtitle}>{item.school}</Text>
      <Text style={styles.timelineMeta}>{item.year}</Text>
    </View>
  </View>
);

/* =========================
   Project Block
   ========================= */
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
    {item.description ? (
      <Text style={styles.timelineDesc}>{item.description}</Text>
    ) : null}
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

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ["-10deg", "0deg", "10deg"],
    extrapolate: "clamp",
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // const panResponder = useRef(
  //   PanResponder.create({
  //     onStartShouldSetPanResponder: () => true,
  //     onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: g.dy }),
  //     onPanResponderRelease: (_, g) => {
  //       if (g.dx > SWIPE_THRESHOLD) swipeRight();
  //       else if (g.dx < -SWIPE_THRESHOLD) swipeLeft();
  //       else resetPosition();
  //     },
  //   }),
  // ).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        const { dx, dy } = g;
        // Only hijack the gesture if horizontal movement is dominant
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8;
      },
      onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: 0 }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) swipeRight();
        else if (g.dx < -SWIPE_THRESHOLD) swipeLeft();
        else resetPosition();
      },
    }),
  ).current;

  const swipeRight = () => {
    Animated.timing(position, {
      toValue: { x: SCREEN_WIDTH + 100, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      onSwipe("right");
      position.setValue({ x: 0, y: 0 });
    });
  };
  const swipeLeft = () => {
    Animated.timing(position, {
      toValue: { x: -SCREEN_WIDTH - 100, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      onSwipe("left");
      position.setValue({ x: 0, y: 0 });
    });
  };
  const resetPosition = () =>
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  const hasLinks =
    candidate.links && Object.values(candidate.links).some(Boolean);

  // unify skills source (supports either shape)
  //   const skills = candidate.skills
  // candidate.skills && candidate.skills.length > 0
  //   ? candidate.skills
  //   : (candidate.skills?.map(s => s.name) ?? []);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [{ translateX: position.x }, { rotate }],
        },
        !isTop && styles.cardBehind,
      ]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      <View style={styles.cardSurface}>
        {isTop && (
          <>
            <Animated.View
              style={[styles.likeOverlay, { opacity: likeOpacity }]}
            >
              <Text style={styles.overlayText}>INTERESTED</Text>
            </Animated.View>
            <Animated.View
              style={[styles.nopeOverlay, { opacity: nopeOpacity }]}
            >
              <Text style={styles.nopeOverlayText}>PASS</Text>
            </Animated.View>
          </>
        )}

        {/* Content */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* TAGS SECTION */}
          {candidate.project_name && (
            <View style={styles.projectTagRow}>
              <View style={styles.projectTag}>
                <Ionicons
                  name="briefcase-outline"
                  size={11}
                  color="#000"
                  style={{ marginRight: 5 }}
                />
                <Text>{candidate.project_name}</Text>
              </View>
            </View>
          )}

          {/* ── Hero Header ── */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              <Image
                source={{ uri: candidate.profile_image }}
                style={styles.avatar}
              />
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
                {candidate.experience.map((e, i) => (
                  <ExperienceBlock key={`ex-${i}`} item={e} />
                ))}
              </View>
            </View>
          )}

          {candidate.education?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Education</Text>
              <View style={styles.timeline}>
                {candidate.education.map((e, i) => (
                  <EducationBlock key={`ed-${i}`} item={e} />
                ))}
              </View>
            </View>
          )}

          {candidate.personal_projects.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personal Projects</Text>
              {candidate.personal_projects.map((p, i) => (
                <ProjectBlock key={`pp-${i}`} item={p} />
              ))}
            </View>
          )}

          {hasLinks && (
            <View style={[styles.section, { marginBottom: 32 }]}>
              <Text style={styles.sectionTitle}>Links</Text>
              <View style={styles.linksContainer}>
                {candidate.links.github != null && (
                  <LinkRow label="github" url={candidate.links.github} />
                )}
                {candidate.links.linkedin != null && (
                  <LinkRow label="linkedin" url={candidate.links.linkedin} />
                )}
                {candidate.links.twitter != null && (
                  <LinkRow label="twitter" url={candidate.links.twitter} />
                )}
                {candidate.links.instagram != null && (
                  <LinkRow label="instagram" url={candidate.links.instagram} />
                )}
                {candidate.links.portfolio != null && (
                  <LinkRow label="portfolio" url={candidate.links.portfolio} />
                )}
                {candidate.links.other != null && (
                  <LinkRow label="other" url={candidate.links.other} />
                )}
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
): Promise<Candidate[]> {
  const activeProjects = userProjects.filter((p) => p.is_active);
  const fallback = (pid: string, pName: string) =>
    batch.map((c) => ({ ...c, project_id: pid, project_name: pName })) as Candidate[];

  if (!matchingAvailable || activeProjects.length === 0) {
    const p = activeProjects[0] ?? userProjects[0];
    return fallback(String(p?.id ?? ""), String(p?.title ?? ""));
  }

  try {
    const results = await Promise.all(
      activeProjects.map(async (p) => {
        const matches = await getMatchedCandidates(p, batch);
        return matches.map((m) => ({ ...m, project_id: String(p.id) }));
      }),
    );

    const bestMatchMap = new Map<string, (typeof results)[number][number]>();
    for (const match of results.flat()) {
      const existing = bestMatchMap.get(match.candidate_id);
      if (!existing || match.overall_score > existing.overall_score) {
        bestMatchMap.set(match.candidate_id, match);
      }
    }

    const scoreMap = new Map(
      Array.from(bestMatchMap.values()).map((m) => [m.candidate_id, m.overall_score]),
    );

    return [...batch]
      .sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0))
      .map((c) => {
        const match = bestMatchMap.get(c.id);
        const pid = match?.project_id ?? "";
        const project = activeProjects.find((p) => String(p.id) === pid);
        return { ...c, project_id: pid, project_name: project?.title ?? "" };
      }) as Candidate[];
  } catch (matchError) {
    console.warn("Failed to rank candidates, using default order:", matchError);
    const p = activeProjects[0] ?? userProjects[0];
    return fallback(String(p?.id ?? ""), String(p?.title ?? ""));
  }
}

/* =========================
   Screen: fetch & swipe stack
   ========================= */
export default function CandidateFeed() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const browseBottomPadding = Math.max(tabBarHeight, 88) + 12;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [overallCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deckHeight, setDeckHeight] = useState(DECK_CARD_HEIGHT);
  const [matchCelebrationTarget, setMatchCelebrationTarget] = useState<
    string | null
  >(null);

  const [hasProjects, setHasProjects] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [myProjects, setMyProjects] = useState<FilterProject[]>([]);
  const [filterSkills, setFilterSkills] = useState<FilterSkill[]>([]);
  const [showAllSkills, setShowAllSkills] = useState<boolean>(true);
  const { session } = useAuth();

  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [allFetched, setAllFetched] = useState(false);
  const isFetchingMoreRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const filterFetchedCandidates = () => {
    let filteredCandidates: Candidate[] = [];
    const pids = myProjects.filter((p) => p.included).map((p) => p.id);

    if (showAllSkills) {
      overallCandidates.forEach((c) => {
        if (pids.includes(Number(c.project_id))) {
          filteredCandidates.push(c);
        }
      });
    } else {
      const skills = filterSkills.filter((s) => s.included).map((s) => s.name);

      overallCandidates.forEach((c) => {
        if (pids.includes(Number(c.project_id))) {
          if (!showAllSkills) {
            const intersection = c.skills.filter((x) => skills.includes(x));
            if (intersection.length > 0) {
              filteredCandidates.push(c);
            }
          } else {
            filteredCandidates.push(c);
          }
        }
      });
    }

    setCandidates(filteredCandidates);
  };

  useFocusEffect(
    useCallback(() => {
      // Only run the initial load once per session — re-focusing the tab
      // should not reset the feed or show the same candidates again.
      if (hasLoadedRef.current) return;
      hasLoadedRef.current = true;

      let alive = true;
      (async () => {
        try {
          setLoading(true);

          const userProjects = await fetchMyProjects(session?.user?.id);
          setMyProjects(userProjects.map((p) => ({ ...p, included: true })));

          const one_active = userProjects.length > 0;
          setHasProjects(one_active);

          if (one_active) {
            let allSkills = new Set<string>();
            userProjects.forEach((p) => {
              (p.skills_needed ?? []).forEach((s) => allSkills.add(s));
            });
            setFilterSkills([...allSkills].map((s) => ({ name: s, included: true })));

            const allCandidates = await fetchCandidates(INITIAL_BATCH_SIZE, session?.user?.id);
            if (!alive) return;

            const matchingAvailable = await checkMatchingAPIHealth();
            console.log(
              matchingAvailable
                ? "Matching API available - ranking candidates by match score..."
                : "Matching API not available - showing candidates in default order",
            );

            const ranked = await rankCandidatesBatch(allCandidates, userProjects, matchingAvailable);
            if (!alive) return;

            setAllCandidates(ranked);
            setCandidates(ranked);
            setCurrentIndex(0);

            if (allCandidates.length < INITIAL_BATCH_SIZE) {
              setAllFetched(true);
            }
          }
        } catch (e: any) {
          if (!alive) return;
          hasLoadedRef.current = false;
          setErr(e.message ?? String(e));
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
      //}, []);
    }, [session?.user?.id]),
  );

  // When the logged-in user changes, reset feed state so a fresh load runs.
  useEffect(() => {
    hasLoadedRef.current = false;
    isFetchingMoreRef.current = false;
    setCandidates([]);
    setAllCandidates([]);
    setCurrentIndex(0);
    setAllFetched(false);
    setErr(null);
  }, [session?.user?.id]);

  const fetchMore = async () => {
    if (isFetchingMoreRef.current || allFetched || !session?.user?.id || !hasProjects) return;
    isFetchingMoreRef.current = true;
    setIsFetchingMore(true);
    try {
      const excludeList = overallCandidates.map((c) => c.id);
      const newBatch = await fetchCandidates(BATCH_SIZE, session.user.id, excludeList);
      if (newBatch.length === 0) {
        setAllFetched(true);
        return;
      }
      if (newBatch.length < BATCH_SIZE) setAllFetched(true);

      const matchingAvailable = await checkMatchingAPIHealth();
      const includedProjects = myProjects.filter((p) => p.included);
      const ranked = await rankCandidatesBatch(newBatch, includedProjects, matchingAvailable);

      setAllCandidates((prev) => [...prev, ...ranked]);
      setCandidates((prev) => [...prev, ...ranked]);
    } catch (e: any) {
      console.warn("Failed to fetch more candidates:", e.message ?? e);
    } finally {
      isFetchingMoreRef.current = false;
      setIsFetchingMore(false);
    }
  };

  const advance = () => {
    if (currentIndex < candidates.length) setCurrentIndex((i) => i + 1);
  };

  const handleSwipe = async (direction: "left" | "right") => {
    const candidate = candidates[currentIndex];
    const nextIndex = currentIndex + 1;
    advance();

    // Proactively fetch the next batch when the queue is running low.
    if (candidates.length - nextIndex <= PREFETCH_THRESHOLD) {
      fetchMore();
    }

    if (!session?.user?.id || !candidate) return;
    try {
      const matchResult = await likeCandidate(
        session.user.id,
        candidate.project_id,
        candidate.id,
        direction === "right" ? "like" : "pass",
      );
      if (matchResult?.match) {
        setMatchCelebrationTarget(candidate.name);
      }
    } catch (e: any) {
      console.warn("Failed to record candidate like:", e.message ?? e);
    }
  };

  const handleDeckLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.max(
      event.nativeEvent.layout.height,
      DECK_CARD_HEIGHT,
    );
    setDeckHeight((currentHeight) =>
      Math.abs(currentHeight - nextHeight) > 1 ? nextHeight : currentHeight,
    );
  };

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
      <ScrollView
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {/* <View> */}
        <View
          style={{
            marginBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 20,
          }}
        >
          <Text style={styles.pageHeader}>Filter Candidates</Text>
          <TouchableOpacity
            style={styles.closeDropDownButton}
            onPress={() => {
              setDropdownOpen(false);
              filterFetchedCandidates();
            }}
          >
            <Ionicons name="close" size={35} color="000" />
          </TouchableOpacity>
        </View>

        <View>
          {/* {myProjects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Projects</Text>
            {myProjects.map((p, i) =>

              <TouchableOpacity key={i} style={styles.filterRow} onPress={() => {p.included = !p.included}}>
                <Ionicons name={p.included ? "checkmark-circle-outline" : "mic-circle-outline"} size={20} color="#333" />
                <Text style={styles.filterLabel}>{p.title}</Text>
              </TouchableOpacity>

            )}
          </View>
        )}


        {filterSkills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {[...filterSkills].map((s, i) =>

              <TouchableOpacity key={i} style={styles.filterRow} onPress={() => s.included = !s.included}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#333" />
                <Text style={styles.filterLabel}>{s.name}</Text>
              </TouchableOpacity>

            )}
          </View>
        )} */}

          {myProjects.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personal Projects</Text>
              {myProjects.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.filterRow}
                  onPress={() =>
                    setMyProjects((prev) =>
                      prev.map((proj, j) =>
                        j === i ? { ...proj, included: !proj.included } : proj,
                      ),
                    )
                  }
                >
                  <Ionicons
                    name={p.included ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color="#333"
                  />
                  <Text style={styles.filterLabel}>{p.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* skills to browse on */}
          {filterSkills.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Skills</Text>
              <TouchableOpacity
                style={styles.filterRow}
                onPress={() => {
                  setShowAllSkills(!showAllSkills);
                }}
              >
                <Ionicons
                  name={showAllSkills ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color="#333"
                />
                <Text style={styles.filterLabel}>Show All Skills</Text>
              </TouchableOpacity>

              {[...filterSkills].map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.filterRow, { paddingHorizontal: 40 }]}
                  onPress={() => {
                    if (!showAllSkills)
                      setFilterSkills((prev) =>
                        prev.map((skill, j) =>
                          j === i
                            ? { ...skill, included: !skill.included }
                            : skill,
                        ),
                      );
                  }}
                >
                  <Ionicons
                    name={s.included ? "checkmark-circle" : "ellipse-outline"}
                    size={20}
                    color={showAllSkills ? "#ddd" : "#333"}
                  />
                  <Text
                    style={[
                      styles.filterLabel,
                      { color: showAllSkills ? "#ddd" : "#333" },
                    ]}
                  >
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    ) : (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {/* FILTER */}
        <View>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => {
              setDropdownOpen(true);
            }}
          >
            <Ionicons name="filter" size={30} color="000" />
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.browseLayout,
            {
              paddingBottom: browseBottomPadding,
            },
          ]}
        >
          <View style={styles.cardContainer} onLayout={handleDeckLayout}>
            <View style={[styles.deckSlot, { height: deckHeight }]}>
              {candidates
                .slice(currentIndex, currentIndex + 2)
                .reverse()
                .map((p, i, arr) => (
                  <CandidateCard
                    key={p.id}
                    candidate={p}
                    isTop={i === arr.length - 1}
                    onSwipe={handleSwipe}
                  />
                ))}

              {currentIndex >= candidates.length && (
                isFetchingMore ? (
                  <View style={styles.endCard}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={{ marginTop: 16, color: "#999" }}>
                      Finding more candidates...
                    </Text>
                  </View>
                ) : (
                  <View style={styles.endCard}>
                    <Text style={styles.endText}>{"You've seen everyone!"}</Text>
                    <TouchableOpacity
                      style={styles.resetButton}
                      onPress={() => setCurrentIndex(0)}
                    >
                      <Text style={styles.resetButtonText}>Start Over</Text>
                    </TouchableOpacity>
                    <Text style={styles.endSubtext}>
                      Or edit your filter settings
                    </Text>
                  </View>
                )
              )}
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
      </View>
    )
  ) : (
    <View style={[styles.center, { backgroundColor: "#fff" }]}>
      <Text
        style={{
          fontSize: 16,
          color: "#999",
          marginBottom: 16,
          width: "75%",
          textAlign: "center",
        }}
      >
        You must have an active project to browse candidates.
      </Text>
      <TouchableOpacity
        style={styles.resetButton}
        onPress={() => router.push("/create-project" as any)}
      >
        <Text style={styles.resetButtonText}>Create Your First Project</Text>
      </TouchableOpacity>
    </View>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  container: { flex: 1, backgroundColor: "#fff" },
  browseLayout: {
    flex: 1,
    paddingTop: 12,
  },
  cardContainer: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  deckSlot: {
    width: DECK_CARD_WIDTH,
    maxWidth: 430,
    position: "relative",
    alignSelf: "center",
  },

  card: {
    ...StyleSheet.absoluteFillObject,
    ...deckCardShell,
  },
  cardSurface: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
  },
  cardBehind: { transform: [{ scale: 0.95 }], opacity: 0.8 },

  targetIcon: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 3,
  },
  targetOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  targetInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#333",
  },
  content: { flex: 1 },
  contentContainer: { padding: 20, paddingTop: 30, paddingBottom: 24 },
  location: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },

  imageContainer: {
    width: "100%",
    height: 180,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
    backgroundColor: "#8FBC8F",
  },
  projectImage: { width: "100%", height: "100%" },

  descriptionSection: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
    textAlign: "center",
  },

  // overlays
  likeOverlay: {
    position: "absolute",
    top: 50,
    right: 30,
    zIndex: 5,
    transform: [{ rotate: "20deg" }],
    borderWidth: 4,
    borderColor: "#4CAF50",
    borderRadius: 10,
    padding: 10,
  },
  nopeOverlay: {
    position: "absolute",
    top: 50,
    left: 30,
    zIndex: 5,
    transform: [{ rotate: "-20deg" }],
    borderWidth: 4,
    borderColor: "#F44336",
    borderRadius: 10,
    padding: 10,
  },
  overlayText: { fontSize: 32, fontWeight: "bold", color: "#4CAF50" },
  nopeOverlayText: { fontSize: 32, fontWeight: "bold", color: "#F44336" },

  endCard: {
    ...StyleSheet.absoluteFillObject,
    ...deckCardShell,
    justifyContent: "center",
    alignItems: "center",
  },
  endText: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  endSubtext: {
    paddingVertical: 10,
    fontSize: 16,
    color: "#999",
    marginBottom: 16,
    width: "75%",
    textAlign: "center",
  },
  resetButton: {
    backgroundColor: "#79BE58",
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  resetButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // skills chips
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  chip: {
    backgroundColor: "#fff",
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  chipText: { fontSize: 13, color: "#333" },

  section: { marginBottom: 12 },

  // avatar
  avatarSection: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  avatarWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    marginBottom: 14,
    elevation: 3,
  },
  avatar: { width: "100%", height: "100%" },

  pageHeader: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 0,
    marginBottom: 4,
  },

  candidateName: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 0.3,
    textAlign: "center",
    marginBottom: 6,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 13, color: "#888", letterSpacing: 0.2 },

  //timeline for education and experience
  timeline: { paddingLeft: 4, marginBottom: 4 },
  timelineItem: {
    flexDirection: "row",
    marginBottom: 16,
    alignItems: "flex-start",
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1A1A1A",
    marginTop: 5,
    marginRight: 14,
    flexShrink: 0,
  },
  timelineContent: { flex: 1 },
  timelineTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 2,
  },
  timelineSubtitle: {
    fontSize: 13,
    color: "#555",
    marginBottom: 1,
    fontWeight: "500",
  },
  timelineMeta: {
    fontSize: 11,
    color: "#AAA",
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  timelineDesc: { fontSize: 13, color: "#666", lineHeight: 19 },

  // personal project
  projectBlock: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#f5f5f5",
  },
  projectBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  projectBlockName: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },

  //links
  linksContainer: { gap: 10 },
  linkRow: { flexDirection: "row", alignItems: "center" },
  linkText: { fontSize: 12, color: "#666", flex: 1 },

  //tags

  // project name tag
  projectTagRow: { alignItems: "flex-start", marginBottom: 8 },
  projectTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },

  //filtering drop down
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C8E4BC",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7BAF6A",
    marginLeft: 15,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
      default: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
    }),
  },
  closeDropDownButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    width: 100,
    height: 70,
    borderRadius: 25,
  },

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  filterLabel: { fontSize: 14, color: "#333" },
});
