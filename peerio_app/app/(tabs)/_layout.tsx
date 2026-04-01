import { SlidingTabBar } from '@/components/sliding-tab-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

export default function TabLayout() {
  const { session, loading } = useAuth();
  const { matchCount } = useNotifications();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <ActivityIndicator size="large" color="#79BE58" />
      </View>
    );
  }

  // Redirect to login if not authenticated
  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      tabBar={(props) => <SlidingTabBar {...props} matchCount={matchCount} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          href: null, // hides it from the tab bar
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color, size }) => <IconSymbol size={size} name="house.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="candidates"
        options={{
          title: 'Candidates',
          tabBarIcon: ({ color, size }) => <IconSymbol size={size} name="paperplane.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color, size }) => <IconSymbol size={size} name="star.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <IconSymbol size={size} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
