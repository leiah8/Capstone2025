import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function ProfilePage() {
  const { signOut, session } = useAuth();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState(session?.user?.email || '');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Skills
  const [skills, setSkills] = useState<string[]>([]);
  const [skillSearch, setSkillSearch] = useState('');
  
  // Interests
  const [interests, setInterests] = useState<string[]>([]);
  const [interestSearch, setInterestSearch] = useState('');
  
  // Social Links
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [instagram, setInstagram] = useState('');
  const [twitter, setTwitter] = useState('');
  
  // Education - Initialize with timestamp ID
  const [education, setEducation] = useState([
    { id: Date.now().toString(), school: '', degree: '', year: '' }
  ]);
  
  // Experience/Jobs - Initialize with timestamp ID
  const [experience, setExperience] = useState([
    { id: Date.now().toString(), company: '', position: '', duration: '', description: '' }
  ]);
  
  // Projects - Initialize with timestamp ID
  const [projects, setProjects] = useState([
    { id: Date.now().toString(), name: '', description: '', link: '' }
  ]);

  const [loading, setLoading] = useState(true);

  // Load profile data on mount
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
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
        
        // Parse social links
        if (data.links) {
          setGithub(data.links.github || '');
          setLinkedin(data.links.linkedin || '');
          setInstagram(data.links.instagram || '');
          setTwitter(data.links.twitter || '');
        }
        
        // Parse education, experience, projects - ensure they have timestamp IDs
        const loadedEducation = data.education || [];
        setEducation(loadedEducation.length > 0 ? loadedEducation : [{ id: Date.now().toString(), school: '', degree: '', year: '' }]);
        
        const loadedExperience = data.experience || [];
        setExperience(loadedExperience.length > 0 ? loadedExperience : [{ id: Date.now().toString(), company: '', position: '', duration: '', description: '' }]);
        
        const loadedProjects = data.personal_projects || [];
        setProjects(loadedProjects.length > 0 ? loadedProjects : [{ id: Date.now().toString(), name: '', description: '', link: '' }]);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: session?.user?.id,
          name,
          bio,
          location,
          profile_image: profileImage,
          skills,
          interests,
          links: {
            github,
            linkedin,
            instagram,
            twitter,
          },
          education,
          experience,
          personal_projects: projects,
          visible: true,
        });

      if (error) {
        console.error('Error saving profile:', error);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
    }
  };

const pickImage = async () => {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Please allow access to your photos to upload a profile picture.');
    return;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], // ← Changed this line
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
    console.log('Starting upload for:', uri);
    
    // Create unique filename
    const fileExt = uri.split('.').pop() || 'jpg';
    const fileName = `${session?.user?.id}-${Date.now()}.${fileExt}`;
    const filePath = `profile-images/${fileName}`;
    console.log('Uploading to:', filePath);

    // Get the user's session token (not the anon key!)
    const sessionToken = session?.access_token;
    
    if (!sessionToken) {
      throw new Error('No session token found');
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', {
      uri: uri,
      name: fileName,
      type: 'image/jpeg',
    } as any);

    // Get Supabase URL
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

    // Upload using fetch directly with user's session token
    const uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/profiles/${filePath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`, // ← Use session token instead of anon key
        },
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Upload error:', errorText);
      throw new Error(`Upload failed: ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload successful:', uploadResult);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('profiles')
      .getPublicUrl(filePath);

    console.log('Public URL:', publicUrl);
    setProfileImage(publicUrl);
    
    // Save profile with new image - only update profile_image field
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ profile_image: publicUrl })
      .eq('id', session?.user?.id);

    if (updateError) {
      console.error('Profile update error:', updateError);
      throw updateError;
    }

    console.log('Profile updated successfully');
    Alert.alert('Success', 'Profile picture updated!');
  } catch (error) {
    console.error('Error uploading image:', error);
    Alert.alert('Error', `Failed to upload image. Please try again.`);
  } finally {
    setUploadingImage(false);
  }
};



  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const addSkill = () => {
    if (skillSearch.trim() && !skills.includes(skillSearch.trim())) {
      const newSkills = [...skills, skillSearch.trim()];
      setSkills(newSkills);
      setSkillSearch('');
      saveProfile();
    }
  };

  const removeSkill = (skill: string) => {
    const newSkills = skills.filter(s => s !== skill);
    setSkills(newSkills);
    saveProfile();
  };

  const addInterest = () => {
    if (interestSearch.trim() && !interests.includes(interestSearch.trim())) {
      const newInterests = [...interests, interestSearch.trim()];
      setInterests(newInterests);
      setInterestSearch('');
      saveProfile();
    }
  };

  const removeInterest = (interest: string) => {
    const newInterests = interests.filter(i => i !== interest);
    setInterests(newInterests);
    saveProfile();
  };

  const addEducation = () => {
    const newEducation = [...education, { 
      id: Date.now().toString(), 
      school: '', 
      degree: '', 
      year: '' 
    }];
    setEducation(newEducation);
    saveProfile();
  };

  const updateEducation = (id: string, field: string, value: string) => {
    const newEducation = education.map(edu => 
      edu.id === id ? { ...edu, [field]: value } : edu
    );
    setEducation(newEducation);
  };

