// app/(tabs)/projects.tsx

/* =========================
   Imports & setup
   ========================= */
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { checkMatchingAPIHealth, getMatchedProjects } from '../../lib/matching-api';
import { fetchProjects, likeProject, ProjectUI } from '../../lib/projects';
import { supabase } from '../../lib/supabase';
import { getUserProfile } from '../../lib/user-profile';

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
const TAP_THRESHOLD = 5;

const ProjectCard = ({
  project, isTop, onSwipe, onTap,
}: { project: Project; isTop: boolean; onSwipe: (d: 'left' | 'right') => void; onTap: () => void }) => {
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
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 10,
      onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: 0 }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) swipeRight();
        else if (g.dx < -SWIPE_THRESHOLD) swipeLeft();
        else if (Math.abs(g.dx) < TAP_THRESHOLD && Math.abs(g.dy) < TAP_THRESHOLD) { resetPosition(); onTap(); }
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
        { transform: [{ translateX: position.x }, { rotate }] },
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
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} nestedScrollEnabled>
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

export default function ProjectFeed() {
  const { session } = useAuth();
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [useMatching, setUseMatching] = useState(false);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [myProjects, setMyProjects] = useState<MyProject[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const loadBrowseProjects = useCallback(async () => {
    let alive = true;
    try {
      setLoading(true);

      // Fetch all projects (exclude own)
      const allProjects = await fetchProjects(50, session?.user?.id);
      if (!alive) return;

      // Check if matching API is available
      const matchingAvailable = await checkMatchingAPIHealth();

      if (matchingAvailable) {
        console.log('Matching API available - ranking projects by match score...');
        try {
          const userProfile = await getUserProfile();
          const matchScores = await getMatchedProjects(userProfile, allProjects);
          const scoreMap = new Map(matchScores.map(m => [m.project_id, m.overall_score]));

          const rankedProjects = [...allProjects].sort((a, b) => {
            const scoreA = scoreMap.get(a.id) || 0;
            const scoreB = scoreMap.get(b.id) || 0;
            return scoreB - scoreA;
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
    return () => { alive = false; };
  }, [session?.user?.id]);

  // Re-fetch data every time the screen gains focus (e.g. returning from edit/create)
  useFocusEffect(
    useCallback(() => {
      loadBrowseProjects();
      if (tab === 'mine') fetchMyProjects();
    }, [tab, loadBrowseProjects])
  );

  const advance = () => { if (currentIndex < projects.length) setCurrentIndex((i) => i + 1); };

  const handleSwipe = async (direction: 'left' | 'right') => {
    const project = projects[currentIndex];
    advance();
    if (direction !== 'right' || !session?.user?.id || !project) return;
    try {
      await likeProject(session.user.id, project.owner_id, project.id, 'like');
    } catch (e: any) {
      console.warn('Failed to record project like:', e.message ?? e);
    }
  };

  const fetchMyProjects = async () => {
    if (!session?.user?.id) return;
    setMyLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, title, description, skills_needed, tags, image, is_active, created_at')
        .eq('owner_id', session.user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMyProjects((data ?? []) as MyProject[]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load your projects.');
    } finally {
      setMyLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'mine') fetchMyProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const toggleActive = async (project: MyProject) => {
    const newStatus = !project.is_active;
    const { error } = await supabase
      .from('projects')
      .update({ is_active: newStatus })
      .eq('id', project.id)
      .eq('owner_id', session?.user?.id);
    if (error) {
      console.error('Toggle active error:', error);
      Alert.alert('Error', error.message || 'Failed to update project status.');
      return;
    }
    setMyProjects((prev) => prev.map((p) => p.id === project.id ? { ...p, is_active: newStatus } : p));
  };

  const deleteProject = (project: MyProject) => {
    Alert.alert('Delete Project', `Are you sure you want to delete "${project.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('projects').delete().eq('id', project.id);
          if (error) { Alert.alert('Error', 'Failed to delete project.'); return; }
          setMyProjects((prev) => prev.filter((p) => p.id !== project.id));
        },
      },
    ]);
  };

  if (loading && tab === 'browse') return <View style={styles.center}><Text>Loading projects…</Text></View>;
  if (err && tab === 'browse') return <View style={styles.center}><Text>Failed to load projects: {err}</Text></View>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with dropdown + create button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerDropdown} onPress={() => setDropdownOpen(!dropdownOpen)}>
          <Text style={styles.headerTitle}>{tab === 'browse' ? 'Browse Projects' : 'My Projects'}</Text>
          <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.createButton} onPress={() => router.push('/create-project')}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Dropdown menu */}
      {dropdownOpen && (
        <View style={styles.dropdown}>
          <TouchableOpacity
            style={[styles.dropdownItem, tab === 'browse' && styles.dropdownItemActive]}
            onPress={() => { setTab('browse'); setDropdownOpen(false); }}
          >
            <Ionicons name="compass-outline" size={18} color={tab === 'browse' ? '#007AFF' : '#666'} />
            <Text style={[styles.dropdownText, tab === 'browse' && styles.dropdownTextActive]}>Browse Projects</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dropdownItem, tab === 'mine' && styles.dropdownItemActive]}
            onPress={() => { setTab('mine'); setDropdownOpen(false); }}
          >
            <Ionicons name="folder-outline" size={18} color={tab === 'mine' ? '#007AFF' : '#666'} />
            <Text style={[styles.dropdownText, tab === 'mine' && styles.dropdownTextActive]}>My Projects</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Browse view */}
      {tab === 'browse' && (
        <>
          <View style={styles.cardContainer}>
            {projects.slice(currentIndex, currentIndex + 2).reverse().map((p, i) => (
              <ProjectCard key={p.id} project={p} isTop={i === 1} onSwipe={handleSwipe} onTap={() => setDetailProject(p)} />
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
              <TouchableOpacity style={styles.passButton} onPress={() => handleSwipe('left')}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.likeButton} onPress={() => handleSwipe('right')}>
                <Ionicons name="checkmark" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* My Projects view */}
      {tab === 'mine' && (
        myLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>
        ) : myProjects.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ fontSize: 16, color: '#999', marginBottom: 16 }}>You haven't created any projects yet.</Text>
            <TouchableOpacity style={styles.resetButton} onPress={() => router.push('/create-project' as any)}>
              <Text style={styles.resetButtonText}>Create Your First Project</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
            {myProjects.map((p) => (
              <View key={p.id} style={styles.myProjectCard}>
                {p.image && <Image source={{ uri: p.image }} style={styles.myProjectImage} />}
                <View style={styles.myProjectInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.myProjectTitle} numberOfLines={1}>{p.title}</Text>
                    <View style={[styles.statusBadge, !p.is_active && styles.statusBadgeInactive]}>
                      <Text style={styles.statusBadgeText}>{p.is_active ? 'Active' : 'Paused'}</Text>
                    </View>
                  </View>
                  <Text style={styles.myProjectDesc} numberOfLines={2}>{p.description}</Text>
                  {p.skills_needed && p.skills_needed.length > 0 && (
                    <View style={[styles.chipsWrap, { justifyContent: 'flex-start', marginTop: 8 }]}>
                      {p.skills_needed.slice(0, 3).map((s, i) => (
                        <View key={`${s}-${i}`} style={styles.chip}>
                          <Text style={styles.chipText}>{s}</Text>
                        </View>
                      ))}
                      {p.skills_needed.length > 3 && (
                        <Text style={{ fontSize: 12, color: '#999' }}>+{p.skills_needed.length - 3}</Text>
                      )}
                    </View>
                  )}
                  <View style={styles.myProjectActions}>
                    <TouchableOpacity onPress={() => router.push({ pathname: '/edit-project', params: { id: String(p.id) } })} style={styles.actionButton}>
                      <Ionicons name="create-outline" size={22} color="#007AFF" />
                      <Text style={styles.actionText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleActive(p)} style={styles.actionButton}>
                      <Ionicons name={p.is_active ? 'pause-circle-outline' : 'play-circle-outline'} size={22} color="#007AFF" />
                      <Text style={styles.actionText}>{p.is_active ? 'Pause' : 'Activate'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteProject(p)} style={styles.actionButton}>
                      <Ionicons name="trash-outline" size={22} color="#F44336" />
                      <Text style={[styles.actionText, { color: '#F44336' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        )
      )}

      {/* Project Detail Modal */}
      <Modal visible={!!detailProject} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setDetailProject(null)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>

            {detailProject && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                {/* Creator avatar */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Image source={{ uri: detailProject.creatorImage }} style={styles.modalAvatar} />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.modalTitle}>{detailProject.name}</Text>
                    <Text style={styles.modalLocation}>{detailProject.location}</Text>
                  </View>
                </View>

                {/* Project image */}
                <View style={styles.modalImageContainer}>
                  <Image source={{ uri: detailProject.image }} style={styles.modalImage} />
                </View>

                {/* Description */}
                <Text style={styles.modalSectionTitle}>Project Description</Text>
                <Text style={styles.modalDescription}>{detailProject.description}</Text>

                {/* Skills */}
                {(() => {
                  const skills = detailProject.skillsNeeded?.length
                    ? detailProject.skillsNeeded
                    : (detailProject.skills?.map(s => s.name) ?? []);
                  return skills.length > 0 ? (
                    <>
                      <Text style={styles.modalSectionTitle}>Skills Needed</Text>
                      <View style={styles.chipsWrap}>
                        {skills.map((s, i) => (
                          <View key={`${s}-${i}`} style={styles.chip}>
                            <Text style={styles.chipText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : null;
                })()}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  createButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  cardContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 430,
    height: SCREEN_HEIGHT * 0.65,
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

  content: { flex: 1, padding: 20, paddingTop: 0 },
  projectName: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginTop: 0, marginBottom: 4 },
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

  buttonsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 60, paddingBottom: 10, paddingTop: 0 },
  passButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  likeButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },

  endCard: { width: SCREEN_WIDTH * 0.9, maxWidth: 430, height: SCREEN_HEIGHT * 0.65, backgroundColor: '#fff', borderRadius: 20, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  endText: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  resetButton: { backgroundColor: '#007AFF', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 },
  resetButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // skills chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: { backgroundColor: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 8 },
  chipText: { fontSize: 13, color: '#333' },

  // modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SCREEN_HEIGHT * 0.85, padding: 24, paddingTop: 16 },
  modalClose: { alignSelf: 'flex-end', padding: 4, marginBottom: 8 },
  modalAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#eee' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  modalLocation: { fontSize: 14, color: '#666', marginTop: 2 },
  modalImageContainer: { width: '100%', height: 200, borderRadius: 16, overflow: 'hidden', marginBottom: 20, backgroundColor: '#8FBC8F' },
  modalImage: { width: '100%', height: '100%' },
  modalSectionTitle: { fontSize: 17, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 16 },
  modalDescription: { fontSize: 15, color: '#444', lineHeight: 22 },

  // header dropdown
  headerDropdown: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dropdown: { position: 'absolute', top: 90, left: 20, right: 20, backgroundColor: '#fff', borderRadius: 12, zIndex: 100, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
  dropdownItemActive: { backgroundColor: '#F0F7FF' },
  dropdownText: { fontSize: 15, color: '#666' },
  dropdownTextActive: { color: '#007AFF', fontWeight: '600' },

  // my projects
  myProjectCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2, overflow: 'hidden' },
  myProjectImage: { width: '100%', height: 140 },
  myProjectInfo: { padding: 14 },
  myProjectTitle: { fontSize: 17, fontWeight: '600', color: '#333', flex: 1, marginRight: 8 },
  myProjectDesc: { fontSize: 13, color: '#666', lineHeight: 18, marginTop: 4 },
  statusBadge: { backgroundColor: '#E8F5E9', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  statusBadgeInactive: { backgroundColor: '#FFF3E0' },
  statusBadgeText: { fontSize: 12, fontWeight: '600', color: '#333' },
  myProjectActions: { flexDirection: 'row', marginTop: 12, gap: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, color: '#007AFF', fontWeight: '500' },
});
