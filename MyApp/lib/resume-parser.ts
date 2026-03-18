import Constants from "expo-constants";

export const DEFAULT_RESUME_PARSER_URL =
  "https://resume-parser-production-000c.up.railway.app";

function normalizeUrl(url?: string | null) {
  return url?.trim().replace(/\/$/, "") || "";
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