const removeEducation = (id: string) => {
  const newEducation = education.filter(edu => edu.id !== id);
  setEducation(newEducation);
  saveProfile();
};

  const addExperience = () => {
    const newExperience = [...experience, { 
      id: Date.now().toString(), 
      company: '', 
      position: '', 
      duration: '',
      description: '' 
    }];
    setExperience(newExperience);
    saveProfile();
  };

  const updateExperience = (id: string, field: string, value: string) => {
    const newExperience = experience.map(exp => 
      exp.id === id ? { ...exp, [field]: value } : exp
    );
    setExperience(newExperience);
  };

const removeExperience = (id: string) => {
  const newExperience = experience.filter(exp => exp.id !== id);
  setExperience(newExperience);
  saveProfile();
};


  const addProject = () => {
    const newProjects = [...projects, { 
      id: Date.now().toString(), 
      name: '', 
      description: '', 
      link: '' 
    }];
    setProjects(newProjects);
    saveProfile();
  };

  const updateProject = (id: string, field: string, value: string) => {
    const newProjects = projects.map(proj => 
      proj.id === id ? { ...proj, [field]: value } : proj
    );
    setProjects(newProjects);
  };

const removeProject = (id: string) => {
  const newProjects = projects.filter(proj => proj.id !== id);
  setProjects(newProjects);
  saveProfile();
};

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Sign Out Button at Top */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Picture */}
        <View style={styles.profileImageContainer}>
          <TouchableOpacity 
            style={styles.profileImageButton} 
            onPress={pickImage}
            disabled={uploadingImage}
          >
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
          <TouchableOpacity 
            style={styles.changePhotoButton} 
            onPress={pickImage}
            disabled={uploadingImage}
          >
            <Ionicons name="camera" size={16} color="#007AFF" />
            <Text style={styles.changePhotoText}>
              {uploadingImage ? 'Uploading...' : 'Change Photo'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            onBlur={saveProfile}
            placeholder="Enter your name"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, styles.disabledInput]}
            value={email}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#999"
            editable={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            onBlur={saveProfile}
            placeholder="City, Country"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            onBlur={saveProfile}
            placeholder="Tell us about yourself"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor="#999"
          />
        </View>

        {/* Social Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Social Links</Text>
          
          <View style={styles.socialLinkContainer}>
            <Ionicons name="logo-github" size={24} color="#333" />
            <TextInput
              style={styles.socialInput}
              value={github}
              onChangeText={setGithub}
              onBlur={saveProfile}
              placeholder="GitHub username"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.socialLinkContainer}>
            <Ionicons name="logo-linkedin" size={24} color="#0077B5" />
            <TextInput
              style={styles.socialInput}
              value={linkedin}
              onChangeText={setLinkedin}
              onBlur={saveProfile}
              placeholder="LinkedIn username"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.socialLinkContainer}>
            <Ionicons name="logo-instagram" size={24} color="#E4405F" />
            <TextInput
              style={styles.socialInput}
              value={instagram}
              onChangeText={setInstagram}
              onBlur={saveProfile}
              placeholder="Instagram username"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.socialLinkContainer}>
            <Ionicons name="logo-twitter" size={24} color="#1DA1F2" />
            <TextInput
              style={styles.socialInput}
              value={twitter}
              onChangeText={setTwitter}
              onBlur={saveProfile}
              placeholder="Twitter username"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Skills */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Skills</Text>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              value={skillSearch}
              onChangeText={setSkillSearch}
              placeholder="Add a skill"
              placeholderTextColor="#999"
              onSubmitEditing={addSkill}
            />
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
            <TextInput
              style={styles.searchInput}
              value={interestSearch}
              onChangeText={setInterestSearch}
              placeholder="Add an interest"
              placeholderTextColor="#999"
              onSubmitEditing={addInterest}
            />
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
              <TouchableOpacity 
                style={styles.removeButton}
                onPress={() => removeEducation(edu.id)}
              >
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={edu.school}
                onChangeText={(text) => updateEducation(edu.id, 'school', text)}
                onBlur={saveProfile}
                placeholder="School/University"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={edu.degree}
                onChangeText={(text) => updateEducation(edu.id, 'degree', text)}
                onBlur={saveProfile}
                placeholder="Degree/Field of Study"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={edu.year}
                onChangeText={(text) => updateEducation(edu.id, 'year', text)}
                onBlur={saveProfile}
                placeholder="Year (e.g., 2020-2024)"
                placeholderTextColor="#999"
              />
            </View>
          ))}
        </View>

        {/* Experience/Jobs */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Experience</Text>
            <TouchableOpacity onPress={addExperience} style={styles.addIconButton}>
              <Ionicons name="add-circle" size={28} color="#007AFF" />
            </TouchableOpacity>
          </View>
          {experience.map((exp) => (
            <View key={exp.id} style={styles.card}>
              <TouchableOpacity 
                style={styles.removeButton}
                onPress={() => removeExperience(exp.id)}
              >
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={exp.company}
                onChangeText={(text) => updateExperience(exp.id, 'company', text)}
                onBlur={saveProfile}
                placeholder="Company"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={exp.position}
                onChangeText={(text) => updateExperience(exp.id, 'position', text)}
                onBlur={saveProfile}
                placeholder="Position/Role"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={exp.duration}
                onChangeText={(text) => updateExperience(exp.id, 'duration', text)}
                onBlur={saveProfile}
                placeholder="Duration (e.g., Jan 2020 - Dec 2022)"
                placeholderTextColor="#999"
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                value={exp.description}
                onChangeText={(text) => updateExperience(exp.id, 'description', text)}
                onBlur={saveProfile}
                placeholder="Description"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                placeholderTextColor="#999"
              />
            </View>
          ))}
        </View>

        {/* Projects Portfolio */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Portfolio of Projects</Text>
            <TouchableOpacity onPress={addProject} style={styles.addIconButton}>
              <Ionicons name="add-circle" size={28} color="#007AFF" />
            </TouchableOpacity>
          </View>
          {projects.map((project) => (
            <View key={project.id} style={styles.card}>
              <TouchableOpacity 
                style={styles.removeButton}
                onPress={() => removeProject(project.id)}
              >
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={project.name}
                onChangeText={(text) => updateProject(project.id, 'name', text)}
                onBlur={saveProfile}
                placeholder="Project Name"
                placeholderTextColor="#999"
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                value={project.description}
                onChangeText={(text) => updateProject(project.id, 'description', text)}
                onBlur={saveProfile}
                placeholder="Project Description"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={project.link}
                onChangeText={(text) => updateProject(project.id, 'link', text)}
                onBlur={saveProfile}
                placeholder="Project Link (URL)"
                keyboardType="url"
                autoCapitalize="none"
                placeholderTextColor="#999"
              />
            </View>
          ))}
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF3B30',
    gap: 6,
  },
  signOutText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  profileImageContainer: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  profileImageButton: {
    marginBottom: 10,
    position: 'relative',
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  placeholderImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  changePhotoText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 25,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 10,
  },
  disabledInput: {
    backgroundColor: '#f0f0f0',
    color: '#666',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  socialLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 12,
    gap: 12,
  },
  socialInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 10,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addIconButton: {
    padding: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 6,
  },
  tagText: {
    fontSize: 14,
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    position: 'relative',
  },
  removeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
    padding: 4,
  },
});