// app/(tabs)/candidates.tsx

/* =========================
   Imports & setup
   ========================= */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CandidateUI, fetchCandidates } from '../../lib/candidates';
import { checkMatchingAPIHealth, getMatchedCandidates, MatchScore } from '../../lib/matching-api';

import { fetchProjects } from '../../lib/projects';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;

/* =========================
   Types (make skills optional & flexible)
   ========================= */
type Candidate = CandidateUI & {
//   skillsNeeded?: string[];
//   // tolerate legacy shape if it exists
//   skills?: { name: string; level?: number }[];
};



/* =========================
   Link Row
   ========================= */
const LINK_ICONS: Record<string, string> = {
  github: 'logo-github',
  linkedin: 'logo-linkedin',
  twitter: 'logo-twitter',
  instagram: 'logo-instagram',
  portfolio: 'globe-outline',
  other: 'link-outline',
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
    <View style={[styles.timelineDot ]} />
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
  candidate, isTop, onSwipe,
}: { candidate: Candidate; isTop: boolean; onSwipe: (d: 'left' | 'right') => void }) => {
  const position = useRef(new Animated.ValueXY()).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });
  const likeOpacity = position.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeOpacity = position.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: g.dy }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) swipeRight();
        else if (g.dx < -SWIPE_THRESHOLD) swipeLeft();
        else resetPosition();
      },
    })
  ).current;

  const swipeRight = () => {
    Animated.timing(position, { toValue: { x: SCREEN_WIDTH + 100, y: 0 }, duration: 250, useNativeDriver: false })
      .start(() => { onSwipe('right'); position.setValue({ x: 0, y: 0 }); });
  };
  const swipeLeft = () => {
    Animated.timing(position, { toValue: { x: -SCREEN_WIDTH - 100, y: 0 }, duration: 250, useNativeDriver: false })
      .start(() => { onSwipe('left'); position.setValue({ x: 0, y: 0 }); });
  };
  const resetPosition = () => Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
  const hasLinks = candidate.links && Object.values(candidate.links).some(Boolean);

  // unify skills source (supports either shape)
//   const skills = candidate.skills
    // candidate.skills && candidate.skills.length > 0
    //   ? candidate.skills
    //   : (candidate.skills?.map(s => s.name) ?? []);

  return (
    <Animated.View
      style={[
        styles.card,
        { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] },
        !isTop && styles.cardBehind,
      ]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      {isTop && (
        <>
          <Animated.View style={[styles.likeOverlay, { opacity: likeOpacity }]}>
            <Text style={styles.overlayText}>INTERESTED</Text>
          </Animated.View>
          <Animated.View style={[styles.nopeOverlay, { opacity: nopeOpacity }]}>
            <Text style={styles.overlayText}>PASS</Text>
          </Animated.View>
        </>
      )}

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* ── Hero Header ── */}
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
              {candidate.experience.map((e, i) => <ExperienceBlock key={`ex-${i}`} item={e} />)}
            </View>
          </View>
        )}

        {/* ── Education ── */}
        {candidate.education?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            <View style={styles.timeline}>
              {candidate.education.map((e, i) => <EducationBlock key={`ed-${i}`} item={e} />)}
            </View>
          </View>
        )}

        {/* ── Personal Projects ── */}
        {candidate.personal_projects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {candidate.personal_projects.map((p, i) => <ProjectBlock key={`pp-${i}`} item={p} />)}
          </View>
        )}

        {/* ── Links ── */}
        {hasLinks && (
          <View style={[styles.section, { marginBottom: 32 }]}>
            <Text style={styles.sectionTitle}>Links</Text>
            <View style={styles.linksContainer}>
              {candidate.links.github != null && (<LinkRow label="github" url={candidate.links.github} />)}
              {candidate.links.linkedin != null && (<LinkRow label="linkedin" url={candidate.links.linkedin} />)}
              {candidate.links.twitter != null && (<LinkRow label="twitter" url={candidate.links.twitter} />)}
              {candidate.links.instagram != null && (<LinkRow label="instagram" url={candidate.links.instagram} />)}
              {candidate.links.portfolio != null && (<LinkRow label="portfolio" url={candidate.links.portfolio} />)}
              {candidate.links.other != null && (<LinkRow label="other" url={candidate.links.other} />)}
            </View>
          </View>
        )}


      </ScrollView>
    </Animated.View>
  );
};

/* =========================
   Screen: fetch & swipe stack
   ========================= */
