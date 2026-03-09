// app/(tabs)/candidates.tsx

/* =========================
   Imports & setup
   ========================= */
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Linking,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  CandidateUI,
  fetchCandidates,
  fetchMyProjects,
  likeCandidate, MyProject,
} from "../../lib/candidates";
import {
  checkMatchingAPIHealth,
  getMatchedCandidates,
} from "../../lib/matching-api";

import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";

import { useSafeAreaInsets } from 'react-native-safe-area-context';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = 120;

/* =========================
   Types (make skills optional & flexible)
   ========================= */
type Candidate = CandidateUI & {
  project_id: string;
  project_name: string;
};

type FilterProject = MyProject & {
  included : boolean;
}

type FilterSkill = {
  name : string;
  included : boolean;
}


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
    onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: g.dy }),
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
          transform: [
            { translateX: position.x },
            { translateY: position.y },
            { rotate },
          ],
        },
        !isTop && styles.cardBehind,
      ]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      <View style={styles.cardInner}>
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

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} nestedScrollEnabled>
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
          {/* <Text style={styles.sectionTitle}>Bio</Text> */}
          <Text style={styles.description}>{candidate.bio}</Text>
        </View>

        {/* Skills chips (if available) */}
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

        {/* interests chips (if available) */}
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

        {/* ── Experience ── */}
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

        {/* ── Education ── */}
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

        {/* ── Personal Projects ── */}
        {candidate.personal_projects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Projects</Text>
            {candidate.personal_projects.map((p, i) => (
              <ProjectBlock key={`pp-${i}`} item={p} />
            ))}
          </View>
        )}

        {/* ── Links ── */}
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
   Screen: fetch & swipe stack
   ========================= */
