// app/(tabs)/projects.tsx

/* =========================
   Imports & setup
   ========================= */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProjects, ProjectUI } from '../../lib/projects';
import { getUserProfile } from '../../lib/user-profile';
import { getMatchedProjects, checkMatchingAPIHealth, getResumeText } from '../../lib/matching-api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;

/* =========================
   Types (make skills optional & flexible)
   ========================= */
type Project = ProjectUI & {
  skillsNeeded?: string[];
  // tolerate legacy shape if it exists
  skills?: { name: string; level?: number }[];
};

/* =========================
   Swipeable Card
   ========================= */
const ProjectCard = ({
  project, isTop, onSwipe,
}: { project: Project; isTop: boolean; onSwipe: (d: 'left' | 'right') => void }) => {
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

  // unify skills source (supports either shape)
  const skills =
    project.skillsNeeded && project.skillsNeeded.length > 0
      ? project.skillsNeeded
      : (project.skills?.map(s => s.name) ?? []);

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

      {/* Creator avatar */}
      <View style={styles.avatarContainer}>
        <Image source={{ uri: project.creatorImage }} style={styles.avatar} />
        <View style={styles.targetIcon}><View style={styles.targetOuter}><View style={styles.targetInner} /></View></View>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.projectName}>{project.name}</Text>
        <Text style={styles.location}>{project.location}</Text>

        <View style={styles.imageContainer}>
          <Image source={{ uri: project.image }} style={styles.projectImage} />
        </View>

        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>Project Description</Text>
          <Text style={styles.description}>{project.description}</Text>
        </View>

        {/* Skills chips (if available) */}
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
      </ScrollView>
    </Animated.View>
  );
};

/* =========================
   Screen: fetch & swipe stack
   ========================= */
export default function ProjectFeed() {
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState<Project[]>([]);
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
        const allProjects = await fetchProjects(50);
        if (!alive) return;

        // Check if matching API is available
        const matchingAvailable = await checkMatchingAPIHealth();
        
        if (matchingAvailable) {
          console.log('Matching API available - ranking projects by match score...');
          try {
            // Get current authenticated user's profile
            const userProfile = await getUserProfile();
            
            // Fetch and parse resume text for semantic similarity
            const resumeText = await getResumeText(userProfile.resume_url);
            if (resumeText) {
              console.log(`Using resume text for semantic similarity (${resumeText.length} chars)`);
            } else {
              console.log('No resume text available, falling back to bio');
            }
            
            // Use resume text if available, otherwise fall back to bio
            const profileForMatching = {
              ...userProfile,
              bio: resumeText || userProfile.bio || '',
            };
            
            // Get matched and ranked projects
            const matchScores = await getMatchedProjects(profileForMatching, allProjects);
            
            // Create a map of project IDs to match scores
            const scoreMap = new Map(matchScores.map(m => [m.project_id, m.overall_score]));
            
            // Sort projects by match score
            const rankedProjects = [...allProjects].sort((a, b) => {
              const scoreA = scoreMap.get(a.id) || 0;
              const scoreB = scoreMap.get(b.id) || 0;
              return scoreB - scoreA; // Higher scores first
            });
            
            setProjects(rankedProjects as Project[]);
            setUseMatching(true);
            console.log(`Projects ranked by match score (top: ${(scoreMap.get(rankedProjects[0].id) || 0) * 100}%)`);
          } catch (matchError) {
            console.warn('Failed to rank projects, using default order:', matchError);
            setProjects(allProjects as Project[]);
          }
        } else {
          console.log('Matching API not available - showing projects in default order');
          setProjects(allProjects as Project[]);
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
  if (err) return <View style={styles.center}><Text>Failed to load projects: {err}</Text></View>;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.cardContainer}>
        {projects.slice(currentIndex, currentIndex + 2).reverse().map((p, i) => (
          <ProjectCard key={p.id} project={p} isTop={i === 1} onSwipe={advance} />
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

  avatarContainer: { position: 'absolute', top: 20, left: 20, zIndex: 10 },
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#fff' },

  targetIcon: { position: 'absolute', top: -5, right: -5, backgroundColor: '#fff', borderRadius: 15, padding: 3 },
  targetOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#333', justifyContent: 'center', alignItems: 'center' },
  targetInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },

  content: { flex: 1, padding: 20, paddingTop: 30 },
  projectName: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginTop: 50, marginBottom: 4 },
  location: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },

  imageContainer: { width: '100%', height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 20, backgroundColor: '#8FBC8F' },
  projectImage: { width: '100%', height: '100%' },

  descriptionSection: { marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  description: { fontSize: 14, color: '#333', lineHeight: 20, textAlign: 'center' },

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
});
