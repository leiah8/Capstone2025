/**
 * ParseReviewModal
 *
 * Full-screen modal that shows every field the resume parser extracted.
 * The user can toggle individual sections before saving them into the app.
 */

import React, { useMemo, useState } from "react";
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

import type {
  ConfirmedData,
  ParsedData,
  ParsedLinks,
} from "../lib/resume-parser";
import { EMPTY_PARSED_LINKS } from "../lib/resume-parser";

export type { ConfirmedData, ParsedData } from "../lib/resume-parser";

const LINK_KEYS: Array<keyof ParsedLinks> = [
  "github",
  "linkedin",
  "instagram",
  "twitter",
  "portfolio",
  "other",
];

const LINK_LABELS: Record<keyof ParsedLinks, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  twitter: "Twitter",
  portfolio: "Portfolio",
  other: "Other Link",
};

interface Props {
  visible: boolean;
  data: ParsedData;
  onConfirm: (selected: ConfirmedData) => void;
  onCancel: () => void;
}

function toggleItem<T extends number | string>(
  selected: Set<T>,
  setter: React.Dispatch<React.SetStateAction<Set<T>>>,
  value: T,
) {
  const next = new Set(selected);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
}

function toggleAllItems<T extends number | string>(
  allValues: T[],
  selected: Set<T>,
  setter: React.Dispatch<React.SetStateAction<Set<T>>>,
) {
  if (selected.size === allValues.length) {
    setter(new Set());
  } else {
    setter(new Set(allValues));
  }
}

