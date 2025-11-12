import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

// -----------------------------
// Types
// -----------------------------

type ResumeAsset = {
  name: string;
  uri: string;
  mimeType?: string | null;
  size?: number | null;
};

// -----------------------------
// Utils
// -----------------------------

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function ensureExtension(name: string, fallbackExt = '.pdf') {
  return name.includes('.') ? name : name + fallbackExt;
}

async function uploadResumeIfNeeded(resume: ResumeAsset | null, userId: string): Promise<string | null> {
  if (!resume) return null;

  // Read file into ArrayBuffer (works in Expo iOS/Android without Blob)
  const response = await fetch(resume.uri);
  if (!response.ok) {
    throw new Error('Could not read selected file');
  }
  const arrayBuffer = await response.arrayBuffer();

  const safeName = sanitizeFilename(resume.name || 'resume');
  const withExt = ensureExtension(safeName);
  const objectPath = `${userId}/${Date.now()}-${withExt}`; // e.g. 123/1700000000-resume.pdf
  const contentType = resume.mimeType ?? 'application/octet-stream';

  const { error: uploadErr } = await supabase.storage
    .from('resumes')
    .upload(objectPath, arrayBuffer, { contentType, upsert: true });
  if (uploadErr) throw uploadErr;

  // Use signed URL if bucket is private
  const { data: signed, error: signedErr } = await supabase.storage
    .from('resumes')
    .createSignedUrl(objectPath, 60 * 60 * 24 * 7); // 7 days
  if (signedErr) throw signedErr;

  return signed?.signedUrl ?? null;
}

// -----------------------------
// Component
// -----------------------------

export default function SetupScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [resume, setResume] = useState<ResumeAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // On mount: if user already onboarded, skip to app
  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        if (!session) return;

        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('onboarded')
          .eq('id', session.user.id)
          .single();

        if (profileErr) return; // don't hard-fail the screen
        if (profile?.onboarded) router.replace('/(tabs)');
      } catch (e) {
        console.warn('checkOnboardingStatus error', e);
      }
    })();
  }, []);

  const handleFileSelection = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      const asset: ResumeAsset = {
        name: file.name ?? 'resume.pdf',
        uri: file.uri,
        size: file.size ?? null,
        mimeType: file.mimeType ?? null,
      };

      if (asset.size && asset.size > MAX_BYTES) {
        setError('File size must be less than 5MB');
        return;
      }

      setResume(asset);
      setError('');
    } catch (e) {
      console.error('Document pick error', e);
      setError('Failed to select document');
    }
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
    setError('Please enter your first and last name');
    return;
  }
  if (!resume) {
    setError('Please upload your resume');
    return;
  }

    setLoading(true);
    setError('');

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) throw new Error('No active session');
      const userId = userData.user.id;

      // Upload resume (optional)
      const resumeUrl = await uploadResumeIfNeeded(resume, userId);

      const payload = {
        id: userId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        resume_url: resumeUrl, // may be null if not provided
        onboarded: true,
        resume_updated_at: new Date().toISOString(),
      } as const;

      const { error: dbError } = await supabase.from('profiles').upsert(payload);
      if (dbError) throw dbError;

      setSuccess(true);
      setTimeout(() => router.replace('/(tabs)'), 1200);
    } catch (e: any) {
      console.error('onboarding error', e);
      setError(e?.message ?? 'Failed to save information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successInner}>
          <View style={styles.successIconWrap}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Welcome aboard!</Text>
          <Text style={styles.successSubtitle}>Redirecting you to your dashboard…</Text>
        </View>
      </View>
    );
  }

  const submitDisabled = loading || !firstName.trim() || !lastName.trim() || !resume;

  return (
    <ScrollView style={styles.root}>
      <View style={styles.wrapper}>
        <View style={styles.headerBlock}>
          <Text style={styles.headerTitle}>Welcome to Peer.io</Text>
          <Text style={styles.headerSubtitle}>Let&apos;s get you set up</Text>
        </View>

        <View style={styles.formGap}>
          <View>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              onSubmitEditing={handleSubmit}
              style={styles.input}
              placeholder="John"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
            />
          </View>

          <View>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              onSubmitEditing={handleSubmit}
              style={styles.input}
              placeholder="Doe"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
            />
          </View>

          <View>
            <Text style={styles.label}>
              Resume
            </Text>
            <TouchableOpacity style={styles.uploadBtn} onPress={handleFileSelection}>
              <Text style={styles.uploadText}>📄 {resume ? resume.name : 'Upload resume'}</Text>
            </TouchableOpacity>
            <Text style={styles.helpText}>PDF or Word document (max 5MB)</Text>
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.ctaGap}>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitDisabled}
              style={[styles.primaryBtn, submitDisabled && styles.primaryBtnDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Get Started</Text>
              )}
            </TouchableOpacity>

            {/* <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.linkBtn}>
              <Text style={styles.linkText}>Skip for now</Text>
            </TouchableOpacity> */}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  wrapper: { padding: 24, paddingTop: 64, maxWidth: 400, width: '100%', alignSelf: 'center' },
  headerBlock: { marginBottom: 48 },
  headerTitle: { fontSize: 30, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  headerSubtitle: { fontSize: 18, color: '#6b7280' },
  formGap: { gap: 24 },
  label: { fontSize: 16, fontWeight: '500', color: '#111827', marginBottom: 12 },
  optional: { color: '#9ca3af', fontWeight: '400' },
  input: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#f9fafb',
    color: '#111827',
    fontSize: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  uploadText: { color: '#4b5563', fontSize: 16 },
  helpText: { fontSize: 14, color: '#9ca3af', marginTop: 8 },
  errorBox: { backgroundColor: '#fef2f2', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  errorText: { color: '#dc2626', fontSize: 14 },
  ctaGap: { gap: 12, paddingTop: 16 },
  primaryBtn: {
    width: '100%',
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: '#9ca3af' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkBtn: { width: '100%', paddingVertical: 16, alignItems: 'center' },
  linkText: { color: '#6b7280', fontSize: 16 },
  successContainer: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successInner: { alignItems: 'center', maxWidth: 320, width: '100%' },
  successIconWrap: {
    width: 80,
    height: 80,
    backgroundColor: '#d1fae5',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successIcon: { fontSize: 40, color: '#10b981' },
  successTitle: { fontSize: 24, fontWeight: '600', color: '#111827', marginBottom: 8 },
  successSubtitle: { color: '#6b7280', fontSize: 16 },
});
