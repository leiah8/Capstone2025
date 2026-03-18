import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { PROJECT_TAGS } from "../constants/tags";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

export default function CreateProjectScreen() {
  const { session } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skillsNeeded, setSkillsNeeded] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  /* =========================
     Image picker
     ========================= */
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photos to upload a project image.",
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

  const selectTag = (tag: string) => {
    setTags([...tags, tag]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const filteredTags =
    tagInput.trim().length > 0
      ? PROJECT_TAGS.filter(
          (t) =>
            t.toLowerCase().includes(tagInput.trim().toLowerCase()) &&
            !tags.some((sel) => sel.toLowerCase() === t.toLowerCase()),
        ).slice(0, 6)
      : [];

  useEffect(() => {
    if (tagInput.trim().length > 0) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [tagInput]);

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
    setTried(true);

    if (
      !title.trim() ||
      !description.trim() ||
      skillsNeeded.length === 0 ||
      tags.length === 0
    ) {
      return;
    }
    if (!session?.user?.id) {
      Alert.alert("Error", "You must be logged in to create a project.");
      return;
    }

    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (imageUri) {
        imageUrl = await uploadImage(imageUri);
      }

      const { error } = await supabase.from("projects").insert({
        owner_id: session.user.id,
        title: title.trim(),
        description: description.trim(),
        skills_needed: skillsNeeded,
        tags,
        image: imageUrl,
        is_active: true,
      });

      if (error) throw error;

      Alert.alert("Success", "Project created!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      console.error("Create project error:", e);
      Alert.alert("Error", e.message || "Failed to create project.");
    } finally {
      setSaving(false);
    }
  };

  /* =========================
     Render
     ========================= */
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Image picker */}
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.imagePreview} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={40} color="#999" />
              <Text style={styles.imagePlaceholderText}>Add Project Image</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Title */}
        <Text
          style={[styles.label, tried && !title.trim() && styles.errorLabel]}
        >
          Title*
        </Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. CampusHub Web Portal"
          placeholderTextColor="#999"
          maxLength={100}
        />

        {/* Description */}
        <Text
          style={[
            styles.label,
            tried && !description.trim() && styles.errorLabel,
          ]}
        >
          Description*
        </Text>
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
        <View style={styles.labelRow}>
          <Text
            style={[
              styles.label,
              tried && skillsNeeded.length === 0 && styles.errorLabel,
            ]}
          >
            Skills Needed*
          </Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Skills Needed",
                "Specific technical skills like programming languages, frameworks, and tools (e.g., React, Python, Figma).",
              )
            }
          >
            <Ionicons name="help-circle-outline" size={18} color="#999" />
          </TouchableOpacity>
        </View>
        <View style={styles.chipInputRow}>
          <TextInput
            style={styles.chipInput}
            value={skillInput}
            onChangeText={setSkillInput}
            placeholder="e.g. React, Python, JavaScript"
            placeholderTextColor="#999"
            onSubmitEditing={addSkill}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[
              styles.addButton,
              !skillInput.trim() && styles.addButtonDisabled,
            ]}
            onPress={addSkill}
            disabled={!skillInput.trim()}
          >
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
        <View style={styles.labelRow}>
          <Text
            style={[
              styles.label,
              tried && tags.length === 0 && styles.errorLabel,
            ]}
          >
            Tags*
          </Text>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Tags",
                "General categories that describe your project's domain, platform, or area (e.g., Mobile App Development, AI / Machine Learning, iOS).",
              )
            }
          >
            <Ionicons name="help-circle-outline" size={18} color="#999" />
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.chipInput}
          value={tagInput}
          onChangeText={setTagInput}
          placeholder="Search tags..."
          placeholderTextColor="#999"
        />
        {tagInput.trim().length > 0 && (
          <View style={styles.suggestionsContainer}>
            {filteredTags.length > 0 ? (
              filteredTags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={styles.suggestionItem}
                  onPress={() => selectTag(tag)}
                >
                  <Text style={styles.suggestionText}>{tag}</Text>
                  <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.noMatchText}>No matching tags</Text>
            )}
          </View>
        )}
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
            <Text style={styles.submitButtonText}>Create Project</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* =========================
   Styles
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
  addButtonDisabled: {
    backgroundColor: "#ccc",
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

  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    marginTop: 4,
  },
  suggestionsContainer: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8,
    maxHeight: 210,
    overflow: "hidden",
  },
  suggestionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  suggestionText: {
    fontSize: 14,
    color: "#333",
  },
  noMatchText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingVertical: 12,
  },
  submitButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  errorLabel: { color: "#e53935" },
});
