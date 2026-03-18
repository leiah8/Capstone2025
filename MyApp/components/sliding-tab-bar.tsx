import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';

type SlidingTabBarProps = BottomTabBarProps & {
  matchCount?: number;
};

type RouteOptions = {
  href?: string | null;
  tabBarAccessibilityLabel?: string;
  tabBarButtonTestID?: string;
  tabBarIcon?: (props: {
    focused: boolean;
    color: string;
    size: number;
  }) => ReactNode;
  tabBarLabel?: string;
  title?: string;
};

const TRACK_PADDING = 6;

const LIGHT_PALETTE = {
  shadow: '#9EADD6',
  trackBackground: '#FFFFFF',
  trackBorder: '#DCE5F6',
  indicatorBackground: '#E6EEFF',
  activeText: '#2B4CD8',
  inactiveText: '#172033',
  activeBadgeBackground: '#3755E8',
  activeBadgeText: '#FFFFFF',
  inactiveBadgeBackground: '#EDF2FF',
  inactiveBadgeText: '#3755E8',
};

const DARK_PALETTE = {
  shadow: '#000000',
  trackBackground: '#1D2432',
  trackBorder: '#2B3550',
  indicatorBackground: '#33415F',
  activeText: '#F5F7FF',
  inactiveText: '#C7D1E8',
  activeBadgeBackground: '#90A7FF',
  activeBadgeText: '#18203A',
  inactiveBadgeBackground: '#28324B',
  inactiveBadgeText: '#D7E0FF',
};

export function SlidingTabBar({
  state,
  descriptors,
  navigation,
  matchCount = 0,
}: SlidingTabBarProps) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useSharedValue(0);
  const palette = colorScheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;

  const visibleRoutes = useMemo(
    () =>
      state.routes.filter((route) => {
        const options = descriptors[route.key]?.options as RouteOptions | undefined;
        return route.name !== 'index' && options?.href !== null;
      }),
    [descriptors, state.routes]
  );

  const focusedRoute = state.routes[state.index];
  const activeIndex = Math.max(
    0,
    visibleRoutes.findIndex((route) => route.key === focusedRoute.key)
  );
  const segmentWidth =
    visibleRoutes.length > 0
      ? Math.max((trackWidth - TRACK_PADDING * 2) / visibleRoutes.length, 0)
      : 0;

  useEffect(() => {
    const nextPosition = segmentWidth * activeIndex;
    translateX.value =
      segmentWidth > 0
        ? withTiming(nextPosition, { duration: 220 })
        : nextPosition;
  }, [activeIndex, segmentWidth, translateX]);

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  if (visibleRoutes.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.outer,
        {
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: palette.trackBackground,
        },
      ]}>
      <View
        onLayout={handleTrackLayout}
        style={[
          styles.track,
          {
            backgroundColor: palette.trackBackground,
            borderColor: palette.trackBorder,
            shadowColor: palette.shadow,
          },
        ]}>
        {segmentWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              animatedIndicatorStyle,
              {
                left: TRACK_PADDING,
                width: segmentWidth,
                backgroundColor: palette.indicatorBackground,
                shadowColor: palette.shadow,
              },
            ]}
          />
        )}

        {visibleRoutes.map((route) => {
          const isFocused = focusedRoute.key === route.key;
          const options = descriptors[route.key]?.options as RouteOptions | undefined;
          const badgeCount = route.name === 'matches' ? matchCount : 0;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (Platform.OS === 'ios') {
              void Haptics.selectionAsync();
            }

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options?.tabBarAccessibilityLabel}
              testID={options?.tabBarButtonTestID}
              onLongPress={onLongPress}
              onPress={onPress}
              style={styles.segment}>
              <View style={styles.segmentContent}>
                {options?.tabBarIcon?.({
                  focused: isFocused,
                  color: isFocused ? palette.activeText : palette.inactiveText,
                  size: 24,
                })}
                {badgeCount > 0 && (
                  <View
                    style={[
                      styles.badge,
                      styles.badgeOverlay,
                      {
                        backgroundColor: isFocused
                          ? palette.activeBadgeBackground
                          : palette.inactiveBadgeBackground,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color: isFocused
                            ? palette.activeBadgeText
                            : palette.inactiveBadgeText,
                        },
                      ]}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: isFocused ? palette.activeText : palette.inactiveText },
                ]}>
                {getTabLabel(route.name, options)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function getTabLabel(routeName: string, options?: RouteOptions) {
  if (typeof options?.tabBarLabel === 'string') {
    return options.tabBarLabel;
  }

  if (typeof options?.title === 'string') {
    return options.title;
  }

  return routeName.charAt(0).toUpperCase() + routeName.slice(1);
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  track: {
    alignItems: 'center',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: TRACK_PADDING,
    paddingVertical: TRACK_PADDING,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
      android: {
        elevation: 7,
      },
      default: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
      },
    }),
  },
  indicator: {
    borderRadius: 24,
    bottom: TRACK_PADDING,
    position: 'absolute',
    top: TRACK_PADDING,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 2,
      },
      default: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
    }),
  },
  segment: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 4,
    zIndex: 1,
  },
  segmentContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 34,
    position: 'relative',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
    marginTop: 4,
  },
  badge: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 5,
    height: 20,
  },
  badgeOverlay: {
    position: 'absolute',
    right: -12,
    top: -6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