export default function CandidateFeed() {
  const insets = useSafeAreaInsets();
  const [projects, setCandidates] = useState<Candidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [useMatching, setUseMatching] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        
        // Fetch all projects
        const allCandidates = await fetchCandidates(50);
        // console.log("HERE HI")
        // console.log(allCandidates)
        if (!alive) return;

        // Check if matching API is available
        const matchingAvailable = await checkMatchingAPIHealth();
        
        if (matchingAvailable) {
          console.log('Matching API available - ranking projects by match score...');
          try {
            // Get current authenticated user's projects
            const userProjects = await fetchProjects();
            
            const matchScores : MatchScore[] = []
            
            userProjects.forEach(async (p) => {
                const matchScores = await getMatchedCandidates(p, allCandidates);
                matchScores.push()
            }) //keep seperate so we can tag them: TODO 
                
            // Create a map of project IDs to match scores
            const scoreMap = new Map(matchScores.map(m => [m.project_id, m.overall_score]));
            
            // Sort candidates by match score
            const rankedCandidates = [...allCandidates].sort((a, b) => {
              const scoreA = scoreMap.get(a.id) || 0;
              const scoreB = scoreMap.get(b.id) || 0;
              return scoreB - scoreA; // Higher scores first
            });
            
            setCandidates(rankedCandidates as Candidate[]);
            setUseMatching(true);
            console.log(`Candidates ranked by match score (top: ${(scoreMap.get(rankedCandidates[0].id) || 0) * 100}%)`);
          } catch (matchError) {
            console.warn('Failed to rank projects, using default order:', matchError);
            setCandidates(allCandidates as Candidate[]);
          }
        } else {
          console.log('Matching API not available - showing candidates in default order');
          setCandidates(allCandidates as Candidate[]);
        }
        
        setCurrentIndex(0);
      } catch (e: any) {
        if (!alive) return;
        setErr(e.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const advance = () => { if (currentIndex < projects.length) setCurrentIndex((i) => i + 1); };

  if (loading) return <View style={styles.center}><Text>Loading projects…</Text></View>;
  if (err) return <View style={styles.center}><Text>Failed to load candidates: {err}</Text></View>;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.cardContainer}>
        {projects.slice(currentIndex, currentIndex + 2).reverse().map((p, i) => (
          <CandidateCard key={p.id} candidate={p} isTop={i === 1} onSwipe={advance} />
        ))}

        {currentIndex >= projects.length && (
          <View style={styles.endCard}>
            <Text style={styles.endText}>No more projects!</Text>
            <TouchableOpacity style={styles.resetButton} onPress={() => setCurrentIndex(0)}>
              <Text style={styles.resetButtonText}>Start Over</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {currentIndex < projects.length && (
        <View style={styles.buttonsContainer}>
          <TouchableOpacity style={styles.passButton} onPress={advance}>
            <Ionicons name="close" size={40} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.likeButton} onPress={advance}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#fff' },
  cardContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 430,
    height: SCREEN_HEIGHT * 0.70,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  cardBehind: { transform: [{ scale: 0.95 }], opacity: 0.8 },

  targetIcon: { position: 'absolute', top: -5, right: -5, backgroundColor: '#fff', borderRadius: 15, padding: 3 },
  targetOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#333', justifyContent: 'center', alignItems: 'center' },
  targetInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },

  content: { flex: 1, padding: 20, paddingTop: 30 },
  location: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },

  imageContainer: { width: '100%', height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 20, backgroundColor: '#8FBC8F' },
  projectImage: { width: '100%', height: '100%' },

  descriptionSection: { marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  description: { fontSize: 14, color: '#333', lineHeight: 20, textAlign: 'center'},

  // overlays
  likeOverlay: { position: 'absolute', top: 50, right: 30, zIndex: 5, transform: [{ rotate: '20deg' }], borderWidth: 4, borderColor: '#4CAF50', borderRadius: 10, padding: 10 },
  nopeOverlay: { position: 'absolute', top: 50, left: 30, zIndex: 5, transform: [{ rotate: '-20deg' }], borderWidth: 4, borderColor: '#F44336', borderRadius: 10, padding: 10 },
  overlayText: { fontSize: 32, fontWeight: 'bold', color: '#4CAF50' },

  buttonsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 40, paddingBottom: 40 },
  passButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  likeButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },

  endCard: { width: SCREEN_WIDTH * 0.9, maxWidth: 430, height: SCREEN_HEIGHT * 0.70, backgroundColor: '#fff', borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  endText: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  resetButton: { backgroundColor: '#007AFF', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 },
  resetButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // skills chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: { backgroundColor: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 8 },
  chipText: { fontSize: 13, color: '#333' },

  section : {marginBottom : 12},

  // avatar
  avatarSection: { alignItems: 'center', paddingTop: 32, paddingBottom: 20, paddingHorizontal: 24 },
  avatarWrapper: { width: 88, height: 88, borderRadius: 44, overflow: 'hidden', borderWidth: 2, borderColor: '#fff', marginBottom: 14, elevation: 3 },
  avatar: { width: '100%', height: '100%' },
  candidateName: { fontSize: 26, fontWeight: '700', color: '#1A1A1A', letterSpacing: 0.3, textAlign: 'center', marginBottom: 6 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13, color: '#888', letterSpacing: 0.2 },

  //timeline for education and experience
  timeline: { paddingLeft: 4, marginBottom: 4 },
  timelineItem: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-start' },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1A1A1A', marginTop: 5, marginRight: 14, flexShrink: 0 },
  timelineContent: { flex: 1 },
  timelineTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  timelineSubtitle: { fontSize: 13, color: '#555', marginBottom: 1, fontWeight: '500' },
  timelineMeta: { fontSize: 11, color: '#AAA', letterSpacing: 0.5, marginBottom: 5 },
  timelineDesc: { fontSize: 13, color: '#666', lineHeight: 19 },

  // personal project
  projectBlock: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f5f5f5' },
  projectBlockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  projectBlockName: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },

  //links
  linksContainer: { gap: 10 },
  linkRow: { flexDirection: 'row', alignItems: 'center' },
  linkText: { fontSize: 12, color: '#666', flex: 1 },

});