export default function ParseReviewModal({
  visible,
  data,
  onConfirm,
  onCancel,
}: Props) {
  const linkEntries = useMemo(
    () =>
      LINK_KEYS.filter((key) => Boolean(data.links[key])).map((key) => ({
        key,
        label: LINK_LABELS[key],
        value: data.links[key],
      })),
    [data.links],
  );

  const [selBio, setSelBio] = useState(Boolean(data.bio));
  const [selLocation, setSelLocation] = useState(Boolean(data.location));
  const [selLinks, setSelLinks] = useState<Set<keyof ParsedLinks>>(
    new Set(linkEntries.map((entry) => entry.key)),
  );
  const [selSkills, setSelSkills] = useState<Set<number>>(
    new Set(data.skills.map((_, index) => index)),
  );
  const [selInterests, setSelInterests] = useState<Set<number>>(
    new Set(data.interests.map((_, index) => index)),
  );
  const [selEdu, setSelEdu] = useState<Set<number>>(
    new Set(data.education.map((_, index) => index)),
  );
  const [selExp, setSelExp] = useState<Set<number>>(
    new Set(data.experience.map((_, index) => index)),
  );
  const [selProj, setSelProj] = useState<Set<number>>(
    new Set(data.personal_projects.map((_, index) => index)),
  );

  React.useEffect(() => {
    setSelBio(Boolean(data.bio));
    setSelLocation(Boolean(data.location));
    setSelLinks(new Set(linkEntries.map((entry) => entry.key)));
    setSelSkills(new Set(data.skills.map((_, index) => index)));
    setSelInterests(new Set(data.interests.map((_, index) => index)));
    setSelEdu(new Set(data.education.map((_, index) => index)));
    setSelExp(new Set(data.experience.map((_, index) => index)));
    setSelProj(new Set(data.personal_projects.map((_, index) => index)));
  }, [data, linkEntries]);

  const handleConfirm = () => {
    const selectedLinks = { ...EMPTY_PARSED_LINKS };
    for (const entry of linkEntries) {
      if (selLinks.has(entry.key)) {
        selectedLinks[entry.key] = entry.value;
      }
    }

    onConfirm({
      bio: selBio ? data.bio : "",
      location: selLocation ? data.location : "",
      links: selectedLinks,
      skills: data.skills.filter((_, index) => selSkills.has(index)),
      interests: data.interests.filter((_, index) => selInterests.has(index)),
      education: data.education.filter((_, index) => selEdu.has(index)),
      experience: data.experience.filter((_, index) => selExp.has(index)),
      personal_projects: data.personal_projects.filter((_, index) =>
        selProj.has(index),
      ),
    });
  };

  const totalSelected =
    (selBio ? 1 : 0) +
    (selLocation ? 1 : 0) +
    selLinks.size +
    selSkills.size +
    selInterests.size +
    selEdu.size +
    selExp.size +
    selProj.size;

  const hasAnything =
    Boolean(data.bio) ||
    Boolean(data.location) ||
    linkEntries.length > 0 ||
    data.skills.length > 0 ||
    data.interests.length > 0 ||
    data.education.length > 0 ||
    data.experience.length > 0 ||
    data.personal_projects.length > 0;

  const renderCheck = (checked: boolean) => (
    <Ionicons
      name={checked ? "checkbox" : "square-outline"}
      size={22}
      color={checked ? "#79BE58" : "#9ca3af"}
    />
  );

  const SectionHeader = <T extends number | string,>({
    title,
    selected,
    allValues,
    current,
    setter,
  }: {
    title: string;
    selected: number;
    allValues: T[];
    current: Set<T>;
    setter: React.Dispatch<React.SetStateAction<Set<T>>>;
  }) => (
    <TouchableOpacity
      style={s.sectionHeader}
      onPress={() => toggleAllItems(allValues, current, setter)}
      activeOpacity={0.7}
    >
      {renderCheck(selected === allValues.length && allValues.length > 0)}
      <Text style={s.sectionTitle}>
        {title}{" "}
        <Text style={s.sectionCount}>
          ({selected}/{allValues.length})
        </Text>
      </Text>
    </TouchableOpacity>
  );

  const SingleField = ({
    title,
    value,
    selected,
    onPress,
    numberOfLines,
  }: {
    title: string;
    value: string;
    selected: boolean;
    onPress: () => void;
    numberOfLines?: number;
  }) => (
    <View style={s.sectionBlock}>
      <TouchableOpacity style={s.sectionHeader} onPress={onPress} activeOpacity={0.7}>
        {renderCheck(selected)}
        <Text style={s.sectionTitle}>{title}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.cardRow} onPress={onPress} activeOpacity={0.7}>
        <View style={s.cardBody}>
          <Text style={s.cardDesc} numberOfLines={numberOfLines ?? 4}>
            {value}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={s.root}>
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

          {!!data.bio && (
            <SingleField
              title="Bio"
              value={data.bio}
              selected={selBio}
              onPress={() => setSelBio((current) => !current)}
            />
          )}

          {!!data.location && (
            <SingleField
              title="Location"
              value={data.location}
              selected={selLocation}
              onPress={() => setSelLocation((current) => !current)}
              numberOfLines={2}
            />
          )}

          {linkEntries.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Links"
                selected={selLinks.size}
                allValues={linkEntries.map((entry) => entry.key)}
                current={selLinks}
                setter={setSelLinks}
              />
              {linkEntries.map((entry) => (
                <TouchableOpacity
                  key={entry.key}
                  style={s.cardRow}
                  onPress={() => toggleItem(selLinks, setSelLinks, entry.key)}
                  activeOpacity={0.7}
                >
                  {renderCheck(selLinks.has(entry.key))}
                  <View style={s.cardBody}>
                    <Text style={s.cardPrimary}>{entry.label}</Text>
                    <Text style={s.cardLink} numberOfLines={1}>
                      {entry.value}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {data.skills.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Skills"
                selected={selSkills.size}
                allValues={data.skills.map((_, index) => index)}
                current={selSkills}
                setter={setSelSkills}
              />
              <View style={s.tagWrap}>
                {data.skills.map((skill, index) => (
                  <TouchableOpacity
                    key={`${skill}-${index}`}
                    style={[s.tag, selSkills.has(index) && s.tagOn]}
                    onPress={() => toggleItem(selSkills, setSelSkills, index)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[s.tagText, selSkills.has(index) && s.tagTextOn]}
                    >
                      {skill}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {data.interests.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Interests"
                selected={selInterests.size}
                allValues={data.interests.map((_, index) => index)}
                current={selInterests}
                setter={setSelInterests}
              />
              <View style={s.tagWrap}>
                {data.interests.map((interest, index) => (
                  <TouchableOpacity
                    key={`${interest}-${index}`}
                    style={[s.tag, selInterests.has(index) && s.tagOn]}
                    onPress={() =>
                      toggleItem(selInterests, setSelInterests, index)
                    }
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        s.tagText,
                        selInterests.has(index) && s.tagTextOn,
                      ]}
                    >
                      {interest}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {data.education.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Education"
                selected={selEdu.size}
                allValues={data.education.map((_, index) => index)}
                current={selEdu}
                setter={setSelEdu}
              />
              {data.education.map((education, index) => (
                <TouchableOpacity
                  key={education.id}
                  style={s.cardRow}
                  onPress={() => toggleItem(selEdu, setSelEdu, index)}
                  activeOpacity={0.7}
                >
                  {renderCheck(selEdu.has(index))}
                  <View style={s.cardBody}>
                    {!!education.school && (
                      <Text style={s.cardPrimary}>{education.school}</Text>
                    )}
                    {!!education.degree && (
                      <Text style={s.cardSecondary}>{education.degree}</Text>
                    )}
                    {!!education.year && (
                      <Text style={s.cardMeta}>{education.year}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {data.experience.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Experience"
                selected={selExp.size}
                allValues={data.experience.map((_, index) => index)}
                current={selExp}
                setter={setSelExp}
              />
              {data.experience.map((experience, index) => (
                <TouchableOpacity
                  key={experience.id}
                  style={s.cardRow}
                  onPress={() => toggleItem(selExp, setSelExp, index)}
                  activeOpacity={0.7}
                >
                  {renderCheck(selExp.has(index))}
                  <View style={s.cardBody}>
                    {!!experience.company && (
                      <Text style={s.cardPrimary}>{experience.company}</Text>
                    )}
                    {!!experience.position && (
                      <Text style={s.cardSecondary}>{experience.position}</Text>
                    )}
                    {!!experience.duration && (
                      <Text style={s.cardMeta}>{experience.duration}</Text>
                    )}
                    {!!experience.description && (
                      <Text style={s.cardDesc} numberOfLines={3}>
                        {experience.description}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {data.personal_projects.length > 0 && (
            <View style={s.sectionBlock}>
              <SectionHeader
                title="Projects"
                selected={selProj.size}
                allValues={data.personal_projects.map((_, index) => index)}
                current={selProj}
                setter={setSelProj}
              />
              {data.personal_projects.map((project, index) => (
                <TouchableOpacity
                  key={project.id}
                  style={s.cardRow}
                  onPress={() => toggleItem(selProj, setSelProj, index)}
                  activeOpacity={0.7}
                >
                  {renderCheck(selProj.has(index))}
                  <View style={s.cardBody}>
                    {!!project.name && (
                      <Text style={s.cardPrimary}>{project.name}</Text>
                    )}
                    {!!project.description && (
                      <Text style={s.cardDesc} numberOfLines={3}>
                        {project.description}
                      </Text>
                    )}
                    {!!project.link && (
                      <Text style={s.cardLink} numberOfLines={1}>
                        {project.link}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!hasAnything && (
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

          <View style={s.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

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
  doneText: { fontSize: 16, fontWeight: "700", color: "#79BE58" },
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
    backgroundColor: "#E8F5E2",
    borderColor: "#79BE58",
  },
  tagText: { fontSize: 14, color: "#374151" },
  tagTextOn: { color: "#79BE58", fontWeight: "600" },
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
  cardDesc: { fontSize: 13, color: "#4b5563", marginTop: 4, lineHeight: 20 },
  cardLink: { fontSize: 12, color: "#79BE58", marginTop: 2 },
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
  bottomSpacer: { height: 40 },
});
