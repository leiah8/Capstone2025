import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, StyleSheet, Text, View } from "react-native";

type MatchCelebrationOverlayProps = {
  accentColor?: string;
  highlight: string;
  onHidden: () => void;
  surfaceColor?: string;
  visible: boolean;
};

export default function MatchCelebrationOverlay({
  accentColor = "#79BE58",
  highlight,
  onHidden,
  surfaceColor = "#E8F5E2",
  visible,
}: MatchCelebrationOverlayProps) {
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.84)).current;
  const cardTranslateY = useRef(new Animated.Value(20)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.72)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!visible) return;

    backdropOpacity.setValue(0);
    cardOpacity.setValue(0);
    cardScale.setValue(0.84);
    cardTranslateY.setValue(20);
    ringOpacity.setValue(0);
    ringScale.setValue(0.72);

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          speed: 18,
          bounciness: 10,
          useNativeDriver: true,
        }),
        Animated.spring(cardTranslateY, {
          toValue: 0,
          speed: 18,
          bounciness: 6,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(ringOpacity, {
            toValue: 0.24,
            duration: 160,
            useNativeDriver: true,
          }),
          Animated.parallel([
            Animated.timing(ringScale, {
              toValue: 1.32,
              duration: 620,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(ringOpacity, {
              toValue: 0,
              duration: 620,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
      Animated.delay(850),
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.96,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    animationRef.current = animation;
    animation.start(({ finished }) => {
      animationRef.current = null;
      if (finished) onHidden();
    });

    return () => {
      animationRef.current?.stop();
      animationRef.current = null;
    };
  }, [
    backdropOpacity,
    cardOpacity,
    cardScale,
    cardTranslateY,
    onHidden,
    ringOpacity,
    ringScale,
    visible,
  ]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onHidden}
    >
      <Animated.View style={[styles.overlay, { opacity: backdropOpacity }]}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: surfaceColor,
              opacity: cardOpacity,
              borderColor: accentColor,
              transform: [{ scale: cardScale }, { translateY: cardTranslateY }],
            },
          ]}
        >
          <View style={styles.badgeWrap}>
            <Animated.View
              style={[
                styles.badgeRing,
                {
                  backgroundColor: surfaceColor,
                  borderColor: accentColor,
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Ionicons name="sparkles" size={26} color="#FFFFFF" />
            </View>
          </View>

          <Text style={[styles.eyebrow, { color: accentColor }]}>
            NEW MATCH
          </Text>
          <Text style={styles.title}>It&apos;s a match!</Text>
          <Text
            numberOfLines={1}
            style={[styles.highlight, { color: accentColor }]}
          >
            {highlight}
          </Text>
          <Text style={styles.subtitle}>Open Matches to start chatting.</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(8, 13, 26, 0.28)",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 26,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: "center",
    shadowColor: "#0A1326",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  badgeWrap: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  badgeRing: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 10,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#182033",
    textAlign: "center",
    marginBottom: 6,
  },
  highlight: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#5B6473",
    textAlign: "center",
  },
});