export default function CandidateFeed() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [overallCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [useMatching, setUseMatching] = useState(false);

  const [hasProjects, setHasProjects] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [myProjects, setMyProjects] = useState<FilterProject[]>([]);
  const [filterSkills, setFilterSkills] = useState<FilterSkill[]>([]);
  const [showAllSkills, setShowAllSkills] = useState<Boolean>(true);
  const { session } = useAuth();

  const insets = useSafeAreaInsets();

  const filterFetchedCandidates = () => {

    let filteredCandidates : Candidate[] = [];
    const pids = myProjects.filter(p => p.included).map(p => p.id);
    const skills = filterSkills.filter(s => s.included).map(s => s.name);
    
    overallCandidates.forEach(c => {
      if (pids.includes(Number(c.project_id))) {
        if (!showAllSkills) {
          const intersection = c.skills.filter(x => skills.includes(x)); 
          if (intersection.length > 0) {
            filteredCandidates.push(c)
          }
        }
        else {
          filteredCandidates.push(c)
        }
      }
    })

    setCandidates(filteredCandidates)
  }


  //useEffect(() => {
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          setLoading(true);

          // Get current authenticated user's projects
          const userProjects = await fetchMyProjects(session?.user?.id);
          setMyProjects(userProjects.map(p => ({ ...p, included: true })));
          // let one_active = false;
          // for(let i = 0; i < userProjects.length; i++) {
          //   let p = userProjects[i];
          //   if (p.is_active) {
          //     one_active = true;
          //     break;
          //   }
          // }

          let one_active = userProjects.length > 0;
          setHasProjects(one_active);

          // setHasProjects(userProjects.length > 0);

          if (one_active) {

            let allSkills = new Set<string>();
            userProjects.forEach(p => {
              (p.skills_needed ?? []).forEach(s => allSkills.add(s));
            });

            // setFilterSkills([...allSkills].map(s => ({name : s, included : true})))
            setFilterSkills([...allSkills].map(s => ({ name: s, included: true })));

            // Fetch all candidates
            const allCandidates = await fetchCandidates(50, session?.user?.id);
            if (!alive) return;

            // Check if matching API is available
            const matchingAvailable = await checkMatchingAPIHealth();

            if (matchingAvailable) {
              console.log('Matching API available - ranking candidates by match score...');
              try {


                const results = await Promise.all(
                  userProjects
                    .filter(p => p.is_active)
                    .map(async (p) => {
                      const matches = await getMatchedCandidates(p, allCandidates);
                      return matches.map(m => ({ ...m, project_id: String(p.id) }));
                    })
                );
                const firstMatchScores = results.flat();
                // from matchScores remove duplicates (keep highest match score)
                const bestMatchMap = new Map<string, (typeof firstMatchScores)[number]>();

                for (const match of firstMatchScores) {
                  const existing = bestMatchMap.get(match.candidate_id);
                  if (!existing || match.overall_score > existing.overall_score) {
                    bestMatchMap.set(match.candidate_id, match);
                  }
                }

                const matchScores = Array.from(bestMatchMap.values());

                // Create a map of candidate IDs to match scores
                const scoreMap = new Map(matchScores.map(m => [m.candidate_id, m.overall_score]));

                // Sort candidates by match score
                const rankedCandidates = [...allCandidates].sort((a, b) => {
                  const scoreA = scoreMap.get(a.id) || 0;
                  const scoreB = scoreMap.get(b.id) || 0;
                  return scoreB - scoreA; // Higher scores first
                });

                setAllCandidates(rankedCandidates as Candidate[]);
                setCandidates(rankedCandidates as Candidate[]);

                setUseMatching(true);
                console.log(`Candidates ranked by match score (top: ${(scoreMap.get(rankedCandidates[0].id) || 0) * 100}%)`);
              } catch (matchError) {
                console.warn('Failed to rank candidates, using default order:', matchError);
                setAllCandidates(allCandidates as Candidate[]);
                setCandidates(allCandidates as Candidate[]);
              }
            } else {
              console.log('Matching API not available - showing candidates in default order');
              const pid = String(userProjects.find(p => p.is_active)?.id);
              const p_name = String(userProjects.find(p => p.is_active)?.title);
              const temp = allCandidates.map(c => ({ ...c, project_id: pid, project_name: p_name })) as Candidate[]
              setAllCandidates(temp);
              setCandidates(temp);
            }
            setCurrentIndex(0);
          }

        } catch (e: any) {
          if (!alive) return;
          setErr(e.message ?? String(e));
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => { alive = false; };
      //}, []);
    }, []));

  const advance = () => {
    if (currentIndex < candidates.length) setCurrentIndex((i) => i + 1);
  };

  const handleSwipe = async (direction: "left" | "right") => {
    const candidate = candidates[currentIndex];
    advance();
    //if (direction !== 'right' || !session?.user?.id || !candidate) return;
    if (!session?.user?.id || !candidate) return;
    try {
      await likeCandidate(
        session.user.id,
        candidate.project_id,
        candidate.id,
        direction == "right" ? "like" : "pass",
      );
    } catch (e: any) {
      console.warn("Failed to record candidate like:", e.message ?? e);
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <Text>Loading candidates</Text>
      </View>
    );
  if (err)
    return (
      <View style={styles.center}>
        <Text>Failed to load candidates: {err}</Text>
      </View>
    );

  return (hasProjects ? (dropdownOpen ? (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    {/* <View style={[styles.container]}> */}
      <View>
        <TouchableOpacity style={styles.closeDropDownButton} onPress={() => { setDropdownOpen(false); filterFetchedCandidates() }}>
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
                onPress={() => setMyProjects(prev =>
                  prev.map((proj, j) => j === i ? { ...proj, included: !proj.included } : proj)
                )}
              >
                <Ionicons name={p.included ? "checkmark-circle" : "ellipse-outline"} size={20} color="#333" />
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
                <Ionicons name={showAllSkills ? "checkmark-circle" : "ellipse-outline"} size={20} color="#333" />
                <Text style={styles.filterLabel}>Show All Skills</Text>
              </TouchableOpacity>

            {[...filterSkills].map((s, i) =>

              <TouchableOpacity
                key={i}
                style={[styles.filterRow, {paddingHorizontal : 40}]}
                onPress={() => {
                  if (!showAllSkills) setFilterSkills(prev => prev.map((skill, j) => j === i ? { ...skill, included: !skill.included } : skill));
                }}
              >
                <Ionicons name={s.included ? "checkmark-circle" : "ellipse-outline"} size={20} color={showAllSkills? "#ddd": "#333"} />
                <Text style={[styles.filterLabel, {color: showAllSkills ? "#ddd" : "#333" }]}>{s.name}</Text>
              </TouchableOpacity>

            )}
          </View>
        )}

      </View>
    </View>

  ) : (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    {/* <View style={[styles.container]}> */}
      {/* FILTER */}
      <View>
        <TouchableOpacity style={styles.filterButton} onPress={() => { setDropdownOpen(true) }}>
          <Ionicons name="filter" size={30} color="000" />
        </TouchableOpacity>
      </View>

      <View style={styles.cardContainer}>
        {(() => {
          const visible = candidates
            .slice(currentIndex, currentIndex + 2)
            .reverse();
          return visible.map((p, i) => (
            <CandidateCard
              key={p.id}
              candidate={p}
              isTop={i === visible.length - 1}
              onSwipe={handleSwipe}
            />
          ));
        })()}

        {currentIndex >= candidates.length && (
          <View style={styles.endCard}>
            <Text style={styles.endText}>No more candidates!</Text>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => setCurrentIndex(0)}
            >
              <Text style={styles.resetButtonText}>Start Over</Text>
            </TouchableOpacity>
            <Text style={{ paddingVertical : 10, fontSize: 16, color: '#999', marginBottom: 16, width: "75%", textAlign: "center" }}>Or edit your filter settings</Text>
          </View>
        )}
      </View>

      {currentIndex < candidates.length && (
        <View style={styles.buttonsContainer}>
          <TouchableOpacity style={styles.passButton} onPress={() => handleSwipe('left')}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.likeButton} onPress={() => handleSwipe('right')}>
            <Ionicons name="checkmark" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  ))

    : (
      <View style={[styles.center, { backgroundColor: "#fff" }]}>
        <Text style={{ fontSize: 16, color: '#999', marginBottom: 16, width: "75%", textAlign: "center" }}>You must have an active project to browse candidates.</Text>
        <TouchableOpacity style={styles.resetButton} onPress={() => router.push('/create-project' as any)}>
          <Text style={styles.resetButtonText}>Create Your First Project</Text>
        </TouchableOpacity>
      </View>
    )

  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: "#fff" },
  cardContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  headerTitle: { fontSize: 24, fontWeight: "700", color: "#333" },

  card: {
    position: "absolute",
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 430,
    height: SCREEN_HEIGHT * 0.62,
    backgroundColor: "#fff",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  cardInner: {
    flex: 1,
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

  content: { flex: 1, padding: 20, paddingTop: 30 },
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
  sectionTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  description: { fontSize: 14, color: '#333', lineHeight: 20, textAlign: 'center' },

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

  buttonsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 60, paddingBottom: 10, paddingTop: 0 },
  passButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  likeButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },

  endCard: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 430,
    height: SCREEN_HEIGHT * 0.62,
    backgroundColor: "#fff",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  endText: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  resetButton: {
    backgroundColor: "#007AFF",
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
  candidateName: {
    fontSize: 24,
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
  filterButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, width: 100, height: 60, borderRadius: 25 },
  closeDropDownButton: { alignSelf: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, width: 100, height: 70, borderRadius: 25 },

  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 20 },
  filterLabel: { fontSize: 14, color: '#333' },
});
