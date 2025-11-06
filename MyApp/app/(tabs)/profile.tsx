// ProfilePage.tsx

/* =========================
   Imports & setup
   ========================= */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Image, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

/* =========================
   Screen
   ========================= */
export default function ProfilePage() {
  const { signOut, session } = useAuth();

  /* State */
  const [name, setName] = useState('');
  const [email] = useState(session?.user?.email || '');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [skills, setSkills] = useState<string[]>([]);
  const [skillSearch, setSkillSearch] = useState('');

  const [interests, setInterests] = useState<string[]>([]);
  const [interestSearch, setInterestSearch] = useState('');

  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [instagram, setInstagram] = useState('');
  const [twitter, setTwitter] = useState('');

  const [education, setEducation] = useState([
    { id: Date.now().toString(), school: '', degree: '', year: '' },
  ]);

  const [experience, setExperience] = useState([
    { id: Date.now().toString(), company: '', position: '', duration: '', description: '' },
  ]);

  const [projects, setProjects] = useState([
    { id: Date.now().toString(), name: '', description: '', link: '' },
  ]);

  const [loading, setLoading] = useState(true);

  /* Load profile */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session?.user?.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading profile:', error);
        } else if (data) {
          setName(data.name || '');
          setBio(data.bio || '');
          setLocation(data.location || '');
          setProfileImage(data.profile_image || null);
          setSkills(data.skills || []);
          setInterests(data.interests || []);
          if (data.links) {
            setGithub(data.links.github || '');
            setLinkedin(data.links.linkedin || '');
            setInstagram(data.links.instagram || '');
            setTwitter(data.links.twitter || '');
          }
          const loadedEducation = data.education || [];
          setEducation(loadedEducation.length ? loadedEducation : [{ id: Date.now().toString(), school: '', degree: '', year: '' }]);

          const loadedExperience = data.experience || [];
          setExperience(loadedExperience.length ? loadedExperience : [{ id: Date.now().toString(), company: '', position: '', duration: '', description: '' }]);

          const loadedProjects = data.personal_projects || [];
          setProjects(loadedProjects.length ? loadedProjects : [{ id: Date.now().toString(), name: '', description: '', link: '' }]);
        }
      } catch (e) {
        console.error('Error loading profile:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.user?.id]);

  /* Persist profile */
  const saveProfile = async () => {
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: session?.user?.id,
        name,
        bio,
        location,
        profile_image: profileImage,
        skills,
        interests,
        links: { github, linkedin, instagram, twitter },
        education,
        experience,
        personal_projects: projects,
        visible: true,
      });
      if (error) console.error('Error saving profile:', error);
    } catch (e) {
      console.error('Error saving profile:', e);
    }
  };

  /* Pick + upload profile image (Storage bucket: "profiles") */
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploadingImage(true);

      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${session?.user?.id}-${Date.now()}.${fileExt}`;
      const filePath = `profile-images/${fileName}`;

      const sessionToken = session?.access_token;
      if (!sessionToken) throw new Error('No session token found');

      const formData = new FormData();
      formData.append('file', {
        uri,
        name: fileName,
        type: 'image/jpeg',
      } as any);

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

      const uploadResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/profiles/${filePath}`,
        { method: 'POST', headers: { Authorization: `Bearer ${sessionToken}` }, body: formData }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(filePath);

      setProfileImage(publicUrl);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ profile_image: publicUrl })
        .eq('id', session?.user?.id);

      if (updateError) throw updateError;

      Alert.alert('Success', 'Profile picture updated!');
    } catch (e) {
      console.error('Error uploading image:', e);
      Alert.alert('Error', 'Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  /* Sign out */
  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/login'); } },
    ]);
  };

  /* Skills */
  const addSkill = () => {
    if (skillSearch.trim() && !skills.includes(skillSearch.trim())) {
      const next = [...skills, skillSearch.trim()];
      setSkills(next);
      setSkillSearch('');
      saveProfile();
    }
  };
  const removeSkill = (skill: string) => {
    setSkills(skills.filter(s => s !== skill));
    saveProfile();
  };

  /* Interests */
  const addInterest = () => {
    if (interestSearch.trim() && !interests.includes(interestSearch.trim())) {
      const next = [...interests, interestSearch.trim()];
      setInterests(next);
      setInterestSearch('');
      saveProfile();
    }
  };
  const removeInterest = (interest: string) => {
    setInterests(interests.filter(i => i !== interest));
    saveProfile();
  };

  /* Education */
  const addEducation = () => {
    const next = [...education, { id: Date.now().toString(), school: '', degree: '', year: '' }];
    setEducation(next);
    saveProfile();
  };
  const updateEducation = (id: string, field: string, value: string) => {
    setEducation(education.map(e => (e.id === id ? { ...e, [field]: value } : e)));
  };
  const removeEducation = (id: string) => {
    setEducation(education.filter(e => e.id !== id));
    saveProfile();
  };

  /* Experience */
  const addExperience = () => {
    const next = [...experience, { id: Date.now().toString(), company: '', position: '', duration: '', description: '' }];
    setExperience(next);
    saveProfile();
  };
  const updateExperience = (id: string, field: string, value: string) => {
    setExperience(experience.map(e => (e.id === id ? { ...e, [field]: value } : e)));
  };
  const removeExperience = (id: string) => {
    setExperience(experience.filter(e => e.id !== id));
    saveProfile();
  };

  /* Projects */
  const addProject = () => {
    const next = [...projects, { id: Date.now().toString(), name: '', description: '', link: '' }];
    setProjects(next);
    saveProfile();
  };
  const updateProject = (id: string, field: string, value: string) => {
    setProjects(projects.map(p => (p.id === id ? { ...p, [field]: value } : p)));
  };
  const removeProject = (id: string) => {
    setProjects(projects.filter(p => p.id !== id));
    saveProfile();
  };

  /* Render */
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Image */}
        <View style={styles.profileImageContainer}>
          <TouchableOpacity style={styles.profileImageButton} onPress={pickImage} disabled={uploadingImage}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.profileImage} />
            ) : (
              <View style={styles.placeholderImage}>
                <Ionicons name="person" size={60} color="#999" />
              </View>
            )}
            {uploadingImage && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="large" color="#007AFF" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.changePhotoButton} onPress={pickImage} disabled={uploadingImage}>
            <Ionicons name="camera" size={16} color="#007AFF" />
            <Text style={styles.changePhotoText}>{uploadingImage ? 'Uploading...' : 'Change Photo'}</Text>
          </TouchableOpacity>
        </View>

        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} onBlur={saveProfile} placeholder="Enter your name" placeholderTextColor="#999" />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Email</Text>
          <TextInput style={[styles.input, styles.disabledInput]} value={email} placeholder="Enter your email" keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#999" editable={false} />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Location</Text>
          <TextInput style={styles.input} value={location} onChangeText={setLocation} onBlur={saveProfile} placeholder="City, Country" placeholderTextColor="#999" />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Bio</Text>
          <TextInput style={[styles.input, styles.textArea]} value={bio} onChangeText={setBio} onBlur={saveProfile} placeholder="Tell us about yourself" multiline numberOfLines={4} textAlignVertical="top" placeholderTextColor="#999" />
        </View>

        {/* Social Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Social Links</Text>
          <View style={styles.socialLinkContainer}>
            <Ionicons name="logo-github" size={24} color="#333" />
            <TextInput style={styles.socialInput} value={github} onChangeText={setGithub} onBlur={saveProfile} placeholder="GitHub username" placeholderTextColor="#999" autoCapitalize="none" />
          </View>
          <View style={styles.socialLinkContainer}>
            <Ionicons name="logo-linkedin" size={24} color="#0077B5" />
            <TextInput style={styles.socialInput} value={linkedin} onChangeText={setLinkedin} onBlur={saveProfile} placeholder="LinkedIn username" placeholderTextColor="#999" autoCapitalize="none" />
          </View>
          <View style={styles.socialLinkContainer}>
            <Ionicons name="logo-instagram" size={24} color="#E4405F" />
            <TextInput style={styles.socialInput} value={instagram} onChangeText={setInstagram} onBlur={saveProfile} placeholder="Instagram username" placeholderTextColor="#999" autoCapitalize="none" />
          </View>
          <View style={styles.socialLinkContainer}>
            <Ionicons name="logo-twitter" size={24} color="#1DA1F2" />
            <TextInput style={styles.socialInput} value={twitter} onChangeText={setTwitter} onBlur={saveProfile} placeholder="Twitter username" placeholderTextColor="#999" autoCapitalize="none" />
          </View>
        </View>

        {/* Skills */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Skills</Text>
          <View style={styles.searchContainer}>
            <TextInput style={styles.searchInput} value={skillSearch} onChangeText={setSkillSearch} placeholder="Add a skill" placeholderTextColor="#999" onSubmitEditing={addSkill} />
            <TouchableOpacity style={styles.addButton} onPress={addSkill}>
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.tagsContainer}>
            {skills.map((skill, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{skill}</Text>
                <TouchableOpacity onPress={() => removeSkill(skill)}>
                  <Ionicons name="close-circle" size={20} color="#666" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Interests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Interests</Text>
          <View style={styles.searchContainer}>
            <TextInput style={styles.searchInput} value={interestSearch} onChangeText={setInterestSearch} placeholder="Add an interest" placeholderTextColor="#999" onSubmitEditing={addInterest} />
            <TouchableOpacity style={styles.addButton} onPress={addInterest}>
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.tagsContainer}>
            {interests.map((interest, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{interest}</Text>
                <TouchableOpacity onPress={() => removeInterest(interest)}>
                  <Ionicons name="close-circle" size={20} color="#666" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* Education */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Education</Text>
            <TouchableOpacity onPress={addEducation} style={styles.addIconButton}>
              <Ionicons name="add-circle" size={28} color="#007AFF" />
            </TouchableOpacity>
          </View>
          {education.map((edu) => (
            <View key={edu.id} style={styles.card}>
              <TouchableOpacity style={styles.removeButton} onPress={() => removeEducation(edu.id)}>
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
              <TextInput style={styles.input} value={edu.school} onChangeText={(t) => updateEducation(edu.id, 'school', t)} onBlur={saveProfile} placeholder="School/University" placeholderTextColor="#999" />
              <TextInput style={styles.input} value={edu.degree} onChangeText={(t) => updateEducation(edu.id, 'degree', t)} onBlur={saveProfile} placeholder="Degree/Field of Study" placeholderTextColor="#999" />
              <TextInput style={styles.input} value={edu.year} onChangeText={(t) => updateEducation(edu.id, 'year', t)} onBlur={saveProfile} placeholder="Year (e.g., 2020-2024)" placeholderTextColor="#999" />
            </View>
          ))}
        </View>

        {/* Experience */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Experience</Text>
            <TouchableOpacity onPress={addExperience} style={styles.addIconButton}>
              <Ionicons name="add-circle" size={28} color="#007AFF" />
            </TouchableOpacity>
          </View>
          {experience.map((exp) => (
            <View key={exp.id} style={styles.card}>
              <TouchableOpacity style={styles.removeButton} onPress={() => removeExperience(exp.id)}>
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
              <TextInput style={styles.input} value={exp.company} onChangeText={(t) => updateExperience(exp.id, 'company', t)} onBlur={saveProfile} placeholder="Company" placeholderTextColor="#999" />
              <TextInput style={styles.input} value={exp.position} onChangeText={(t) => updateExperience(exp.id, 'position', t)} onBlur={saveProfile} placeholder="Position/Role" placeholderTextColor="#999" />
              <TextInput style={styles.input} value={exp.duration} onChangeText={(t) => updateExperience(exp.id, 'duration', t)} onBlur={saveProfile} placeholder="Duration (e.g., Jan 2020 - Dec 2022)" placeholderTextColor="#999" />
              <TextInput style={[styles.input, styles.textArea]} value={exp.description} onChangeText={(t) => updateExperience(exp.id, 'description', t)} onBlur={saveProfile} placeholder="Description" multiline numberOfLines={3} textAlignVertical="top" placeholderTextColor="#999" />
            </View>
          ))}
        </View>

        {/* Projects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Portfolio of Projects</Text>
            <TouchableOpacity onPress={addProject} style={styles.addIconButton}>
              <Ionicons name="add-circle" size={28} color="#007AFF" />
            </TouchableOpacity>
          </View>
          {projects.map((project) => (
            <View key={project.id} style={styles.card}>
              <TouchableOpacity style={styles.removeButton} onPress={() => removeProject(project.id)}>
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
              <TextInput style={styles.input} value={project.name} onChangeText={(t) => updateProject(project.id, 'name', t)} onBlur={saveProfile} placeholder="Project Name" placeholderTextColor="#999" />
              <TextInput style={[styles.input, styles.textArea]} value={project.description} onChangeText={(t) => updateProject(project.id, 'description', t)} onBlur={saveProfile} placeholder="Project Description" multiline numberOfLines={3} textAlignVertical="top" placeholderTextColor="#999" />
              <TextInput style={styles.input} value={project.link} onChangeText={(t) => updateProject(project.id, 'link', t)} onBlur={saveProfile} placeholder="Project Link (URL)" keyboardType="url" autoCapitalize="none" placeholderTextColor="#999" />
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollView: { flex: 1, padding: 20 },

  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#333' },
  signOutButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FF3B30', gap: 6 },
  signOutText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },

  profileImageContainer: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  profileImageButton: { marginBottom: 10, position: 'relative' },
  profileImage: { width: 120, height: 120, borderRadius: 60 },
  placeholderImage: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' },
  uploadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  changePhotoButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, gap: 6 },
  changePhotoText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },

  section: { marginBottom: 25 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#ddd', marginBottom: 10 },
  disabledInput: { backgroundColor: '#f0f0f0', color: '#666' },
  textArea: { minHeight: 100, paddingTop: 14 },

  socialLinkContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#ddd', marginBottom: 12, gap: 12 },
  socialInput: { flex: 1, fontSize: 16, color: '#333' },

  searchContainer: { flexDirection: 'row', marginBottom: 12 },
  searchInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#ddd', marginRight: 10 },
  addButton: { backgroundColor: '#007AFF', borderRadius: 10, width: 50, justifyContent: 'center', alignItems: 'center' },
  addIconButton: { padding: 4 },

  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingLeft: 14, paddingRight: 10, borderWidth: 1, borderColor: '#ddd', gap: 6 },
  tagText: { fontSize: 14, color: '#333' },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#ddd', position: 'relative' },
  removeButton: { position: 'absolute', top: 12, right: 12, zIndex: 1, padding: 4 },
});
