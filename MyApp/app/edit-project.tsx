import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export default function EditProjectScreen() {
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skillsNeeded, setSkillsNeeded] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  /* =========================
     Load existing project
     ========================= */
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("title, description, skills_needed, tags, image")
        .eq("id", id)
        .single();
      if (error) {
        Alert.alert("Error", "Failed to load project.");
        router.back();
        return;
      }
      setTitle(data.title || "");
      setDescription(data.description || "");
      setSkillsNeeded(data.skills_needed || []);
      setTags(data.tags || []);
      setExistingImageUrl(data.image || null);
      setLoading(false);
    })();
  }, [id]);

  /* =========================
     Image picker
     ========================= */
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photos to upload a project image."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  /* =========================
     Chip helpers
     ========================= */
  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (!trimmed) return;
    if (skillsNeeded.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert("Already added", `"${trimmed}" is already in the list.`);
      return;
    }
    setSkillsNeeded([...skillsNeeded, trimmed]);
    setSkillInput("");
  };

  const removeSkill = (skill: string) => {
    setSkillsNeeded(skillsNeeded.filter((s) => s !== skill));
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert("Already added", `"${trimmed}" is already in the list.`);
      return;
    }
    setTags([...tags, trimmed]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  /* =========================
     Upload image to Supabase Storage
     ========================= */
  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const fileExt = uri.split(".").pop() || "jpg";
      const filePath = `${session?.user?.id}/${Date.now()}.${fileExt}`;

      const response = await fetch(uri);
      if (!response.ok) throw new Error("Could not read selected image");
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadErr } = await supabase.storage
        .from("project-photos")
        .upload(filePath, arrayBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (uploadErr) throw uploadErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("project-photos").getPublicUrl(filePath);

      return publicUrl;
    } catch (e) {
      console.error("Image upload error:", e);
      return null;
    }
  };

  /* =========================
     Submit
     ========================= */
  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert("Required", "Please enter a project title.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Required", "Please enter a project description.");
      return;
    }

    setSaving(true);
    try {
      let imageUrl = existingImageUrl;
      if (imageUri) {
        imageUrl = await uploadImage(imageUri);
      }

      const { error } = await supabase
        .from("projects")
        .update({
          title: title.trim(),
          description: description.trim(),
          skills_needed: skillsNeeded,
          tags,
          image: imageUrl,
        })
        .eq("id", id);

      if (error) throw error;

      Alert.alert("Success", "Project updated!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      console.error("Update project error:", e);
      Alert.alert("Error", e.message || "Failed to update project.");
    } finally {
      setSaving(false);
    }
  };

  /* =========================
     Render
     ========================= */
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const displayImage = imageUri || existingImageUrl;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Image picker */}
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
          {displayImage ? (
            <Image source={{ uri: displayImage }} style={styles.imagePreview} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={40} color="#999" />
              <Text style={styles.imagePlaceholderText}>Add Project Image</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Title */}
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. CampusHub Web Portal"
          placeholderTextColor="#999"
          maxLength={100}
        />

        {/* Description */}
        <Text style={styles.label}>Description *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe your project and what collaborators you're looking for..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        {/* Skills Needed */}
        <Text style={styles.label}>Skills Needed</Text>
        <View style={styles.chipInputRow}>
          <TextInput
            style={styles.chipInput}
            value={skillInput}
            onChangeText={setSkillInput}
            placeholder="Add a skill"
            placeholderTextColor="#999"
            onSubmitEditing={addSkill}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addButton} onPress={addSkill}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        {skillsNeeded.length > 0 && (
          <View style={styles.chipsContainer}>
            {skillsNeeded.map((skill) => (
              <View key={skill} style={styles.chip}>
                <Text style={styles.chipText}>{skill}</Text>
                <TouchableOpacity onPress={() => removeSkill(skill)}>
                  <Ionicons name="close-circle" size={18} color="#666" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Tags */}
        <Text style={styles.label}>Tags</Text>
        <View style={styles.chipInputRow}>
          <TextInput
            style={styles.chipInput}
            value={tagInput}
            onChangeText={setTagInput}
            placeholder="Add a tag"
            placeholderTextColor="#999"
            onSubmitEditing={addTag}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addButton} onPress={addTag}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        {tags.length > 0 && (
          <View style={styles.chipsContainer}>
            {tags.map((tag) => (
              <View key={tag} style={styles.chip}>
                <Text style={styles.chipText}>{tag}</Text>
                <TouchableOpacity onPress={() => removeTag(tag)}>
                  <Ionicons name="close-circle" size={18} color="#666" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, saving && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* =========================
   Styles (same as create-project)
   ========================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },

  imagePicker: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    backgroundColor: "#f5f5f5",
  },
  imagePreview: { width: "100%", height: "100%" },
  imagePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ddd",
    borderStyle: "dashed",
    borderRadius: 16,
  },
  imagePlaceholderText: { marginTop: 8, fontSize: 14, color: "#999" },

  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#333",
    marginBottom: 16,
    backgroundColor: "#fafafa",
  },
  textArea: { minHeight: 120 },

  chipInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  chipInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#333",
    backgroundColor: "#fafafa",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },

  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  chipText: { fontSize: 14, color: "#333" },

  submitButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
