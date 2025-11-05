import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  
  // Skills
  const [skills, setSkills] = useState<string[]>(['React Native', 'TypeScript']);
  const [skillSearch, setSkillSearch] = useState('');
  
  // Interests
  const [interests, setInterests] = useState<string[]>(['Mobile Development', 'UI/UX']);
  const [interestSearch, setInterestSearch] = useState('');
  
  // Education
  const [education, setEducation] = useState([
    { id: '1', school: '', degree: '', year: '' }
  ]);
  
  // Projects
  const [projects, setProjects] = useState([
    { id: '1', name: '', description: '', link: '' }
  ]);

  const addSkill = () => {
    if (skillSearch.trim() && !skills.includes(skillSearch.trim())) {
      setSkills([...skills, skillSearch.trim()]);
      setSkillSearch('');
    }
  };

  const removeSkill = (skill: string) => {
    setSkills(skills.filter(s => s !== skill));
  };

  const addInterest = () => {
    if (interestSearch.trim() && !interests.includes(interestSearch.trim())) {
      setInterests([...interests, interestSearch.trim()]);
      setInterestSearch('');
    }
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter(i => i !== interest));
  };

  const addEducation = () => {
    setEducation([...education, { 
      id: Date.now().toString(), 
      school: '', 
      degree: '', 
      year: '' 
    }]);
  };

  const updateEducation = (id: string, field: string, value: string) => {
    setEducation(education.map(edu => 
      edu.id === id ? { ...edu, [field]: value } : edu
    ));
  };

  const removeEducation = (id: string) => {
    if (education.length > 1) {
      setEducation(education.filter(edu => edu.id !== id));
    }
  };

  const addProject = () => {
    setProjects([...projects, { 
      id: Date.now().toString(), 
      name: '', 
      description: '', 
      link: '' 
    }]);
  };

  const updateProject = (id: string, field: string, value: string) => {
    setProjects(projects.map(proj => 
      proj.id === id ? { ...proj, [field]: value } : proj
    ));
  };

  const removeProject = (id: string) => {
    if (projects.length > 1) {
      setProjects(projects.filter(proj => proj.id !== id));
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Picture */}
        <View style={styles.profileImageContainer}>
          <TouchableOpacity style={styles.profileImageButton}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.profileImage} />
            ) : (
              <View style={styles.placeholderImage}>
                <Ionicons name="person" size={60} color="#999" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.changePhotoButton}>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>About Me</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Tell us about yourself"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor="#999"
          />
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
                placeholder="School/University"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={edu.degree}
                onChangeText={(text) => updateEducation(edu.id, 'degree', text)}
                placeholder="Degree/Field of Study"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={edu.year}
                onChangeText={(text) => updateEducation(edu.id, 'year', text)}
                placeholder="Year (e.g., 2020-2024)"
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
                placeholder="Project Name"
                placeholderTextColor="#999"
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                value={project.description}
                onChangeText={(text) => updateProject(project.id, 'description', text)}
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
                placeholder="Project Link (URL)"
                keyboardType="url"
                autoCapitalize="none"
                placeholderTextColor="#999"
              />
            </View>
          ))}
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save Profile</Text>
        </TouchableOpacity>
        
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
  profileImageContainer: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 20,
  },
  profileImageButton: {
    marginBottom: 10,
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
  changePhotoButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
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
  textArea: {
    minHeight: 100,
    paddingTop: 14,
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
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});