// ProfilePage.tsx

/* =========================
   Imports & setup
   ========================= */
import React, { useState, useEffect } from "react";
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
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import Constants from "expo-constants";
import { useAuth } from "../../contexts/AuthContext";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import ParseReviewModal, {
  type ParsedData,
  type ConfirmedData,
} from "../../components/ParseReviewModal";

/* =========================
   Helpers
   ========================= */
const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5MB
const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_");
const ensureExt = (name: string, fallback = ".pdf") =>
  name.includes(".") ? name : name + fallback;

// Derive a tidy filename from a signed URL or storage path — no DB storage of original name needed
const fileNameFromUrlOrPath = (s?: string | null) => {
  if (!s) return null;
  try {
    const url = new URL(s);
    const last = url.pathname.split("/").pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    const last = s.split("?")[0].split("/").pop();
    return last ? decodeURIComponent(last) : null;
  }
};

/* =========================
   Screen
   ========================= */
export default function ProfilePage() {
  const { signOut, session } = useAuth();

  /* Basic profile state */
  const [name, setName] = useState("");
  const [email] = useState(session?.user?.email || "");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [skills, setSkills] = useState<string[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [selectingSkills, setSelectingSkills] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const [interests, setInterests] = useState<string[]>([]);
  const [interestSearch, setInterestSearch] = useState("");

  const [github, setGithub] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");

  const [education, setEducation] = useState([
    { id: Date.now().toString(), school: "", degree: "", year: "" },
  ]);

  const [experience, setExperience] = useState([
    {
      id: Date.now().toString(),
      company: "",
      position: "",
      duration: "",
      description: "",
    },
  ]);

  const [projects, setProjects] = useState([
    { id: Date.now().toString(), name: "", description: "", link: "" },
  ]);

  const [loading, setLoading] = useState(true);

  /* Resume state (derived name only) */
  const [resumeUrl, setResumeUrl] = useState<string | null>(null); // or swap to resume_path if you prefer
  const [resumeUpdatedAt, setResumeUpdatedAt] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [parsingResume, setParsingResume] = useState(false);
  const PARSER_URL =
    Constants.expoConfig?.extra?.parserUrl ||
    process.env.EXPO_PUBLIC_PARSER_URL ||
    "";

  /* Review-modal state (shown after parsing) */
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const emptyParsed: ParsedData = {
    skills: [],
    interests: [],
    education: [],
    experience: [],
    personal_projects: [],
  };
  const [parsedResumeData, setParsedResumeData] =
    useState<ParsedData>(emptyParsed);

  /* =========================
     Load profile
     ========================= */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session?.user?.id)
          .maybeSingle();

        if (error) {
          if (error.code !== "PGRST116")
            console.error("Error loading profile:", error);
        } else if (data) {
          setName(data.name || "");
          setBio(data.bio || "");
          setLocation(data.location || "");
          setProfileImage(data.profile_image || null);
          setSkills(data.skills || []);
          setInterests(data.interests || []);
          if (data.links) {
            setGithub(data.links.github || "");
            setLinkedin(data.links.linkedin || "");
            setInstagram(data.links.instagram || "");
            setTwitter(data.links.twitter || "");
          }
          const loadedEducation = data.education || [];
          setEducation(
            loadedEducation.length
              ? loadedEducation
              : [
                  {
                    id: Date.now().toString(),
                    school: "",
                    degree: "",
                    year: "",
                  },
                ],
          );

          const loadedExperience = data.experience || [];
          setExperience(
            loadedExperience.length
              ? loadedExperience
              : [
                  {
                    id: Date.now().toString(),
                    company: "",
                    position: "",
                    duration: "",
                    description: "",
                  },
                ],
          );

          const loadedProjects = data.personal_projects || [];
          setProjects(
            loadedProjects.length
              ? loadedProjects
              : [
                  {
                    id: Date.now().toString(),
                    name: "",
                    description: "",
                    link: "",
                  },
                ],
          );

          // Resume fields (we only derive filename in UI)
          setResumeUrl(data.resume_url ?? null); // or data.resume_path if you store paths
          setResumeUpdatedAt(data.resume_updated_at ?? null);
          setResumeFileName(fileNameFromUrlOrPath(data.resume_url));
        }
      } catch (e) {
        console.error("Error loading profile:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.user?.id]);

  /* =========================
     Persist profile
     ========================= */
  const saveProfile = async () => {
    try {
      const payload = {
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
      };
      const { error } = await supabase.from("profiles").upsert(payload);
      if (error) console.error("Error saving profile:", error);
    } catch (e) {
      console.error("Error saving profile:", e);
    }
  };

  /* =========================
     Profile image upload (Storage bucket: "profiles")
     ========================= */
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photos to upload a profile picture.",
      );
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

      const fileExt = uri.split(".").pop() || "jpg";
      const fileName = `${session?.user?.id}-${Date.now()}.${fileExt}`;
      const filePath = `profile-images/${fileName}`;

      // Read file
      const response = await fetch(uri);
      if (!response.ok) throw new Error("Could not read selected image");
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadErr } = await supabase.storage
        .from("profiles")
        .upload(filePath, arrayBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (uploadErr) throw uploadErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("profiles").getPublicUrl(filePath);

      setProfileImage(publicUrl);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ profile_image: publicUrl })
        .eq("id", session?.user?.id);

      if (updateError) throw updateError;

      Alert.alert("Success", "Profile picture updated!");
    } catch (e) {
      console.error("Error uploading image:", e);
      Alert.alert("Error", "Failed to upload image. Please try again.");
    } finally {
      setUploadingImage(false);
    }
  };

  /* =========================
     Resume upload (Storage bucket: "resumes")
     ========================= */
  const pickResume = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset.size && asset.size > MAX_RESUME_BYTES) {
      Alert.alert("Too large", "File size must be less than 5MB.");
      return;
    }

    const originalName = asset.name ?? "resume.pdf";
    const mime = asset.mimeType ?? "application/octet-stream";
    await uploadResume(asset.uri, originalName, mime);
  };

  const uploadResume = async (
    uri: string,
    originalName: string,
    mime: string,
  ) => {
    try {
      if (!session?.user?.id) throw new Error("No user session");
      setUploadingResume(true);

      const response = await fetch(uri);
      if (!response.ok) throw new Error("Could not read selected file");
      const arrayBuffer = await response.arrayBuffer();

      const safe = ensureExt(sanitizeFilename(originalName));
      const objectPath = `${session.user.id}/${Date.now()}-${safe}`; // e.g., userId/ts-resume.pdf

      const { error: uploadErr } = await supabase.storage
        .from("resumes")
        .upload(objectPath, arrayBuffer, { contentType: mime, upsert: true });
      if (uploadErr) throw uploadErr;

      // Signed URL for immediate viewing (bucket should be private)
      const { data: signed, error: signedErr } = await supabase.storage
        .from("resumes")
        .createSignedUrl(objectPath, 60 * 60 * 24 * 7);
      if (signedErr) throw signedErr;

      const signedUrl = signed?.signedUrl ?? null;
      setResumeUrl(signedUrl);
      const now = new Date().toISOString();
      setResumeUpdatedAt(now);
      setResumeFileName(fileNameFromUrlOrPath(objectPath));

      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ resume_url: signedUrl, resume_updated_at: now })
        .eq("id", session.user.id);
      if (dbErr) throw dbErr;

      Alert.alert("Success", "Resume uploaded!");

      // Trigger parsing automatically after successful upload
      if (PARSER_URL) {
        try {
          setParsingResume(true);
          const formData = new FormData();
          formData.append("file", {
            uri,
            name: originalName,
            type: mime,
          } as any);
          const resp = await fetch(
            `${PARSER_URL.replace(/\/$/, "")}/parse/upload`,
            {
              method: "POST",
              body: formData,
              headers: { Accept: "application/json" },
            },
          );
          if (!resp.ok) throw new Error(`Parser HTTP ${resp.status}`);
          const parsed = await resp.json();

          // Build review data from API response
          const reviewData: ParsedData = {
            skills: parsed?.skills ?? [],
            interests: parsed?.interests ?? [],
            education: (parsed?.education ?? []).map((e: any, i: number) => ({
              id: e.id ?? `edu-${Date.now()}-${i}`,
              school: e.school ?? "",
              degree: e.degree ?? "",
              year: e.year ?? "",
            })),
            experience: (parsed?.experience ?? []).map((e: any, i: number) => ({
              id: e.id ?? `exp-${Date.now()}-${i}`,
              company: e.company ?? "",
              position: e.position ?? "",
              duration: e.duration ?? "",
              description: e.description ?? "",
            })),
            personal_projects: (parsed?.personal_projects ?? []).map(
              (e: any, i: number) => ({
                id: e.id ?? `proj-${Date.now()}-${i}`,
                name: e.name ?? "",
                description: e.description ?? "",
                link: e.link ?? "",
              }),
            ),
          };

          const hasAnything =
            reviewData.skills.length > 0 ||
            reviewData.interests.length > 0 ||
            reviewData.education.length > 0 ||
            reviewData.experience.length > 0 ||
            reviewData.personal_projects.length > 0;

          if (hasAnything) {
            setParsedResumeData(reviewData);
            setReviewModalVisible(true);
          } else {
            Alert.alert("Parsed", "No structured data found in resume.");
          }
        } catch (parseErr: any) {
          console.error("Parsing error:", parseErr);
          Alert.alert(
            "Parser Error",
            parseErr?.message || "Failed to parse resume.",
          );
        } finally {
          setParsingResume(false);
        }
      } else {
        console.warn("PARSER_URL not configured; skipping automatic parsing.");
      }
    } catch (e: any) {
      console.error("Resume upload error:", e);
      Alert.alert("Error", e?.message ?? "Failed to upload resume.");
    } finally {
      setUploadingResume(false);
    }
  };

  const reparseResume = async () => {
    try {
      if (!PARSER_URL) {
        Alert.alert(
          "Parser not configured",
          "Set EXPO_PUBLIC_PARSER_URL or app.json extra.parserUrl.",
        );
        return;
      }
      if (!session?.user?.id) return;
      setParsingResume(true);

      let url = resumeUrl;

      // If we don't have a URL (or it might be expired), try to find latest object in storage and sign it
      if (!url) {
        const prefix = `${session.user.id}`;
        const { data: list, error: listErr } = await supabase.storage
          .from("resumes")
          .list(prefix);
        if (listErr) console.warn("Storage list error:", listErr);
        if (list && list.length) {
          // Pick newest by name (we embed Date.now() at start)
          const newest = [...list].sort((a, b) =>
            b.name.localeCompare(a.name),
          )[0];
          const objectPath = `${prefix}/${newest.name}`;
          const { data: signedAgain, error: signErr } = await supabase.storage
            .from("resumes")
            .createSignedUrl(objectPath, 60 * 60);
          if (!signErr && signedAgain?.signedUrl) {
            url = signedAgain.signedUrl;
            setResumeUrl(url);
            setResumeFileName(fileNameFromUrlOrPath(objectPath));
          }
        }
      }

      if (!url) {
        Alert.alert("No resume found", "Please upload a resume first.");
        return;
      }

      const resp = await fetch(`${PARSER_URL.replace(/\/$/, "")}/parse/url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ url }),
      });
      if (!resp.ok) throw new Error(`Parser HTTP ${resp.status}`);
      const parsed = await resp.json();

      // Build review data from API response
      const reviewData: ParsedData = {
        skills: parsed?.skills ?? [],
        interests: parsed?.interests ?? [],
        education: (parsed?.education ?? []).map((e: any, i: number) => ({
          id: e.id ?? `edu-${Date.now()}-${i}`,
          school: e.school ?? "",
          degree: e.degree ?? "",
          year: e.year ?? "",
        })),
        experience: (parsed?.experience ?? []).map((e: any, i: number) => ({
          id: e.id ?? `exp-${Date.now()}-${i}`,
          company: e.company ?? "",
          position: e.position ?? "",
          duration: e.duration ?? "",
          description: e.description ?? "",
        })),
        personal_projects: (parsed?.personal_projects ?? []).map(
          (e: any, i: number) => ({
            id: e.id ?? `proj-${Date.now()}-${i}`,
            name: e.name ?? "",
            description: e.description ?? "",
            link: e.link ?? "",
          }),
        ),
      };

      const hasAnything =
        reviewData.skills.length > 0 ||
        reviewData.interests.length > 0 ||
        reviewData.education.length > 0 ||
        reviewData.experience.length > 0 ||
        reviewData.personal_projects.length > 0;

      if (hasAnything) {
        setParsedResumeData(reviewData);
        setReviewModalVisible(true);
      } else {
        Alert.alert("Parsed", "No structured data found in resume.");
      }
    } catch (e: any) {
      console.error("Re-parse error:", e);
      Alert.alert("Parser Error", e?.message || "Failed to parse resume.");
    } finally {
      setParsingResume(false);
    }
  };

  /* =========================
     Handle parsed-data confirmation from the review modal
     ========================= */
  const handleReviewConfirm = async (selected: ConfirmedData) => {
    setReviewModalVisible(false);

    // ---- Skills: merge unique (case-insensitive) ----
    let mergedSkills = [...skills];
    if (selected.skills.length) {
      const lower = new Set(mergedSkills.map((s) => s.toLowerCase()));
      for (const sk of selected.skills) {
        if (!lower.has(sk.toLowerCase())) {
          mergedSkills.push(sk);
          lower.add(sk.toLowerCase());
        }
      }
      setSkills(mergedSkills);
    }

    // ---- Interests: merge unique (case-insensitive) ----
    let mergedInterests = [...interests];
    if (selected.interests.length) {
      const lower = new Set(mergedInterests.map((s) => s.toLowerCase()));
      for (const it of selected.interests) {
        if (!lower.has(it.toLowerCase())) {
          mergedInterests.push(it);
          lower.add(it.toLowerCase());
        }
      }
      setInterests(mergedInterests);
    }

    // ---- Education: append new entries ----
    let mergedEdu = [...education];
    if (selected.education.length) {
      // Remove the blank placeholder row if it exists
      const nonBlank = mergedEdu.filter((e) => e.school || e.degree || e.year);
      mergedEdu = [...nonBlank, ...selected.education];
      setEducation(mergedEdu);
    }

    // ---- Experience: append new entries ----
    let mergedExp = [...experience];
    if (selected.experience.length) {
      const nonBlank = mergedExp.filter(
        (e) => e.company || e.position || e.duration || e.description,
      );
      mergedExp = [...nonBlank, ...selected.experience];
      setExperience(mergedExp);
    }

    // ---- Projects: append new entries ----
    let mergedProj = [...projects];
    if (selected.personal_projects.length) {
      const nonBlank = mergedProj.filter(
        (p) => p.name || p.description || p.link,
      );
      mergedProj = [...nonBlank, ...selected.personal_projects];
      setProjects(mergedProj);
    }

    // Persist everything at once
    try {
      const { error: err } = await supabase
        .from("profiles")
        .update({
          skills: mergedSkills,
          interests: mergedInterests,
          education: mergedEdu,
          experience: mergedExp,
          personal_projects: mergedProj,
        })
        .eq("id", session?.user?.id);
      if (err) console.error("Merge-save error:", err);
      else
        Alert.alert(
          "Updated",
          "Selected resume fields have been added to your profile.",
        );
    } catch (e) {
      console.error("Merge-save exception:", e);
    }
  };

  /* =========================
     Sign out
     ========================= */
  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  /* =========================
     Skills / Interests / Lists
     ========================= */
  const addSkill = () => {
    const input = skillSearch.trim();
    if (!input) return;
    const existsLower = new Set(skills.map((s) => s.toLowerCase()));
    if (existsLower.has(input.toLowerCase())) {
      Alert.alert("Already added", `"${input}" is already in your skills.`);
      return;
    }
    const next = [...skills, input];
    setSkills(next);
    setSkillSearch("");
    saveProfile();
  };

  const toggleSelectSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  };

  const cancelSkillSelection = () => {
    setSelectingSkills(false);
    setSelectedSkills([]);
  };

  const deleteSelectedSkills = async () => {
    try {
      if (!session?.user?.id) return;
      if (selectedSkills.length === 0) return;
      const remaining = skills.filter((s) => !selectedSkills.includes(s));
      setSkills(remaining);
      setSelectedSkills([]);
      setSelectingSkills(false);
      const { error } = await supabase
        .from("profiles")
        .update({ skills: remaining })
        .eq("id", session.user.id);
      if (error) console.error("Batch delete skills error:", error);
    } catch (e) {
      console.error("Batch delete skills exception:", e);
    }
  };
  const removeSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
    saveProfile();
  };

  const addInterest = () => {
    if (interestSearch.trim() && !interests.includes(interestSearch.trim())) {
      const next = [...interests, interestSearch.trim()];
      setInterests(next);
      setInterestSearch("");
      saveProfile();
    }
  };
  const removeInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
    saveProfile();
  };

  const addEducation = () => {
    const next = [
      ...education,
      { id: Date.now().toString(), school: "", degree: "", year: "" },
    ];
    setEducation(next);
    saveProfile();
  };
  const updateEducation = (id: string, field: string, value: string) => {
    setEducation(
      education.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  };
  const removeEducation = (id: string) => {
    setEducation(education.filter((e) => e.id !== id));
    saveProfile();
  };

  const addExperience = () => {
    const next = [
      ...experience,
      {
        id: Date.now().toString(),
        company: "",
        position: "",
        duration: "",
        description: "",
      },
    ];
    setExperience(next);
    saveProfile();
  };
  const updateExperience = (id: string, field: string, value: string) => {
    setExperience(
      experience.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  };
  const removeExperience = (id: string) => {
    setExperience(experience.filter((e) => e.id !== id));
    saveProfile();
  };

  const addProject = () => {
    const next = [
      ...projects,
      { id: Date.now().toString(), name: "", description: "", link: "" },
    ];
    setProjects(next);
    saveProfile();
  };
  const updateProject = (id: string, field: string, value: string) => {
    setProjects(
      projects.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };
  const removeProject = (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
    saveProfile();
  };

  /* =========================
     Render
     ========================= */
  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Profile Image */}
        <View style={styles.profileImageContainer}>
          <TouchableOpacity
            style={styles.profileImageButton}
            onPress={pickImage}
            disabled={uploadingImage}
          >
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={styles.profileImage}
              />
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
              {uploadingImage ? "Uploading..." : "Change Photo"}
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

        {/* Resume (pretty card, tidy filename, setup-style button) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resume</Text>

          <View style={styles.resumeCard}>
            <View style={styles.resumeRow}>
              <View style={styles.resumeIconBubble}>
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#2563eb"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeNameText} numberOfLines={1}>
                  {resumeFileName ?? "No resume on file"}
                </Text>
                <Text style={styles.resumeMetaText}>
                  Last uploaded:{" "}
                  {resumeUpdatedAt
                    ? new Date(resumeUpdatedAt).toLocaleString()
                    : "—"}
                </Text>
              </View>

              {!!resumeUrl && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(resumeUrl!)}
                  style={styles.smallLinkBtn}
                >
                  <Text style={styles.smallLinkText}>View</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={pickResume}
              disabled={uploadingResume}
              style={[
                styles.primaryBtn,
                uploadingResume && styles.primaryBtnDisabled,
              ]}
              activeOpacity={0.9}
            >
              {uploadingResume ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Upload New Resume</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={reparseResume}
              disabled={parsingResume || !PARSER_URL}
              style={[
                styles.secondaryBtn,
                (parsingResume || !PARSER_URL) && styles.secondaryBtnDisabled,
              ]}
              activeOpacity={0.9}
            >
              {parsingResume ? (
                <ActivityIndicator color="#2563eb" />
              ) : (
                <Text style={styles.secondaryBtnText}>Re-parse Resume</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Skills */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Ionicons name="construct-outline" size={20} color="#2563eb" />
              <Text style={styles.sectionTitle}>Skills</Text>
            </View>
            {skills.length > 0 && !selectingSkills && (
              <TouchableOpacity
                onPress={() => setSelectingSkills(true)}
                style={styles.smallLinkBtn}
              >
                <Text style={styles.smallLinkText}>Select</Text>
              </TouchableOpacity>
            )}
            {selectingSkills && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={cancelSkillSelection}
                  style={styles.smallLinkBtn}
                >
                  <Text style={styles.smallLinkText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={deleteSelectedSkills}
                  disabled={selectedSkills.length === 0}
                  style={[
                    styles.smallLinkBtn,
                    selectedSkills.length === 0 && { opacity: 0.5 },
                  ]}
                >
                  <Text style={[styles.smallLinkText, { color: "#FF3B30" }]}>
                    Delete ({selectedSkills.length})
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
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
          {skills.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="construct-outline" size={28} color="#d1d5db" />
              <Text style={styles.emptyStateText}>No skills added yet</Text>
            </View>
          )}
          <View style={styles.tagsContainer}>
            {skills.map((skill, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.8}
                onPress={() => {
                  if (selectingSkills) toggleSelectSkill(skill);
                }}
                onLongPress={() => {
                  if (!selectingSkills) setSelectingSkills(true);
                  toggleSelectSkill(skill);
                }}
                style={[
                  styles.tag,
                  selectingSkills &&
                    selectedSkills.includes(skill) &&
                    styles.tagSelected,
                ]}
              >
                <Text style={styles.tagText}>{skill}</Text>
                {!selectingSkills && (
                  <TouchableOpacity onPress={() => removeSkill(skill)}>
                    <Ionicons name="close-circle" size={20} color="#666" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Interests */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Ionicons name="heart-outline" size={20} color="#2563eb" />
              <Text style={styles.sectionTitle}>Interests</Text>
            </View>
          </View>
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
          {interests.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="heart-outline" size={28} color="#d1d5db" />
              <Text style={styles.emptyStateText}>No interests added yet</Text>
            </View>
          )}
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
            <View style={styles.sectionHeaderLeft}>
              <Ionicons name="school-outline" size={20} color="#2563eb" />
              <Text style={styles.sectionTitle}>Education</Text>
            </View>
            <TouchableOpacity
              onPress={addEducation}
              style={styles.addIconButton}
            >
              <Ionicons name="add-circle" size={28} color="#2563eb" />
            </TouchableOpacity>
          </View>
          {education.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="school-outline" size={28} color="#d1d5db" />
              <Text style={styles.emptyStateText}>No education added yet</Text>
              <Text style={styles.emptyStateHint}>
                Tap + to add your education
              </Text>
            </View>
          )}
          {education.map((edu, idx) => (
            <View key={edu.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardLabelRow}>
                  <Ionicons name="school-outline" size={18} color="#6b7280" />
                  <Text style={styles.cardLabel}>
                    Education {education.length > 1 ? idx + 1 : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeEducation(edu.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={edu.school}
                onChangeText={(t) => updateEducation(edu.id, "school", t)}
                onBlur={saveProfile}
                placeholder="School/University"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={edu.degree}
                onChangeText={(t) => updateEducation(edu.id, "degree", t)}
                onBlur={saveProfile}
                placeholder="Degree/Field of Study"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={edu.year}
                onChangeText={(t) => updateEducation(edu.id, "year", t)}
                onBlur={saveProfile}
                placeholder="Year (e.g., 2020-2024)"
                placeholderTextColor="#999"
              />
            </View>
          ))}
        </View>

        {/* Experience */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Ionicons name="briefcase-outline" size={20} color="#2563eb" />
              <Text style={styles.sectionTitle}>Experience</Text>
            </View>
            <TouchableOpacity
              onPress={addExperience}
              style={styles.addIconButton}
            >
              <Ionicons name="add-circle" size={28} color="#2563eb" />
            </TouchableOpacity>
          </View>
          {experience.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="briefcase-outline" size={28} color="#d1d5db" />
              <Text style={styles.emptyStateText}>No experience added yet</Text>
              <Text style={styles.emptyStateHint}>
                Tap + to add your experience
              </Text>
            </View>
          )}
          {experience.map((exp, idx) => (
            <View key={exp.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardLabelRow}>
                  <Ionicons
                    name="briefcase-outline"
                    size={18}
                    color="#6b7280"
                  />
                  <Text style={styles.cardLabel}>
                    Experience {experience.length > 1 ? idx + 1 : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeExperience(exp.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={exp.company}
                onChangeText={(t) => updateExperience(exp.id, "company", t)}
                onBlur={saveProfile}
                placeholder="Company"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={exp.position}
                onChangeText={(t) => updateExperience(exp.id, "position", t)}
                onBlur={saveProfile}
                placeholder="Position/Role"
                placeholderTextColor="#999"
              />
              <TextInput
                style={styles.input}
                value={exp.duration}
                onChangeText={(t) => updateExperience(exp.id, "duration", t)}
                onBlur={saveProfile}
                placeholder="Duration (e.g., Jan 2020 - Dec 2022)"
                placeholderTextColor="#999"
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                value={exp.description}
                onChangeText={(t) => updateExperience(exp.id, "description", t)}
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

        {/* Projects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Ionicons name="code-slash-outline" size={20} color="#2563eb" />
              <Text style={styles.sectionTitle}>Projects</Text>
            </View>
            <TouchableOpacity onPress={addProject} style={styles.addIconButton}>
              <Ionicons name="add-circle" size={28} color="#2563eb" />
            </TouchableOpacity>
          </View>
          {projects.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="code-slash-outline" size={28} color="#d1d5db" />
              <Text style={styles.emptyStateText}>No projects added yet</Text>
              <Text style={styles.emptyStateHint}>
                Tap + to add your projects
              </Text>
            </View>
          )}
          {projects.map((project, idx) => (
            <View key={project.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardLabelRow}>
                  <Ionicons
                    name="code-slash-outline"
                    size={18}
                    color="#6b7280"
                  />
                  <Text style={styles.cardLabel}>
                    Project {projects.length > 1 ? idx + 1 : ""}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeProject(project.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                value={project.name}
                onChangeText={(t) => updateProject(project.id, "name", t)}
                onBlur={saveProfile}
                placeholder="Project Name"
                placeholderTextColor="#999"
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                value={project.description}
                onChangeText={(t) =>
                  updateProject(project.id, "description", t)
                }
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
                onChangeText={(t) => updateProject(project.id, "link", t)}
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

      {/* Parsed-resume review popup */}
      <ParseReviewModal
        visible={reviewModalVisible}
        data={parsedResumeData}
        onConfirm={handleReviewConfirm}
        onCancel={() => setReviewModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  scrollView: { flex: 1, padding: 20 },

  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  headerTitle: { fontSize: 28, fontWeight: "700", color: "#333" },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FF3B30",
    gap: 6,
  },
  signOutText: { color: "#FF3B30", fontSize: 14, fontWeight: "600" },

  profileImageContainer: {
    alignItems: "center",
    marginBottom: 30,
    marginTop: 10,
  },
  profileImageButton: { marginBottom: 10, position: "relative" },
  profileImage: { width: 120, height: 120, borderRadius: 60 },
  placeholderImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  changePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  changePhotoText: { color: "#007AFF", fontSize: 16, fontWeight: "600" },

  section: { marginBottom: 25 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 10,
  },
  disabledInput: { backgroundColor: "#f0f0f0", color: "#666" },
  textArea: { minHeight: 100, paddingTop: 14 },

  socialLinkContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 12,
    gap: 12,
  },
  socialInput: { flex: 1, fontSize: 16, color: "#333" },

  searchContainer: { flexDirection: "row", marginBottom: 12 },
  searchInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    marginRight: 10,
  },
  addButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    width: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  addIconButton: { padding: 4 },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 6,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#9ca3af",
    fontWeight: "500",
  },
  emptyStateHint: {
    fontSize: 13,
    color: "#d1d5db",
  },

  tagsContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    gap: 6,
  },
  tagText: { fontSize: 14, color: "#333" },
  tagSelected: { backgroundColor: "#2563eb1A", borderColor: "#2563eb" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  cardLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    alignItems: "center",
    justifyContent: "center",
  },

  // Resume styles (pretty card + setup-like button)
  resumeCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 14,
  },
  resumeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  resumeIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  resumeNameText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  resumeMetaText: { fontSize: 12, color: "#6b7280", marginTop: 2 },

  smallLinkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  smallLinkText: { color: "#2563eb", fontWeight: "600" },

  primaryBtn: {
    width: "100%",
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnDisabled: { backgroundColor: "#9ca3af" },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryBtn: {
    width: "100%",
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2563eb",
    marginTop: 8,
  },
  secondaryBtnDisabled: { opacity: 0.5 },
  secondaryBtnText: { color: "#2563eb", fontSize: 15, fontWeight: "600" },
});
