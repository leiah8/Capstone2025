/**
 * ParseReviewModal
 *
 * Full-screen modal that shows every field the resume parser extracted.
 * The user can toggle individual sections (Skills, Interests, Education,
 * Experience, Projects) and even deselect individual items before
 * confirming.  On confirm the selected data is returned via `onConfirm`.
 */

import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  year: string;
}

export interface ExperienceItem {
  id: string;
  company: string;
  position: string;
  duration: string;
  description: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  link: string;
}

export interface ParsedData {
  skills: string[];
  interests: string[];
  education: EducationItem[];
  experience: ExperienceItem[];
  personal_projects: ProjectItem[];
}

export interface ConfirmedData {
  skills: string[];
  interests: string[];
  education: EducationItem[];
  experience: ExperienceItem[];
  personal_projects: ProjectItem[];
}

interface Props {
  visible: boolean;
  data: ParsedData;
  onConfirm: (selected: ConfirmedData) => void;
  onCancel: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ParseReviewModal({
  visible,
  data,
  onConfirm,
  onCancel,
}: Props) {
  /* — per-item selection state — */
  const [selSkills, setSelSkills] = useState<Set<number>>(
    new Set(data.skills.map((_, i) => i)),
  );
  const [selInterests, setSelInterests] = useState<Set<number>>(
    new Set(data.interests.map((_, i) => i)),
  );
  const [selEdu, setSelEdu] = useState<Set<number>>(
    new Set(data.education.map((_, i) => i)),
  );
  const [selExp, setSelExp] = useState<Set<number>>(
    new Set(data.experience.map((_, i) => i)),
  );
  const [selProj, setSelProj] = useState<Set<number>>(
    new Set(data.personal_projects.map((_, i) => i)),
  );

  /* re-sync when data changes (e.g. new parse) */
  React.useEffect(() => {
    setSelSkills(new Set(data.skills.map((_, i) => i)));
    setSelInterests(new Set(data.interests.map((_, i) => i)));
    setSelEdu(new Set(data.education.map((_, i) => i)));
    setSelExp(new Set(data.experience.map((_, i) => i)));
    setSelProj(new Set(data.personal_projects.map((_, i) => i)));
  }, [data]);

  const toggle = (
    set: Set<number>,
    setter: React.Dispatch<React.SetStateAction<Set<number>>>,
    idx: number,
  ) => {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setter(next);
  };

  const toggleAll = (
    allIndices: number[],
    set: Set<number>,
    setter: React.Dispatch<React.SetStateAction<Set<number>>>,
  ) => {
    if (set.size === allIndices.length) {
      setter(new Set());
    } else {
      setter(new Set(allIndices));
    }
  };

  const handleConfirm = () => {
    onConfirm({
      skills: data.skills.filter((_, i) => selSkills.has(i)),
      interests: data.interests.filter((_, i) => selInterests.has(i)),
      education: data.education.filter((_, i) => selEdu.has(i)),
      experience: data.experience.filter((_, i) => selExp.has(i)),
      personal_projects: data.personal_projects.filter((_, i) =>
        selProj.has(i),
      ),
    });
  };

  const totalSelected =
    selSkills.size +
    selInterests.size +
    selEdu.size +
    selExp.size +
    selProj.size;

  /* ---------------------------------------------------------------- */
  /*  Sub-renderers                                                    */
  /* ---------------------------------------------------------------- */

  const renderCheck = (on: boolean) => (
    <Ionicons
      name={on ? "checkbox" : "square-outline"}
      size={22}
      color={on ? "#2563eb" : "#9ca3af"}
    />
  );

  const SectionHeader = ({
    title,
    count,
    selected,
    allIndices,
    setter,
    set,
  }: {
    title: string;
    count: number;
    selected: number;
    allIndices: number[];
    setter: React.Dispatch<React.SetStateAction<Set<number>>>;
    set: Set<number>;
  }) => (
    <TouchableOpacity
      style={s.sectionHeader}
      onPress={() => toggleAll(allIndices, set, setter)}
      activeOpacity={0.7}
    >
      {renderCheck(selected === count && count > 0)}
      <Text style={s.sectionTitle}>
        {title}{" "}
        <Text style={s.sectionCount}>
          ({selected}/{count})
        </Text>
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={s.root}>
        {/* Top bar */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={onCancel} hitSlop={12}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.topTitle}>Review Parsed Resume</Text>
          <TouchableOpacity onPress={handleConfirm} hitSlop={12}>
            <Text style={s.doneText}>
              Add{totalSelected > 0 ? ` (${totalSelected})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.subtitle}>
            Select the fields you want to add to your profile.
          </Text>

          {/* ---- SKILLS ---- */}
          {data.skills.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Skills"
                count={data.skills.length}
                selected={selSkills.size}
                allIndices={data.skills.map((_, i) => i)}
                set={selSkills}
                setter={setSelSkills}
              />
              <View style={s.tagWrap}>
                {data.skills.map((sk, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.tag, selSkills.has(i) && s.tagOn]}
                    onPress={() => toggle(selSkills, setSelSkills, i)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.tagText, selSkills.has(i) && s.tagTextOn]}>
                      {sk}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ---- INTERESTS ---- */}
          {data.interests.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Interests"
                count={data.interests.length}
                selected={selInterests.size}
                allIndices={data.interests.map((_, i) => i)}
                set={selInterests}
                setter={setSelInterests}
              />
              <View style={s.tagWrap}>
                {data.interests.map((it, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.tag, selInterests.has(i) && s.tagOn]}
                    onPress={() => toggle(selInterests, setSelInterests, i)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[s.tagText, selInterests.has(i) && s.tagTextOn]}
                    >
                      {it}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ---- EDUCATION ---- */}
          {data.education.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Education"
                count={data.education.length}
                selected={selEdu.size}
                allIndices={data.education.map((_, i) => i)}
                set={selEdu}
                setter={setSelEdu}
              />
              {data.education.map((edu, i) => (
                <TouchableOpacity
                  key={edu.id}
                  style={s.cardRow}
                  onPress={() => toggle(selEdu, setSelEdu, i)}
                  activeOpacity={0.7}
                >
                  {renderCheck(selEdu.has(i))}
                  <View style={s.cardBody}>
                    {!!edu.school && (
                      <Text style={s.cardPrimary}>{edu.school}</Text>
                    )}
                    {!!edu.degree && (
                      <Text style={s.cardSecondary}>{edu.degree}</Text>
                    )}
                    {!!edu.year && <Text style={s.cardMeta}>{edu.year}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ---- EXPERIENCE ---- */}
          {data.experience.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Experience"
                count={data.experience.length}
                selected={selExp.size}
                allIndices={data.experience.map((_, i) => i)}
                set={selExp}
                setter={setSelExp}
              />
              {data.experience.map((exp, i) => (
                <TouchableOpacity
                  key={exp.id}
                  style={s.cardRow}
                  onPress={() => toggle(selExp, setSelExp, i)}
                  activeOpacity={0.7}
                >
                  {renderCheck(selExp.has(i))}
                  <View style={s.cardBody}>
                    {!!exp.company && (
                      <Text style={s.cardPrimary}>{exp.company}</Text>
                    )}
                    {!!exp.position && (
                      <Text style={s.cardSecondary}>{exp.position}</Text>
                    )}
                    {!!exp.duration && (
                      <Text style={s.cardMeta}>{exp.duration}</Text>
                    )}
                    {!!exp.description && (
                      <Text style={s.cardDesc} numberOfLines={3}>
                        {exp.description}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ---- PROJECTS ---- */}
          {data.personal_projects.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Projects"
                count={data.personal_projects.length}
                selected={selProj.size}
                allIndices={data.personal_projects.map((_, i) => i)}
                set={selProj}
                setter={setSelProj}
              />
              {data.personal_projects.map((proj, i) => (
                <TouchableOpacity
                  key={proj.id}
                  style={s.cardRow}
                  onPress={() => toggle(selProj, setSelProj, i)}
                  activeOpacity={0.7}
                >
                  {renderCheck(selProj.has(i))}
                  <View style={s.cardBody}>
                    {!!proj.name && (
                      <Text style={s.cardPrimary}>{proj.name}</Text>
                    )}
                    {!!proj.description && (
                      <Text style={s.cardDesc} numberOfLines={3}>
                        {proj.description}
                      </Text>
                    )}
                    {!!proj.link && (
                      <Text style={s.cardLink} numberOfLines={1}>
                        {proj.link}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* empty state */}
          {data.skills.length === 0 &&
            data.interests.length === 0 &&
            data.education.length === 0 &&
            data.experience.length === 0 &&
            data.personal_projects.length === 0 && (
              <View style={s.emptyWrap}>
                <Ionicons
                  name="document-text-outline"
                  size={48}
                  color="#d1d5db"
                />
                <Text style={s.emptyText}>
                  No structured data could be extracted from this resume.
                </Text>
              </View>
            )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  cancelText: { fontSize: 16, color: "#6b7280" },
  topTitle: { fontSize: 17, fontWeight: "600", color: "#111827" },
  doneText: { fontSize: 16, fontWeight: "700", color: "#2563eb" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
    lineHeight: 20,
  },

  sectionBlock: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  sectionCount: { fontWeight: "400", color: "#6b7280" },

  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
  },
  tagOn: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb",
  },
  tagText: { fontSize: 14, color: "#374151" },
  tagTextOn: { color: "#2563eb", fontWeight: "600" },

  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardBody: { flex: 1, gap: 2 },
  cardPrimary: { fontSize: 15, fontWeight: "600", color: "#111827" },
  cardSecondary: { fontSize: 14, color: "#374151" },
  cardMeta: { fontSize: 13, color: "#6b7280" },
  cardDesc: { fontSize: 13, color: "#4b5563", marginTop: 4 },
  cardLink: { fontSize: 12, color: "#2563eb", marginTop: 2 },

  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 22,
  },
});
