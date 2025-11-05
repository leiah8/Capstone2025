import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;

interface Skill {
  name: string;
  level: number; // 1-3 stars
}

interface Project {
  id: string;
  name: string;
  location: string;
  image: string;
  description: string;
  skills: Skill[];
  creatorImage: string;
}

// Sample data
const SAMPLE_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'AI Recipe Generator',
    location: 'Toronto, ON',
    image: 'https://picsum.photos/400/300?random=1',
    description: 'Building an AI-powered app that generates personalized recipes based on dietary preferences and available ingredients.',
    skills: [
      { name: 'Python', level: 3 },
      { name: 'React Native', level: 2 },
      { name: 'OpenAI API', level: 3 },
    ],
    creatorImage: 'https://i.pravatar.cc/150?img=1',
  },
  {
    id: '2',
    name: 'Fitness Tracker App',
    location: 'Hamilton, ON',
    image: 'https://picsum.photos/400/300?random=2',
    description: 'Creating a comprehensive fitness tracking application with social features and AI-powered workout recommendations.',
    skills: [
      { name: 'Swift', level: 2 },
      { name: 'Firebase', level: 3 },
      { name: 'UI/UX', level: 2 },
    ],
    creatorImage: 'https://i.pravatar.cc/150?img=2',
  },
  {
    id: '3',
    name: 'E-commerce Platform',
    location: 'Waterloo, ON',
    image: 'https://picsum.photos/400/300?random=3',
    description: 'Developing a modern e-commerce platform with AR try-on features and personalized shopping experiences.',
    skills: [
      { name: 'React', level: 3 },
      { name: 'Node.js', level: 3 },
      { name: 'MongoDB', level: 2 },
    ],
    creatorImage: 'https://i.pravatar.cc/150?img=3',
  },
];

const ProjectCard = ({ project, isTop, onSwipe }: { 
  project: Project; 
  isTop: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
}) => {
  const position = useRef(new Animated.ValueXY()).current;
  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          swipeRight();
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          swipeLeft();
        } else {
          resetPosition();
        }
      },
    })
  ).current;

  const swipeRight = () => {
    Animated.timing(position, {
      toValue: { x: SCREEN_WIDTH + 100, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      onSwipe('right');
      position.setValue({ x: 0, y: 0 });
    });
  };

  const swipeLeft = () => {
    Animated.timing(position, {
      toValue: { x: -SCREEN_WIDTH - 100, y: 0 },
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      onSwipe('left');
      position.setValue({ x: 0, y: 0 });
    });
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  const renderStars = (level: number) => {
    return '★'.repeat(level) + '☆'.repeat(3 - level);
  };

  const animatedStyle = {
    transform: [
      { translateX: position.x },
      { translateY: position.y },
      { rotate },
    ],
  };

  return (
    <Animated.View
      style={[
        styles.card,
        animatedStyle,
        !isTop && styles.cardBehind,
      ]}
      {...(isTop ? panResponder.panHandlers : {})}
    >
      {/* Swipe overlays */}
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

      {/* Creator avatar in top left */}
      <View style={styles.avatarContainer}>
        <Image source={{ uri: project.creatorImage }} style={styles.avatar} />
        <View style={styles.targetIcon}>
          <View style={styles.targetOuter}>
            <View style={styles.targetInner} />
          </View>
        </View>
      </View>

      {/* Project content */}
      <View style={styles.content}>
        <Text style={styles.projectName}>{project.name}</Text>
        <Text style={styles.location}>{project.location}</Text>

        <View style={styles.imageContainer}>
          <Image source={{ uri: project.image }} style={styles.projectImage} />
        </View>

        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>Project Description</Text>
          <Text style={styles.description}>{project.description}</Text>
        </View>

        <View style={styles.skillsSection}>
          <Text style={styles.sectionTitle}>Skills Wanted</Text>
          {project.skills.map((skill, index) => (
            <View key={index} style={styles.skillRow}>
              <Text style={styles.skillName}>{skill.name}</Text>
              <View style={styles.skillDots}>
                <Text style={styles.dots}>{'•'.repeat(20)}</Text>
              </View>
              <Text style={styles.skillLevel}>{renderStars(skill.level)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
};

export default function ProjectFeed() {
  const [projects, setProjects] = useState(SAMPLE_PROJECTS);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleSwipe = (direction: 'left' | 'right') => {
    console.log(`Swiped ${direction} on project:`, projects[currentIndex].name);
    setCurrentIndex(currentIndex + 1);
  };

  const handlePass = () => {
    if (currentIndex < projects.length) {
      const position = new Animated.ValueXY();
      Animated.timing(position, {
        toValue: { x: -SCREEN_WIDTH - 100, y: 0 },
        duration: 250,
        useNativeDriver: false,
      }).start(() => {
        setCurrentIndex(currentIndex + 1);
      });
    }
  };

  const handleInterested = () => {
    if (currentIndex < projects.length) {
      const position = new Animated.ValueXY();
      Animated.timing(position, {
        toValue: { x: SCREEN_WIDTH + 100, y: 0 },
        duration: 250,
        useNativeDriver: false,
      }).start(() => {
        setCurrentIndex(currentIndex + 1);
      });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.cardContainer}>
        {projects
          .slice(currentIndex, currentIndex + 2)
          .reverse()
          .map((project, index) => {
            const isTop = index === 1;
            return (
              <ProjectCard
                key={project.id}
                project={project}
                isTop={isTop}
                onSwipe={handleSwipe}
              />
            );
          })}
        {currentIndex >= projects.length && (
          <View style={styles.endCard}>
            <Text style={styles.endText}>No more projects!</Text>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => setCurrentIndex(0)}
            >
              <Text style={styles.resetButtonText}>Start Over</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Action buttons */}
      {currentIndex < projects.length && (
        <View style={styles.buttonsContainer}>
          <TouchableOpacity style={styles.passButton} onPress={handlePass}>
            <Ionicons name="close" size={40} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.likeButton} onPress={handleInterested}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_HEIGHT * 0.75,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  cardBehind: {
    transform: [{ scale: 0.95 }],
    opacity: 0.8,
  },
  avatarContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 10,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#fff',
  },
  targetIcon: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 3,
  },
  targetOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 30,
  },
  projectName: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 50,
    marginBottom: 4,
  },
  location: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  imageContainer: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#8FBC8F',
  },
  projectImage: {
    width: '100%',
    height: '100%',
  },
  descriptionSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    textAlign: 'center',
  },
  skillsSection: {
    marginBottom: 20,
  },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  skillName: {
    fontSize: 16,
    width: 100,
  },
  skillDots: {
    flex: 1,
    marginHorizontal: 10,
  },
  dots: {
    fontSize: 8,
    color: '#ddd',
    letterSpacing: 2,
  },
  skillLevel: {
    fontSize: 16,
    width: 50,
    textAlign: 'right',
  },
  likeOverlay: {
    position: 'absolute',
    top: 50,
    right: 30,
    zIndex: 5,
    transform: [{ rotate: '20deg' }],
    borderWidth: 4,
    borderColor: '#4CAF50',
    borderRadius: 10,
    padding: 10,
  },
  nopeOverlay: {
    position: 'absolute',
    top: 50,
    left: 30,
    zIndex: 5,
    transform: [{ rotate: '-20deg' }],
    borderWidth: 4,
    borderColor: '#F44336',
    borderRadius: 10,
    padding: 10,
  },
  overlayText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  passButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  likeButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  endCard: {
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_HEIGHT * 0.75,
    backgroundColor: '#fff',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  endText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  resetButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});