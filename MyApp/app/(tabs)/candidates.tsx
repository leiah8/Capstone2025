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
  MyProject
} from "../../lib/candidates";
import {
  checkMatchingAPIHealth,
  getMatchedCandidates,
} from "../../lib/matching-api";

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

const PREFETCH_THRESHOLD = 3;    // fetch more when this many cards remain
const BATCH_SIZE = 20;            // candidates per incremental fetch
const INITIAL_BATCH_SIZE = 50;   // candidates fetched on first load

let persistedProjectId: string | null = null; 

/* =========================
   Types (make skills optional & flexible)
   ========================= */
type Candidate = CandidateUI & {
  project_id: string;
  project_name: string;
  lat : number | null;
  lng : number | null;
};

type FilterProject = MyProject & {
  included: boolean,
};

type FilterSkill = {
  name: string;
  included: boolean;
};

type Coord = {
  lat : number | null, 
  lng : number | null
};

type CandidateList = {
  fullCandidates : Candidate[],
  filteredCandidates : {c : Candidate, included : boolean}[],
  project : FilterProject,
  index : number, 
};


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
        const ratio = x / trackWidth.current;
        onValueChange(clamp(Math.round(min + ratio * (max - min))));
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.locationX;
        const ratio = x / trackWidth.current;
        onValueChange(clamp(Math.round(min + ratio * (max - min))));
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
  wrapper: {
    width: "80%",
    alignSelf: "center",
    paddingVertical: 12,
  },
  track: {
    height: 4,
    backgroundColor: "#E1E8F5",
    borderRadius: 2,
    // flexDirection: "row", ///
    position: "relative",
  },
  fill: {
    // height: 4,
    // backgroundColor: "#79BE58",
    // borderRadius: 2,
    height: 4,
  backgroundColor: "#79BE58",
  borderRadius: 2,
  position: "absolute",
  left: 0,
  top: 0,

  },
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
  const onSwipeRef = useRef(onSwipe);

  useEffect(() => {
    onSwipeRef.current = onSwipe;
  }, [onSwipe]);

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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false, //true,
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
      onSwipeRef.current("right");
    });
  };
  const swipeLeft = () => {
    Animated.timing(position, {
      toValue: { x: -SCREEN_WIDTH - 100, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      onSwipeRef.current("left");
    });
  };
  const resetPosition = () =>
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  const hasLinks =
    candidate.links && Object.values(candidate.links).some(Boolean);


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
    if (__DEV__) {
      console.log(`[CANDIDATES] Ranking ${batch.length} candidates against ${activeProjects.length} active project(s)`);
    }

    // Call /match/candidates per active project in parallel
    const perProjectResults = await Promise.all(
      activeProjects.map((project) =>
        getMatchedCandidates(
          project,
          batch.map((c) => ({
            id: c.id,
            name: c.name,
            location: c.location,
            bio: c.bio,
            skills: c.skills,
            interests: c.interests,
            education: c.education,
            personal_projects: c.personal_projects,
            experience: c.experience,
          })),
          excludeCandidateIds,
        ).then((ranked) => ({ projectId: String(project.id), projectName: project.title, ranked }))
      ),
    );

    const allRanked = new Map<string, { candidateId : string, projectId: string; projectName: string; score: number }>();

    for (const { projectId, projectName, ranked } of perProjectResults) {
      for (const score of ranked) {
        const key = `${score.candidate_id}::${projectId}`;
        allRanked.set(key, { candidateId : score.candidate_id, projectId, projectName, score: score.overall_score });
      }
    }

    if (__DEV__) {
      console.log(`[CANDIDATES] Ranked candidates across ${perProjectResults.length} project(s)`);
    }

    const outTemp : {candidate : Candidate, index : number, overallScore : number}[] = [];

    allRanked.forEach((v, index) => {
      const candidateId = v.candidateId;
      const best = {projectId : v.projectId, projectName : v.projectName, score : v.score};
      const fallbackProject = activeProjects[0] ?? userProjects[0];
      const projectId = best?.projectId ?? String(fallbackProject?.id ?? "");
      const projectName = best?.projectName ?? String(fallbackProject?.title ?? "");
      const overallScore = best?.score ?? -1;


      // const candidate = batch.get(candidate with candidateID)
      const candidate = batch.find(c => c.id === candidateId)


      outTemp.push({
          candidate: {
            ...candidate,
            project_id: projectId,
            project_name: projectName,
          } as Candidate,
          index : Number(index),
          overallScore,
        });
      })

      return outTemp.sort((left, right) => {
        if (right.overallScore !== left.overallScore) {
          return right.overallScore - left.overallScore;
        }
        return left.index - right.index;
      })
      .map(({ candidate }) => candidate);

  } catch (matchError) {
    console.warn("[CANDIDATES] Failed to rank candidates, using default order:", matchError);
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
  const [candidates, setCandidates] = useState<{c : Candidate, included : boolean}[]>([]);
  const [overallCandidates, setAllCandidates] = useState<Candidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0); //useState<{project : String | null, index : number}>({project : persistedProjectId, index : 0});
  
  
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deckHeight, setDeckHeight] = useState(DECK_CARD_HEIGHT);
  const [matchCelebrationTarget, setMatchCelebrationTarget] = useState<
    string | null
  >(null);

  const [hasProjects, setHasProjects] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { session } = useAuth();

  //FOR FILTERINGG

  const [maxFilterDist, setMaxFilterDist] = useState<number>(MAX_DISTANCE);
  const [myCoords, setMyCoords] = useState<Coord>({lat : null, lng : null});

  const [myProjects, setMyProjects] = useState<FilterProject[]>([]);
  const [filterSkills, setFilterSkills] = useState<FilterSkill[]>([]);
  const [showAllSkills, setShowAllSkills] = useState<boolean>(true);

  const [maxFilterDistUI, setMaxFilterDistUI] = useState<number>(MAX_DISTANCE);
  const [filterSkillsUI, setFilterSkillsUI] = useState<FilterSkill[]>([]);
  const [showAllSkillsUI, setShowAllSkillsUI] = useState<boolean>(true);
  const [myProjectsUI, setMyProjectsUI] = useState<FilterProject[]>([]);

  const [currentCandidateList, setCurrentCandidateList] = useState<CandidateList | undefined>(undefined);
  const [allCandidateLists, setAllCandidateLists] = useState<Map<String, CandidateList | undefined >>(new Map());

  //END FOR FILTERING


  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [allFetched, setAllFetched] = useState(false);
  const isFetchingMoreRef = useRef(false);
  const swipedCandidateIdsRef = useRef<string[]>([]);


  // const filterFetchedCandidates = (pid? : number) => {

  //   console.log("START OF FILTERING");
    
  //   let newPid1 = myProjectsUI.find(p => p.included)?.id;
  //   if(pid) {
  //     newPid1 = pid;
  //   }

  //   if (newPid1){
  //     //switch the project if needed 

  //     const newPid = String(newPid1);

  //     const oldProject = allCandidateLists.get(String(persistedProjectId));
  //     const oldIndex = currentIndex;
  //     // if(oldProject) {
  //     //   oldProject.index = currentIndex;
  //     // }
  //     const newProject = allCandidateLists.get(newPid);
  //     persistedProjectId = newPid



  //     if (newProject) {    
  //       let maxDist = maxFilterDistUI < MAX_DISTANCE ? maxFilterDistUI : Infinity;
  //       const selectedSkills = filterSkillsUI.filter((s) => s.included).map((s) => s.name);

  //       const filteredCandidates = newProject.fullCandidates.map(c => {
  //         const out = {c : c, included : true}
  //         //dist filtering 
  //         if (calcDist(myCoords?.lat, myCoords?.lng, c.lat, c.lng) > maxDist) {
  //           out.included =  false;
  //         }

  //         //could check project id but not necessary 

  //         //skill filtering
  //         if (!showAllSkillsUI) {
  //           const hasSkill = c.skills.some(s => selectedSkills.includes(s));
  //           if (!hasSkill) {
  //           out.included = false;
  //           }
  //         }

  //         return out;
          
  //       });
        
  //       setCandidates(filteredCandidates);
  //       setAllCandidateLists(prev => {
  //         return  new Map(prev).set(newPid, {...newProject, filteredCandidates : filteredCandidates})
  //         // if (m1 && oldProject) {
  //         //   const m2 = m1.set(String(persistedProjectId), {...oldProject, index : oldIndex});
  //         //   return m2;
  //         // }
  //         // return m1;
  //       });

  //       // setCurrentIndexDebug(newProject.index);
  //       setCurrentIndexDebug(0);

  //       //set to be saved
  //       setMyProjects(myProjectsUI);
  //       setFilterSkills(filterSkillsUI);
  //       setShowAllSkills(showAllSkillsUI);
  //       setMaxFilterDist(maxFilterDistUI);

  //     }
      


  //   }

  //   console.log("END OF FILTERING");
    
  // };

  const filterFetchedCandidates = (pid?: number) => {
  console.log("START OF FILTERING");

  let newPid1 = myProjectsUI.find(p => p.included)?.id;
  if (pid) newPid1 = pid;

  if (newPid1) {
    const newPid = String(newPid1);
    // const isSwitchingProject = newPid !== String(persistedProjectId);
    const isSwitchingProject = persistedProjectId !== null && newPid !== String(persistedProjectId);

    const oldProjectId = String(persistedProjectId);
    const oldProject = allCandidateLists.get(oldProjectId);
    const newProject = allCandidateLists.get(newPid);

    const currentI = currentIndex

    const updatedOldProject =
      isSwitchingProject && oldProject
        ? { ...oldProject, index: currentI }
        : oldProject;

    persistedProjectId = newPid;

    if (newProject) {
      let maxDist = maxFilterDistUI < MAX_DISTANCE ? maxFilterDistUI : Infinity;
      const selectedSkills = filterSkillsUI.filter(s => s.included).map(s => s.name);

      const filteredCandidates = newProject.fullCandidates.map(c => {
        const out = { c, included: true };
        if (calcDist(myCoords?.lat, myCoords?.lng, c.lat, c.lng) > maxDist) {
          out.included = false;
        }
        if (!showAllSkillsUI) {
          if (!c.skills.some(s => selectedSkills.includes(s))) {
            out.included = false;
          }
        }
        return out;
      });

      setCandidates(filteredCandidates);

      setAllCandidateLists(prev => {
        const next = new Map(prev);
        if (isSwitchingProject && updatedOldProject) {
          next.set(oldProjectId, updatedOldProject);
        }
        next.set(newPid, { ...newProject, filteredCandidates });
        return next;
      });

      const restoredIndex = isSwitchingProject ? (newProject.index ?? 0) : 0;
      setCurrentIndex(restoredIndex);

      setMyProjects(myProjectsUI);
      setFilterSkills(filterSkillsUI);
      setShowAllSkills(showAllSkillsUI);
      setMaxFilterDist(maxFilterDistUI);
    }
  }

  console.log("END OF FILTERING");
};

  const loadCandidates = useCallback(async (startingOver? : boolean) => {
    try {

      setLoading(true);
      setAllCandidates([]);
      setCandidates([]);
      setAllFetched(false);
      isFetchingMoreRef.current = false;

      //get user projects
      const userProjects = await fetchMyProjects(session?.user?.id);

      //if one project, set persistedprojectid
      if (userProjects.length == 1) {
        persistedProjectId = String(userProjects[0].id);
      }

      //set up myProjects
      const tempProjects = userProjects.map(p => ({ ...p, included: String(p.id) == persistedProjectId ? true : false }))

      setMyProjects(tempProjects);
      setMyProjectsUI(tempProjects);

      const one_active = userProjects.length > 0;
      setHasProjects(one_active);

      //set coords 
      const coords = await fetchMyCoords(session?.user?.id);
      setMyCoords(coords);

      //if the user has at least one project
      if (one_active) {
        
        //retrieve all skills 
        //if (filterSkillsUI.length == 0) {
          let allSkills = new Set<string>();
          userProjects.forEach((p) => {
            (p.skills_needed ?? []).forEach((s) => allSkills.add(s));
          });

          let tempSkills : FilterSkill[] = [];
          allSkills.forEach(s => 
            tempSkills.push({name : s, included : true})
          );
          setFilterSkills(tempSkills);
          setFilterSkillsUI(tempSkills); 

          setShowAllSkills(true);
          setShowAllSkillsUI(true);
        //å}

        //retrieve new list of candidates
        swipedCandidateIdsRef.current = session?.user?.id
          ? await fetchSwipedCandidateIds(session.user.id)
          : [];

        
        const allCandidates = await fetchCandidates(INITIAL_BATCH_SIZE, session?.user?.id, swipedCandidateIdsRef.current);

        const matchingAvailable = await checkMatchingAPIHealth();
        console.log(
          matchingAvailable
            ? "Matching API available - ranking candidates by match score..."
            : "Matching API not available - showing candidates in default order",
        );

        const ranked = await rankCandidatesBatch(allCandidates, userProjects, matchingAvailable, swipedCandidateIdsRef.current);

        setCandidates(ranked.map(c => ({c : c, included : true})));
        setAllCandidates(ranked);
        
        if (startingOver) {
          //only pull new for this project 
          const proj = tempProjects.find(p => (String(p.id) == persistedProjectId));

          if (proj) {
            let pCandidates = ranked.filter(c => c.project_id === persistedProjectId);  
            let filteredpCandidates = pCandidates.map(c => ({c : c, included : true}))              

            const p2 = { fullCandidates: pCandidates, filteredCandidates : filteredpCandidates, project: proj, index: 0 };

            setAllCandidateLists(prev => prev.set(String(persistedProjectId), p2));
            setCandidates(filteredpCandidates);
            setCurrentCandidateList(p2)
            setCurrentIndex(0); 
            
          } else {
            console.log("ERROR");
          }

        
        }
        else {
          //split candidates up by project
          const allLists = new Map<String, CandidateList | undefined>();
          tempProjects.forEach(p => {
            let pCandidates = ranked.filter(c => c.project_id === String(p.id));   
            let filteredpCandidates = pCandidates.map(c => ({c : c, included : true}));           
            let newIndex = 0;

            const p2 = { fullCandidates: pCandidates, filteredCandidates : filteredpCandidates, project: p, index: newIndex };

            allLists.set(String(p.id), p2);

            if (persistedProjectId == String(p.id)) {
              setCandidates(filteredpCandidates);
              setCurrentCandidateList(p2)
            }

          });
          setAllCandidateLists(allLists);
          setCurrentIndex(0); 
        }

        if (allCandidates.length < INITIAL_BATCH_SIZE) {
          setAllFetched(true);
        }
      }
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }

    

  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadCandidates();
    }, [loadCandidates]),
  );

  // When the logged-in user changes, reset feed state so a fresh load runs.
  useEffect(() => {
    isFetchingMoreRef.current = false;
    swipedCandidateIdsRef.current = [];
    setCandidates([]);
    setAllCandidates([]);
    setCurrentIndex(0);
    persistedProjectId = null
    setAllFetched(false);
    setErr(null);
  }, [session?.user?.id]);

  const fetchMore = async () => {
    if (isFetchingMoreRef.current || allFetched || !session?.user?.id || !hasProjects) return;
    isFetchingMoreRef.current = true;
    setIsFetchingMore(true);
    try {
      const excludeList = Array.from(
        new Set([...overallCandidates.map((c) => c.id), ...swipedCandidateIdsRef.current])
      );
      const newBatch = await fetchCandidates(BATCH_SIZE, session.user.id, excludeList);
      if (newBatch.length === 0) {
        setAllFetched(true);
        return;
      }
      if (newBatch.length < BATCH_SIZE) setAllFetched(true);

      const matchingAvailable = await checkMatchingAPIHealth();
      const includedProjects = myProjects.filter((p) => p.included);
      const ranked = await rankCandidatesBatch(newBatch, includedProjects, matchingAvailable, swipedCandidateIdsRef.current);

      setAllCandidates((prev) => [...prev, ...ranked]);
      setCandidates((prev) => [...prev, ...ranked.map(c => ({c : c, included : true}))]);
    } catch (e: any) {
      console.warn("Failed to fetch more candidates:", e.message ?? e);
    } finally {
      isFetchingMoreRef.current = false;
      setIsFetchingMore(false);
    }
  };

  const advance = () => {
    // if (currentIndex.index < candidates.length) setCurrentIndex((prev) => {
    //   return {project : prev.project, index : prev.index + 1};
    // });
    let i = currentIndex + 1;
    while (i < candidates.length) {
      if (candidates[i].included) {
        if (i <= candidates.length) {
          setCurrentIndex(i);
          return
        }
      }
      i += 1;
    }
    if (i >= candidates.length) setCurrentIndex(candidates.length);
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
        candidate.c.project_id,
        candidate.c.id,
        direction === "right" ? "like" : "pass",
      );
      if (matchResult?.match) {
        setMatchCelebrationTarget(candidate.c.name);
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

              // setFilterSkillsUI(filterSkills);
              // setMaxFilterDistUI(maxFilterDist);
              // setShowAllSkillsUI(showAllSkills);
              setMyProjectsUI(myProjects);
            }}
          >
            <Ionicons name="close" size={35} color="000" />
          </TouchableOpacity>
        </View>

        <View>

          {/* Location */}
          {myCoords.lat && myCoords.lng && (
            <View>
              <Text style={styles.sectionTitle}>Location</Text>
              {/* <SliderFilter/> */}
              <LocationSlider
                min={0}
                max={MAX_DISTANCE}
                value={maxFilterDistUI}
                onValueChange={setMaxFilterDistUI}
              />
              <Text style={{ textAlign: "center", color: "#888", fontSize: 13 }}>
                {maxFilterDistUI >= MAX_DISTANCE ? "Worldwide" : maxFilterDistUI + "km"}
              </Text>
            </View>
          )
          
          }
          
          {/* Projects */}
          {myProjectsUI.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Personal Projects</Text>
              {myProjectsUI.map((p, i) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.filterRow}
                  
                  onPress={() => {
                    
                    const newProjects = myProjectsUI.map((proj, j) => ({
                      ...proj,
                      included: j === i,
                    }));
                    setMyProjectsUI(newProjects);
                    // const selected = newProjects.find(p => p.included);
                    // persistedProjectId = selected ? String(selected.id) : null; 
                  }}
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
          {filterSkillsUI.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Skills</Text>
              <TouchableOpacity
                style={styles.filterRow}
                onPress={() => {
                  setShowAllSkillsUI(!showAllSkillsUI);

                  //check here

                  if(!showAllSkillsUI) {
                    setFilterSkillsUI((prev) => prev.map(s => ({...s, included : true})));
                  }
                }}
              >
                <Ionicons
                  name={showAllSkillsUI ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color="#333"
                />
                <Text style={styles.filterLabel}>Show All Skills</Text>
              </TouchableOpacity>

              {[...filterSkillsUI].map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.filterRow, { paddingHorizontal: 40 }]}
                  onPress={() => {
                    if (!showAllSkillsUI)
                      setFilterSkillsUI((prev) =>
                        prev.map((skill, j) =>
                          j === i
                            ? { ...skill, included: !skill.included }
                            : skill,
                        ),
                      );
                  }}
                >
                  <Ionicons
                    name={s.included ? "checkbox" : "square-outline"}
                    size={20}
                    color={showAllSkillsUI ? "#ddd" : "#333"}
                  />
                  <Text
                    style={[
                      styles.filterLabel,
                      { color: showAllSkillsUI ? "#ddd" : "#333" },
                    ]}
                  >
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
          <View style={styles.center}>
        <TouchableOpacity
                      style={[styles.center, styles.resetButton, {width : SCREEN_WIDTH * 0.5}]}
                      onPress={() => {
                        setDropdownOpen(false);
                        filterFetchedCandidates();
                      }} 
                    >
                      <Text style={styles.resetButtonText}>Apply</Text>
                </TouchableOpacity>
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
                .filter(c => c.included)
                .map((p, i, arr) => (
                  <CandidateCard
                    // key={(p.id, p.project_id)}
                    key={`${p.c.id}-${p.c.project_id}`}
                    candidate={p.c}
                    isTop={i === arr.length - 1}
                    onSwipe={handleSwipe}
                  />
                ))}

              {currentIndex >= candidates.length && (
                isFetchingMore ? (
                  <View style={styles.endCard}>
                    <ActivityIndicator size="large" color="#79BE58" />
                    <Text style={{ marginTop: 16, color: "#999" }}>
                      Finding more candidates...
                    </Text>
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
                          // await filterFetchedCandidates();
                        } catch (e: any) {
                          console.warn('Failed to reset candidates feed:', e.message ?? e);
                        }
                      }}
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

        {/* Project picker modal */}
        {persistedProjectId == null && myProjects.length > 1 &&  (
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
                  // switchProjects(persistedProjectId);
                  //setCandidates(overallCandidates.filter(c => c.project_id === String(p.id)));
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