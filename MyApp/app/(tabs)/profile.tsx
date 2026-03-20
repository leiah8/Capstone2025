// ProfilePage.tsx

/* =========================
   Imports & setup
   ========================= */
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateRangePickerModal from "../../components/DateRangePickerModal";
import ParseReviewModal, {
  type ConfirmedData,
  type ParsedData,
} from "../../components/ParseReviewModal";
import { useAuth } from "../../contexts/AuthContext";
import {
  createEmptyParsedData,
  getResumeParserUrl,
  hasParsedResumeData,
  normalizeParsedResumePayload,
} from "../../lib/resume-parser";
import { supabase } from "../../lib/supabase";

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
  const [portfolio, setPortfolio] = useState("");
  const [otherLink, setOtherLink] = useState("");

  const [education, setEducation] = useState<
    { id: string; school: string; degree: string; year: string }[]
  >([]);

  const [experience, setExperience] = useState<
    {
      id: string;
      company: string;
      position: string;
      duration: string;
      description: string;
    }[]
  >([]);

  const [projects, setProjects] = useState<
    { id: string; name: string; description: string; link: string }[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  /* Draft state for adding new entries */
  const [showEduDraft, setShowEduDraft] = useState(false);
  const [eduDraft, setEduDraft] = useState({
    school: "",
    degree: "",
    year: "",
  });
  const [eduDraftTried, setEduDraftTried] = useState(false);

  const [showExpDraft, setShowExpDraft] = useState(false);
  const [expDraft, setExpDraft] = useState({
    company: "",
    position: "",
    duration: "",
    description: "",
  });
  const [expDraftTried, setExpDraftTried] = useState(false);

  const [showProjDraft, setShowProjDraft] = useState(false);
  const [projDraft, setProjDraft] = useState({
    name: "",
    description: "",
    link: "",
  });
  const [projDraftTried, setProjDraftTried] = useState(false);

  /* Date picker state */
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<"year" | "monthYear">(
    "year",
  );
  const [datePickerValue, setDatePickerValue] = useState("");
  const [datePickerCallback, setDatePickerCallback] = useState<
    ((v: string) => void) | null
  >(null);

  const openDatePicker = (
    mode: "year" | "monthYear",
    currentValue: string,
    onConfirm: (v: string) => void,
  ) => {
    setDatePickerMode(mode);
    setDatePickerValue(currentValue);
    setDatePickerCallback(() => onConfirm);
    setDatePickerVisible(true);
  };

  const resetEditingUiState = () => {
    setSelectingSkills(false);
    setSelectedSkills([]);
    setSkillSearch("");
    setInterestSearch("");
    setShowEduDraft(false);
    setEduDraft({ school: "", degree: "", year: "" });
    setEduDraftTried(false);
    setShowExpDraft(false);
    setExpDraft({
      company: "",
      position: "",
      duration: "",
      description: "",
    });
    setExpDraftTried(false);
    setShowProjDraft(false);
    setProjDraft({ name: "", description: "", link: "" });
    setProjDraftTried(false);
  };

  const validateLocation = async (txt: string) => {
    const trimmed = txt.trim();
    if (!trimmed) return "";

    try {
      const { error } = await supabase.functions.invoke("geocode", {
        body: { city: trimmed },
      });

      if (error) throw error;

      return trimmed;
    } catch (e) {
      console.log("ERROR getting location", e);
      return trimmed;
    }
  };

  /* Resume state (derived name only) */
  const [resumeUrl, setResumeUrl] = useState<string | null>(null); // or swap to resume_path if you prefer
  const [resumeUpdatedAt, setResumeUpdatedAt] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [parsingResume, setParsingResume] = useState(false);
  const PARSER_URL = getResumeParserUrl();

  /* Review-modal state (shown after parsing) */
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [parsedResumeData, setParsedResumeData] = useState<ParsedData>(
    createEmptyParsedData(),
  );

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
            setPortfolio(data.links.portfolio || "");
            setOtherLink(data.links.other || "");
          }
          // Filter out completely blank placeholder entries
          setEducation(
            (data.education || []).filter(
              (e: any) => e.school || e.degree || e.year,
            ),
          );
          setExperience(
            (data.experience || []).filter(
              (e: any) =>
                e.company || e.position || e.duration || e.description,
            ),
          );
          setProjects(
            (data.personal_projects || []).filter(
              (p: any) => p.name || p.description || p.link,
            ),
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
    if (!session?.user?.id) return;

    try {
      setSavingProfile(true);
      const validatedLocation = await validateLocation(location);
      setLocation(validatedLocation);

      const payload = {
        id: session.user.id,
        name,
        bio,
        location: validatedLocation,
        profile_image: profileImage,
        skills,
        interests,
        links: {
          github,
          linkedin,
          instagram,
          twitter,
          portfolio,
          other: otherLink,
        },
        education,
        experience,
        personal_projects: projects,
        visible: true,
      };
      const { error } = await supabase.from("profiles").upsert(payload);
      if (error) throw error;

      resetEditingUiState();
      setIsEditing(false);
      Alert.alert("Saved", "Your profile changes have been saved.");
    } catch (e) {
      console.error("Error saving profile:", e);
      Alert.alert("Error", "Failed to save your profile changes.");
    } finally {
      setSavingProfile(false);
    }
  };

  /* =========================
     Profile image upload (Storage bucket: "profiles")
     ========================= */
  const pickImage = async () => {
    if (!isEditing) return;

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
    if (!isEditing) return;

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
          const {
            data: { session: uploadSession },
          } = await supabase.auth.getSession();
          const resp = await fetch(
            `${PARSER_URL.replace(/\/$/, "")}/parse/upload`,
            {
              method: "POST",
              body: formData,
              headers: {
                Accept: "application/json",
                ...(uploadSession?.access_token
                  ? { Authorization: `Bearer ${uploadSession.access_token}` }
                  : {}),
              },
            },
          );
          if (!resp.ok) throw new Error(`Parser HTTP ${resp.status}`);
          const parsed = await resp.json();
          const reviewData = normalizeParsedResumePayload(parsed);

          if (hasParsedResumeData(reviewData)) {
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
      if (!isEditing) return;
      if (!PARSER_URL) {
        Alert.alert(
          "Parser not configured",
          "Set EXPO_PUBLIC_PARSER_EDGE_URL or app.json extra.parserUrl.",
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

      const {
        data: { session: reparseSession },
      } = await supabase.auth.getSession();
      const resp = await fetch(`${PARSER_URL.replace(/\/$/, "")}/parse/url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(reparseSession?.access_token
            ? { Authorization: `Bearer ${reparseSession.access_token}` }
            : {}),
        },
        body: JSON.stringify({ url }),
      });
      if (!resp.ok) throw new Error(`Parser HTTP ${resp.status}`);
      const parsed = await resp.json();
      const reviewData = normalizeParsedResumePayload(parsed);

      if (hasParsedResumeData(reviewData)) {
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
    setIsEditing(true);

    let mergedBio = bio;
    if (selected.bio) {
      mergedBio = selected.bio;
      setBio(mergedBio);
    }

    let mergedLocation = location;
    if (selected.location) {
      mergedLocation = selected.location;
      setLocation(mergedLocation);
    }

    const mergedLinks = {
      github: selected.links.github || github,
      linkedin: selected.links.linkedin || linkedin,
      instagram: selected.links.instagram || instagram,
      twitter: selected.links.twitter || twitter,
      portfolio: selected.links.portfolio || portfolio,
      other: selected.links.other || otherLink,
    };
    setGithub(mergedLinks.github);
    setLinkedin(mergedLinks.linkedin);
    setInstagram(mergedLinks.instagram);
    setTwitter(mergedLinks.twitter);
    setPortfolio(mergedLinks.portfolio);
    setOtherLink(mergedLinks.other);

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

    Alert.alert(
      "Draft updated",
      "Selected resume fields were added to your profile. Tap Save to keep these changes.",
    );
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

  const deleteSelectedSkills = () => {
    if (selectedSkills.length === 0) return;

    const remaining = skills.filter((s) => !selectedSkills.includes(s));
    setSkills(remaining);
    setSelectedSkills([]);
    setSelectingSkills(false);
  };
  const removeSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
  };

  const addInterest = () => {
    if (interestSearch.trim() && !interests.includes(interestSearch.trim())) {
      const next = [...interests, interestSearch.trim()];
      setInterests(next);
      setInterestSearch("");
    }
  };
  const removeInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  const addEducation = () => {
    setEduDraftTried(true);
    if (!eduDraft.school.trim() || !eduDraft.degree.trim()) return;
    const next = [...education, { id: Date.now().toString(), ...eduDraft }];
    setEducation(next);
    setEduDraft({ school: "", degree: "", year: "" });
    setEduDraftTried(false);
    setShowEduDraft(false);
  };
  const updateEducation = (id: string, field: string, value: string) => {
    setEducation(
      education.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  };
  const removeEducation = (id: string) => {
    setEducation(education.filter((e) => e.id !== id));
  };

  const addExperience = () => {
    setExpDraftTried(true);
    if (!expDraft.company.trim() || !expDraft.position.trim()) return;
    const next = [...experience, { id: Date.now().toString(), ...expDraft }];
    setExperience(next);
    setExpDraft({ company: "", position: "", duration: "", description: "" });
    setExpDraftTried(false);
    setShowExpDraft(false);
  };
  const updateExperience = (id: string, field: string, value: string) => {
    setExperience(
      experience.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  };
  const removeExperience = (id: string) => {
    setExperience(experience.filter((e) => e.id !== id));
  };

  const addProject = () => {
    setProjDraftTried(true);
    if (!projDraft.name.trim()) return;
    const next = [...projects, { id: Date.now().toString(), ...projDraft }];
    setProjects(next);
    setProjDraft({ name: "", description: "", link: "" });
    setProjDraftTried(false);
    setShowProjDraft(false);
  };
  const updateProject = (id: string, field: string, value: string) => {
    setProjects(
      projects.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };
  const removeProject = (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
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
        <ActivityIndicator size="large" color="#79BE58" />
      </View>
    );
  }

  const profileActionDisabled =
    savingProfile || uploadingImage || uploadingResume || parsingResume;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerContainer}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Image
                source={require("../../assets/images/peeriologo.png")}
                style={{ width: 36, height: 36 }}
                resizeMode="contain"
              />
              <Text style={styles.headerTitle}>My Profile</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[
                  isEditing ? styles.saveHeaderButton : styles.iconActionButton,
                  profileActionDisabled && styles.actionButtonDisabled,
                ]}
                onPress={isEditing ? saveProfile : () => setIsEditing(true)}
                disabled={profileActionDisabled}
              >
                {savingProfile ? (
                  <ActivityIndicator color={isEditing ? "#fff" : "#79BE58"} />
                ) : isEditing ? (
                  <Text style={styles.saveHeaderButtonText}>Save</Text>
                ) : (
                  <Ionicons name="pencil" size={18} color="#79BE58" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.signOutButton}
                onPress={handleSignOut}
              >
                <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Profile Image */}
          <View style={styles.profileImageContainer}>
            <TouchableOpacity
              style={styles.profileImageButton}
              onPress={pickImage}
              disabled={!isEditing || uploadingImage}
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
                  <ActivityIndicator size="large" color="#79BE58" />
                </View>
              )}
            </TouchableOpacity>
            {isEditing ? (
              <TouchableOpacity
                style={styles.changePhotoButton}
                onPress={pickImage}
                disabled={uploadingImage}
              >
                <Ionicons name="camera" size={16} color="#79BE58" />
                <Text style={styles.changePhotoText}>
                  {uploadingImage ? "Uploading..." : "Change Photo"}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.readOnlyHelperText}>
                Tap Edit to change your profile photo.
              </Text>
            )}
          </View>

          {/* Basic Info */}
          <View style={styles.section}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.readOnlyInput]}
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor="#999"
              editable={isEditing}
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
              style={[styles.input, !isEditing && styles.readOnlyInput]}
              value={location}
              onChangeText={setLocation}
              placeholder="City, Country"
              placeholderTextColor="#999"
              editable={isEditing}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                !isEditing && styles.readOnlyInput,
              ]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholderTextColor="#999"
              editable={isEditing}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="link-outline" size={20} color="#79BE58" />
                <Text style={styles.sectionTitle}>Links</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>GitHub</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.readOnlyInput]}
              value={github}
              onChangeText={setGithub}
              placeholder="https://github.com/username"
              autoCapitalize="none"
              keyboardType="url"
              placeholderTextColor="#999"
              editable={isEditing}
            />

            <Text style={styles.fieldLabel}>LinkedIn</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.readOnlyInput]}
              value={linkedin}
              onChangeText={setLinkedin}
              placeholder="https://linkedin.com/in/username"
              autoCapitalize="none"
              keyboardType="url"
              placeholderTextColor="#999"
              editable={isEditing}
            />

            <Text style={styles.fieldLabel}>Portfolio</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.readOnlyInput]}
              value={portfolio}
              onChangeText={setPortfolio}
              placeholder="https://your-site.com"
              autoCapitalize="none"
              keyboardType="url"
              placeholderTextColor="#999"
              editable={isEditing}
            />

            <Text style={styles.fieldLabel}>Twitter / X</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.readOnlyInput]}
              value={twitter}
              onChangeText={setTwitter}
              placeholder="https://x.com/username"
              autoCapitalize="none"
              keyboardType="url"
              placeholderTextColor="#999"
              editable={isEditing}
            />

            <Text style={styles.fieldLabel}>Instagram</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.readOnlyInput]}
              value={instagram}
              onChangeText={setInstagram}
              placeholder="https://instagram.com/username"
              autoCapitalize="none"
              keyboardType="url"
              placeholderTextColor="#999"
              editable={isEditing}
            />

            <Text style={styles.fieldLabel}>Other Link</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.readOnlyInput]}
              value={otherLink}
              onChangeText={setOtherLink}
              placeholder="https://example.com"
              autoCapitalize="none"
              keyboardType="url"
              placeholderTextColor="#999"
              editable={isEditing}
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
                    color="#79BE58"
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

              {isEditing ? (
                <>
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
                      <Text style={styles.primaryBtnText}>
                        Upload New Resume
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={reparseResume}
                    disabled={parsingResume || !PARSER_URL}
                    style={[
                      styles.secondaryBtn,
                      (parsingResume || !PARSER_URL) &&
                        styles.secondaryBtnDisabled,
                    ]}
                    activeOpacity={0.9}
                  >
                    {parsingResume ? (
                      <ActivityIndicator size="large" color="#79BE58" />
                    ) : (
                      <Text style={styles.secondaryBtnText}>
                        Re-parse Resume
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={styles.readOnlyHelperText}>
                  Tap Edit to upload or re-parse your resume.
                </Text>
              )}
            </View>
          </View>

          {/* Skills */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="construct-outline" size={20} color="#79BE58" />
                <Text style={styles.sectionTitle}>Skills</Text>
              </View>
              {isEditing && skills.length > 0 && !selectingSkills && (
                <TouchableOpacity
                  onPress={() => setSelectingSkills(true)}
                  style={styles.smallLinkBtn}
                >
                  <Text style={styles.smallLinkText}>Select</Text>
                </TouchableOpacity>
              )}
              {isEditing && selectingSkills && (
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
            {isEditing && (
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
            )}
            {skills.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="construct-outline" size={28} color="#d1d5db" />
                <Text style={styles.emptyStateText}>No skills added yet</Text>
                {!isEditing && (
                  <Text style={styles.emptyStateHint}>
                    Tap Edit to add your skills
                  </Text>
                )}
              </View>
            )}
            <View style={styles.tagsContainer}>
              {skills.map((skill, index) => (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.8}
                  disabled={!isEditing}
                  onPress={() => {
                    if (isEditing && selectingSkills) toggleSelectSkill(skill);
                  }}
                  onLongPress={() => {
                    if (!isEditing) return;
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
                  {isEditing && !selectingSkills && (
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
                <Ionicons name="heart-outline" size={20} color="#79BE58" />
                <Text style={styles.sectionTitle}>Interests</Text>
              </View>
            </View>
            {isEditing && (
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  value={interestSearch}
                  onChangeText={setInterestSearch}
                  placeholder="Add an interest"
                  placeholderTextColor="#999"
                  onSubmitEditing={addInterest}
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={addInterest}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            {interests.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="heart-outline" size={28} color="#d1d5db" />
                <Text style={styles.emptyStateText}>
                  No interests added yet
                </Text>
                {!isEditing && (
                  <Text style={styles.emptyStateHint}>
                    Tap Edit to add your interests
                  </Text>
                )}
              </View>
            )}
            <View style={styles.tagsContainer}>
              {interests.map((interest, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{interest}</Text>
                  {isEditing && (
                    <TouchableOpacity onPress={() => removeInterest(interest)}>
                      <Ionicons name="close-circle" size={20} color="#666" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Education */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="school-outline" size={20} color="#79BE58" />
                <Text style={styles.sectionTitle}>Education</Text>
              </View>
              {isEditing && (
                <TouchableOpacity
                  onPress={() => {
                    setShowEduDraft(!showEduDraft);
                    setEduDraftTried(false);
                  }}
                  style={styles.addIconButton}
                >
                  <Ionicons
                    name={showEduDraft ? "close-circle" : "add-circle"}
                    size={28}
                    color="#79BE58"
                  />
                </TouchableOpacity>
              )}
            </View>
            {education.length === 0 && !showEduDraft && (
              <View style={styles.emptyState}>
                <Ionicons name="school-outline" size={28} color="#d1d5db" />
                <Text style={styles.emptyStateText}>
                  No education added yet
                </Text>
                <Text style={styles.emptyStateHint}>
                  {isEditing
                    ? "Tap + to add your education"
                    : "Tap Edit to add your education"}
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
                  {isEditing && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeEducation(edu.id)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#FF3B30"
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.fieldLabel}>School/University</Text>
                <TextInput
                  style={[styles.input, !isEditing && styles.readOnlyInput]}
                  value={edu.school}
                  onChangeText={(t) => updateEducation(edu.id, "school", t)}
                  placeholder="School/University"
                  placeholderTextColor="#999"
                  editable={isEditing}
                />
                <Text style={styles.fieldLabel}>Degree/Field of Study</Text>
                <TextInput
                  style={[styles.input, !isEditing && styles.readOnlyInput]}
                  value={edu.degree}
                  onChangeText={(t) => updateEducation(edu.id, "degree", t)}
                  placeholder="Degree/Field of Study"
                  placeholderTextColor="#999"
                  editable={isEditing}
                />
                <Text style={styles.fieldLabel}>Year</Text>
                <TouchableOpacity
                  style={[
                    styles.datePickerBtn,
                    !isEditing && styles.readOnlyInput,
                  ]}
                  disabled={!isEditing}
                  onPress={() =>
                    openDatePicker("year", edu.year, (v) =>
                      updateEducation(edu.id, "year", v),
                    )
                  }
                >
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <Text
                    style={
                      edu.year
                        ? styles.datePickerText
                        : styles.datePickerPlaceholder
                    }
                  >
                    {edu.year || "Select year range"}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
            {isEditing && showEduDraft && (
              <View style={[styles.card, styles.draftCard]}>
                <Text style={styles.draftTitle}>New Education</Text>
                <Text
                  style={[
                    styles.fieldLabel,
                    eduDraftTried &&
                      !eduDraft.school.trim() &&
                      styles.fieldLabelError,
                  ]}
                >
                  School/University*
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    eduDraftTried &&
                      !eduDraft.school.trim() &&
                      styles.errorInput,
                  ]}
                  value={eduDraft.school}
                  onChangeText={(t) => setEduDraft({ ...eduDraft, school: t })}
                  placeholder="School/University"
                  placeholderTextColor="#999"
                />
                <Text
                  style={[
                    styles.fieldLabel,
                    eduDraftTried &&
                      !eduDraft.degree.trim() &&
                      styles.fieldLabelError,
                  ]}
                >
                  Degree/Field of Study*
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    eduDraftTried &&
                      !eduDraft.degree.trim() &&
                      styles.errorInput,
                  ]}
                  value={eduDraft.degree}
                  onChangeText={(t) => setEduDraft({ ...eduDraft, degree: t })}
                  placeholder="Degree/Field of Study"
                  placeholderTextColor="#999"
                />
                <Text style={styles.fieldLabel}>Year</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() =>
                    openDatePicker("year", eduDraft.year, (v) =>
                      setEduDraft({ ...eduDraft, year: v }),
                    )
                  }
                >
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <Text
                    style={
                      eduDraft.year
                        ? styles.datePickerText
                        : styles.datePickerPlaceholder
                    }
                  >
                    {eduDraft.year || "Select year range"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.draftAddBtn}
                  onPress={addEducation}
                >
                  <Text style={styles.draftAddBtnText}>Add Education</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Experience */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="briefcase-outline" size={20} color="#79BE58" />
                <Text style={styles.sectionTitle}>Experience</Text>
              </View>
              {isEditing && (
                <TouchableOpacity
                  onPress={() => {
                    setShowExpDraft(!showExpDraft);
                    setExpDraftTried(false);
                  }}
                  style={styles.addIconButton}
                >
                  <Ionicons
                    name={showExpDraft ? "close-circle" : "add-circle"}
                    size={28}
                    color="#79BE58"
                  />
                </TouchableOpacity>
              )}
            </View>
            {experience.length === 0 && !showExpDraft && (
              <View style={styles.emptyState}>
                <Ionicons name="briefcase-outline" size={28} color="#d1d5db" />
                <Text style={styles.emptyStateText}>
                  No experience added yet
                </Text>
                <Text style={styles.emptyStateHint}>
                  {isEditing
                    ? "Tap + to add your experience"
                    : "Tap Edit to add your experience"}
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
                  {isEditing && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeExperience(exp.id)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#FF3B30"
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.fieldLabel}>Company</Text>
                <TextInput
                  style={[styles.input, !isEditing && styles.readOnlyInput]}
                  value={exp.company}
                  onChangeText={(t) => updateExperience(exp.id, "company", t)}
                  placeholder="Company"
                  placeholderTextColor="#999"
                  editable={isEditing}
                />
                <Text style={styles.fieldLabel}>Position/Role</Text>
                <TextInput
                  style={[styles.input, !isEditing && styles.readOnlyInput]}
                  value={exp.position}
                  onChangeText={(t) => updateExperience(exp.id, "position", t)}
                  placeholder="Position/Role"
                  placeholderTextColor="#999"
                  editable={isEditing}
                />
                <Text style={styles.fieldLabel}>Duration</Text>
                <TouchableOpacity
                  style={[
                    styles.datePickerBtn,
                    !isEditing && styles.readOnlyInput,
                  ]}
                  disabled={!isEditing}
                  onPress={() =>
                    openDatePicker("monthYear", exp.duration, (v) =>
                      updateExperience(exp.id, "duration", v),
                    )
                  }
                >
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <Text
                    style={
                      exp.duration
                        ? styles.datePickerText
                        : styles.datePickerPlaceholder
                    }
                  >
                    {exp.duration || "Select date range"}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    !isEditing && styles.readOnlyInput,
                  ]}
                  value={exp.description}
                  onChangeText={(t) =>
                    updateExperience(exp.id, "description", t)
                  }
                  placeholder="Description"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  placeholderTextColor="#999"
                  editable={isEditing}
                />
              </View>
            ))}
            {isEditing && showExpDraft && (
              <View style={[styles.card, styles.draftCard]}>
                <Text style={styles.draftTitle}>New Experience</Text>
                <Text
                  style={[
                    styles.fieldLabel,
                    expDraftTried &&
                      !expDraft.company.trim() &&
                      styles.fieldLabelError,
                  ]}
                >
                  Company*
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    expDraftTried &&
                      !expDraft.company.trim() &&
                      styles.errorInput,
                  ]}
                  value={expDraft.company}
                  onChangeText={(t) => setExpDraft({ ...expDraft, company: t })}
                  placeholder="Company"
                  placeholderTextColor="#999"
                />
                <Text
                  style={[
                    styles.fieldLabel,
                    expDraftTried &&
                      !expDraft.position.trim() &&
                      styles.fieldLabelError,
                  ]}
                >
                  Position/Role*
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    expDraftTried &&
                      !expDraft.position.trim() &&
                      styles.errorInput,
                  ]}
                  value={expDraft.position}
                  onChangeText={(t) =>
                    setExpDraft({ ...expDraft, position: t })
                  }
                  placeholder="Position/Role"
                  placeholderTextColor="#999"
                />
                <Text style={styles.fieldLabel}>Duration</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() =>
                    openDatePicker("monthYear", expDraft.duration, (v) =>
                      setExpDraft({ ...expDraft, duration: v }),
                    )
                  }
                >
                  <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                  <Text
                    style={
                      expDraft.duration
                        ? styles.datePickerText
                        : styles.datePickerPlaceholder
                    }
                  >
                    {expDraft.duration || "Select date range"}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={expDraft.description}
                  onChangeText={(t) =>
                    setExpDraft({ ...expDraft, description: t })
                  }
                  placeholder="Description"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  placeholderTextColor="#999"
                />
                <TouchableOpacity
                  style={styles.draftAddBtn}
                  onPress={addExperience}
                >
                  <Text style={styles.draftAddBtnText}>Add Experience</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Projects */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="code-slash-outline" size={20} color="#79BE58" />
                <Text style={styles.sectionTitle}>Projects</Text>
              </View>
              {isEditing && (
                <TouchableOpacity
                  onPress={() => {
                    setShowProjDraft(!showProjDraft);
                    setProjDraftTried(false);
                  }}
                  style={styles.addIconButton}
                >
                  <Ionicons
                    name={showProjDraft ? "close-circle" : "add-circle"}
                    size={28}
                    color="#79BE58"
                  />
                </TouchableOpacity>
              )}
            </View>
            {projects.length === 0 && !showProjDraft && (
              <View style={styles.emptyState}>
                <Ionicons name="code-slash-outline" size={28} color="#d1d5db" />
                <Text style={styles.emptyStateText}>No projects added yet</Text>
                <Text style={styles.emptyStateHint}>
                  {isEditing
                    ? "Tap + to add your projects"
                    : "Tap Edit to add your projects"}
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
                  {isEditing && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeProject(project.id)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color="#FF3B30"
                      />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.fieldLabel}>Project Name</Text>
                <TextInput
                  style={[styles.input, !isEditing && styles.readOnlyInput]}
                  value={project.name}
                  onChangeText={(t) => updateProject(project.id, "name", t)}
                  placeholder="Project Name"
                  placeholderTextColor="#999"
                  editable={isEditing}
                />
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    !isEditing && styles.readOnlyInput,
                  ]}
                  value={project.description}
                  onChangeText={(t) =>
                    updateProject(project.id, "description", t)
                  }
                  placeholder="Project Description"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  placeholderTextColor="#999"
                  editable={isEditing}
                />
                <Text style={styles.fieldLabel}>Link</Text>
                <TextInput
                  style={[styles.input, !isEditing && styles.readOnlyInput]}
                  value={project.link}
                  onChangeText={(t) => updateProject(project.id, "link", t)}
                  placeholder="Project Link (URL)"
                  keyboardType="url"
                  autoCapitalize="none"
                  placeholderTextColor="#999"
                  editable={isEditing}
                />
              </View>
            ))}
            {isEditing && showProjDraft && (
              <View style={[styles.card, styles.draftCard]}>
                <Text style={styles.draftTitle}>New Project</Text>
                <Text
                  style={[
                    styles.fieldLabel,
                    projDraftTried &&
                      !projDraft.name.trim() &&
                      styles.fieldLabelError,
                  ]}
                >
                  Project Name*
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    projDraftTried &&
                      !projDraft.name.trim() &&
                      styles.errorInput,
                  ]}
                  value={projDraft.name}
                  onChangeText={(t) => setProjDraft({ ...projDraft, name: t })}
                  placeholder="Project Name"
                  placeholderTextColor="#999"
                />
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={projDraft.description}
                  onChangeText={(t) =>
                    setProjDraft({ ...projDraft, description: t })
                  }
                  placeholder="Project Description"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  placeholderTextColor="#999"
                />
                <Text style={styles.fieldLabel}>Link</Text>
                <TextInput
                  style={styles.input}
                  value={projDraft.link}
                  onChangeText={(t) => setProjDraft({ ...projDraft, link: t })}
                  placeholder="Project Link (URL)"
                  keyboardType="url"
                  autoCapitalize="none"
                  placeholderTextColor="#999"
                />
                <TouchableOpacity
                  style={styles.draftAddBtn}
                  onPress={addProject}
                >
                  <Text style={styles.draftAddBtnText}>Add Project</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {isEditing && (
            <View style={styles.section}>
              <TouchableOpacity
                onPress={saveProfile}
                disabled={profileActionDisabled}
                style={[
                  styles.primaryBtn,
                  profileActionDisabled && styles.primaryBtnDisabled,
                ]}
                activeOpacity={0.9}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <ParseReviewModal
        visible={reviewModalVisible}
        data={parsedResumeData}
        onConfirm={handleReviewConfirm}
        onCancel={() => setReviewModalVisible(false)}
      />

      <DateRangePickerModal
        visible={datePickerVisible}
        mode={datePickerMode}
        initialValue={datePickerValue}
        onConfirm={(v) => {
          datePickerCallback?.(v);
          setDatePickerVisible(false);
        }}
        onCancel={() => setDatePickerVisible(false)}
      />
    </SafeAreaView>
  );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  scrollView: { flex: 1, padding: 20, paddingTop: 10 },

  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: "700", color: "#333" },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
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
  actionBar: {
    marginBottom: 20,
  },
  actionHint: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
  iconActionButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#79BE58",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  saveHeaderButton: {
    minWidth: 72,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#79BE58",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveHeaderButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },

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
  changePhotoText: { color: "#79BE58", fontSize: 16, fontWeight: "600" },
  readOnlyHelperText: {
    fontSize: 13,
    color: "#6b7280",
  },

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
  readOnlyInput: { backgroundColor: "#f9fafb", color: "#6b7280" },
  errorInput: { borderColor: "#e53935" },
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
    backgroundColor: "#79BE58",
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
  tagSelected: { backgroundColor: "#79BE581A", borderColor: "#79BE58" },

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
  smallLinkText: { color: "#79BE58", fontWeight: "600" },

  primaryBtn: {
    width: "100%",
    backgroundColor: "#79BE58",
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
    borderColor: "#79BE58",
    marginTop: 8,
  },
  secondaryBtnDisabled: { opacity: 0.5 },
  secondaryBtnText: { color: "#79BE58", fontSize: 15, fontWeight: "600" },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 4,
  },
  fieldLabelError: { color: "#e53935" },
  draftCard: {
    borderColor: "#79BE58",
    borderWidth: 1,
    borderStyle: "dashed",
    backgroundColor: "#f0f6ff",
  },
  draftTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#79BE58",
    marginBottom: 10,
  },
  draftAddBtn: {
    backgroundColor: "#79BE58",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
  },
  draftAddBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 10,
    gap: 10,
  },
  datePickerText: {
    fontSize: 16,
    color: "#333",
  },
  datePickerPlaceholder: {
    fontSize: 16,
    color: "#999",
  },
});
