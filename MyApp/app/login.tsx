import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // Redirect if already logged in
useEffect(() => {
  (async () => {
    if (!session) return;

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();

    // If profile row doesn’t exist, create a blank one
    if (profileError && profileError.code === 'PGRST116') {
      const { error: upsertErr } = await supabase.from('profiles').upsert({ id: user.id, name: '' });
      if (upsertErr) {
        console.error(upsertErr);
        return;
      }
      profile = { name: '' };
    } else if (profileError) {
      console.error(profileError);
      return;
    }

    if (!profile?.name || !profile.name.trim()) {
      router.replace('/setup');
    } else {
      router.replace('/(tabs)');
    }
  })();
}, [session]);


  async function handleAuth() {
  if (!email || !password) {
    Alert.alert('Error', 'Please fill in all fields');
    return;
  }
  if (isSignUp && password !== confirmPassword) {
    Alert.alert('Error', 'Passwords do not match');
    return;
  }
  if (isSignUp && password.length < 6) {
    Alert.alert('Error', 'Password must be at least 6 characters');
    return;
  }

  setLoading(true);
  try {
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        Alert.alert('Sign Up Error', error.message);
      } else {
        Alert.alert('Success', 'Account created! Please check your email for verification.');
        setIsSignUp(false);
        setPassword('');
        setConfirmPassword('');
      }
      return; // stop here after sign-up
    }

    // Sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      Alert.alert('Sign In Error', signInError.message);
      return;
    }

    // Current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      Alert.alert('Error', 'Unable to fetch user after login.');
      return;
    }

    // Try to get profile.name (may be null or row may not exist)
    const { data: profile, error: profileError, status } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError && status !== 406) {
      // status 406 = no rows; allow handled path below
      console.error(profileError);
      Alert.alert('Error', 'Unable to load profile info.');
      return;
    }

    // If no row yet, create a blank profile so setup can fill it
    let displayName = profile?.name ?? null;
    if (!profile && status === 406) {
      const { error: upsertErr } = await supabase
        .from('profiles')
        .upsert({ id: user.id, name: '' });
      if (upsertErr) {
        console.error(upsertErr);
        Alert.alert('Error', 'Unable to initialize profile.');
        return;
      }
      displayName = null;
    }

    // Route based on whether name is present
    if (!displayName || !`${displayName}`.trim()) {
      router.replace('/setup');
    } else {
      router.replace('/(tabs)');
    }
  } catch (e: any) {
    console.error(e);
    Alert.alert('Error', e?.message ?? 'Something went wrong.');
  } finally {
    setLoading(false);
  }
}


  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.content}>
        <Text style={styles.title}>Peer.io</Text>
        <Text style={styles.subtitle}>Find a project!</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        {!isSignUp && (
          <TouchableOpacity onPress={() => router.push('/forgot-password')} disabled={loading}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        )}

        {isSignUp && (
          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="password"
          />
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toggleButton}
          onPress={() => {
            setIsSignUp(!isSignUp);
            setConfirmPassword('');
          }}
          disabled={loading}
        >
          <Text style={styles.toggleText}>
            {isSignUp
              ? 'Already have an account? Sign In'
              : "Don't have an account? Sign Up"}
          </Text>
        </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 40,
    textAlign: 'center',
    color: '#666',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    marginBottom: 15,
    borderRadius: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  toggleButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    color: '#007AFF',
    fontSize: 16,
  },
  forgotText: {
    color: '#007AFF',
    fontSize: 14,
    textAlign: 'right',
    marginBottom: 10,
  },
});