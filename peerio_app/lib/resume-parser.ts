import Constants from "expo-constants";

export type ParsedLinks = {
  github: string;
  linkedin: string;
  instagram: string;
  twitter: string;
  portfolio: string;
  other: string;
};

export type EducationItem = {
  id: string;
  school: string;
  degree: string;
  year: string;
};

export type ExperienceItem = {
  id: string;
  company: string;
  position: string;
  duration: string;
  description: string;
};

export type ProjectItem = {
  id: string;
  name: string;
  description: string;
  link: string;
};

export type ParsedData = {
  bio: string;
  location: string;
  links: ParsedLinks;
  skills: string[];
  interests: string[];
  education: EducationItem[];
  experience: ExperienceItem[];
  personal_projects: ProjectItem[];
};

export type ConfirmedData = ParsedData;

export const DEFAULT_RESUME_PARSER_URL = "";

export const EMPTY_PARSED_LINKS: ParsedLinks = {
  github: "",
  linkedin: "",
  instagram: "",
  twitter: "",
  portfolio: "",
  other: "",
};

function normalizeUrl(url?: string | null) {
  return url?.trim().replace(/\/$/, "") || "";
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLink(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  if (text.startsWith("www.")) return `https://${text}`;
  if (/^(github|linkedin|twitter|x|instagram)\.com\//i.test(text)) {
    return `https://${text}`;
  }
  if (text.includes(".") && !text.includes(" ") && !text.includes("@")) {
    return `https://${text}`;
  }
  return text;
}

function dedupeStrings(values: unknown, limit = 30) {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = asText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function buildId(prefix: string, index: number) {
  return `${prefix}-${Date.now()}-${index}`;
}

export function createEmptyParsedData(): ParsedData {
  return {
    bio: "",
    location: "",
    links: { ...EMPTY_PARSED_LINKS },
    skills: [],
    interests: [],
    education: [],
    experience: [],
    personal_projects: [],
  };
}

export function normalizeParsedResumePayload(parsed: any): ParsedData {
  const links = parsed?.links ?? {};

  return {
    bio: asText(parsed?.bio),
    location: asText(parsed?.location),
    links: {
      github: normalizeLink(links.github),
      linkedin: normalizeLink(links.linkedin),
      instagram: normalizeLink(links.instagram),
      twitter: normalizeLink(links.twitter),
      portfolio: normalizeLink(links.portfolio),
      other: normalizeLink(links.other),
    },
    skills: dedupeStrings(parsed?.skills, 30),
    interests: dedupeStrings(parsed?.interests, 20),
    education: Array.isArray(parsed?.education)
      ? parsed.education
          .map((entry: any, index: number) => ({
            id: asText(entry?.id) || buildId("edu", index),
            school: asText(entry?.school),
            degree: asText(entry?.degree),
            year: asText(entry?.year),
          }))
          .filter(
            (entry: EducationItem) => entry.school || entry.degree || entry.year,
          )
      : [],
    experience: Array.isArray(parsed?.experience)
      ? parsed.experience
          .map((entry: any, index: number) => ({
            id: asText(entry?.id) || buildId("exp", index),
            company: asText(entry?.company),
            position: asText(entry?.position),
            duration: asText(entry?.duration),
            description: asText(entry?.description),
          }))
          .filter(
            (entry: ExperienceItem) =>
              entry.company ||
              entry.position ||
              entry.duration ||
              entry.description,
          )
      : [],
    personal_projects: Array.isArray(parsed?.personal_projects)
      ? parsed.personal_projects
          .map((entry: any, index: number) => ({
            id: asText(entry?.id) || buildId("proj", index),
            name: asText(entry?.name),
            description: asText(entry?.description),
            link: normalizeLink(entry?.link),
          }))
          .filter(
            (entry: ProjectItem) => entry.name || entry.description || entry.link,
          )
      : [],
  };
}

export function hasParsedResumeData(data: ParsedData) {
  return Boolean(
    data.bio ||
      data.location ||
      Object.values(data.links).some(Boolean) ||
      data.skills.length ||
      data.interests.length ||
      data.education.length ||
      data.experience.length ||
      data.personal_projects.length,
  );
}

export function getResumeParserUrl() {
  const edgeUrl = normalizeUrl(process.env.EXPO_PUBLIC_PARSER_EDGE_URL);
  if (edgeUrl) return edgeUrl;

  const configUrl = normalizeUrl(
    (Constants.expoConfig?.extra as { parserUrl?: string } | undefined)
      ?.parserUrl,
  );
  if (configUrl) return configUrl;

  const directUrl = normalizeUrl(process.env.EXPO_PUBLIC_PARSER_URL);
  if (directUrl) return directUrl;

  const supabaseUrl = normalizeUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
  if (supabaseUrl) return `${supabaseUrl}/functions/v1/resume-parser`;

  return DEFAULT_RESUME_PARSER_URL;
}
