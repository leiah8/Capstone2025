import {
  createEmptyParsedData,
  normalizeParsedResumePayload,
  hasParsedResumeData,
  getResumeParserUrl,
  EMPTY_PARSED_LINKS,
  DEFAULT_RESUME_PARSER_URL,
  ParsedData,
} from '../lib/resume-parser';

// Mock expo-constants so we can control expoConfig in getResumeParserUrl tests
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

// Helper to get the mocked Constants object
function getMockedConstants() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-constants').default as { expoConfig: { extra: Record<string, unknown> } };
}

// ─── createEmptyParsedData ────────────────────────────────────────────────────

describe('createEmptyParsedData', () => {
  it('returns a fully empty ParsedData object', () => {
    const data = createEmptyParsedData();
    expect(data).toEqual({
      bio: '',
      location: '',
      links: { ...EMPTY_PARSED_LINKS },
      skills: [],
      interests: [],
      education: [],
      experience: [],
      personal_projects: [],
    });
  });

  it('returns a new object on each call (no shared references)', () => {
    const a = createEmptyParsedData();
    const b = createEmptyParsedData();
    a.bio = 'mutated';
    a.skills.push('React');
    expect(b.bio).toBe('');
    expect(b.skills).toHaveLength(0);
  });

  it('returns independent links objects', () => {
    const a = createEmptyParsedData();
    const b = createEmptyParsedData();
    a.links.github = 'https://github.com/test';
    expect(b.links.github).toBe('');
  });
});

// ─── hasParsedResumeData ──────────────────────────────────────────────────────

describe('hasParsedResumeData', () => {
  it('returns false for fully empty data', () => {
    expect(hasParsedResumeData(createEmptyParsedData())).toBe(false);
  });

  it('returns true when bio is set', () => {
    const d = createEmptyParsedData();
    d.bio = 'Hello';
    expect(hasParsedResumeData(d)).toBe(true);
  });

  it('returns true when location is set', () => {
    const d = createEmptyParsedData();
    d.location = 'Toronto';
    expect(hasParsedResumeData(d)).toBe(true);
  });

  it('returns true when any link is set', () => {
    const d = createEmptyParsedData();
    d.links.github = 'https://github.com/user';
    expect(hasParsedResumeData(d)).toBe(true);
  });

  it('returns true when skills are present', () => {
    const d = createEmptyParsedData();
    d.skills = ['React'];
    expect(hasParsedResumeData(d)).toBe(true);
  });

  it('returns true when interests are present', () => {
    const d = createEmptyParsedData();
    d.interests = ['AI'];
    expect(hasParsedResumeData(d)).toBe(true);
  });

  it('returns true when education is present', () => {
    const d = createEmptyParsedData();
    d.education = [{ id: '1', school: 'MIT', degree: 'BSc', year: '2024' }];
    expect(hasParsedResumeData(d)).toBe(true);
  });

  it('returns true when experience is present', () => {
    const d = createEmptyParsedData();
    d.experience = [{ id: '1', company: 'Acme', position: 'Dev', duration: '1yr', description: '' }];
    expect(hasParsedResumeData(d)).toBe(true);
  });

  it('returns true when personal_projects is present', () => {
    const d = createEmptyParsedData();
    d.personal_projects = [{ id: '1', name: 'App', description: '', link: '' }];
    expect(hasParsedResumeData(d)).toBe(true);
  });
});

// ─── normalizeParsedResumePayload ─────────────────────────────────────────────

describe('normalizeParsedResumePayload', () => {
  // --- null / undefined / empty input ---

  it('returns empty ParsedData for null input', () => {
    const result = normalizeParsedResumePayload(null);
    expect(result).toEqual(createEmptyParsedData());
  });

  it('returns empty ParsedData for undefined input', () => {
    const result = normalizeParsedResumePayload(undefined);
    expect(result).toEqual(createEmptyParsedData());
  });

  it('returns empty ParsedData for empty object', () => {
    const result = normalizeParsedResumePayload({});
    expect(result).toEqual(createEmptyParsedData());
  });

  // --- bio / location ---

  it('trims whitespace from bio and location', () => {
    const result = normalizeParsedResumePayload({ bio: '  hello  ', location: '  Toronto  ' });
    expect(result.bio).toBe('hello');
    expect(result.location).toBe('Toronto');
  });

  it('returns empty string for non-string bio', () => {
    expect(normalizeParsedResumePayload({ bio: 42 }).bio).toBe('');
    expect(normalizeParsedResumePayload({ bio: null }).bio).toBe('');
    expect(normalizeParsedResumePayload({ bio: true }).bio).toBe('');
  });

  // --- links / normalizeLink ---

  it('preserves URLs that already have a protocol', () => {
    const result = normalizeParsedResumePayload({
      links: { github: 'https://github.com/user', linkedin: 'http://linkedin.com/in/user' },
    });
    expect(result.links.github).toBe('https://github.com/user');
    expect(result.links.linkedin).toBe('http://linkedin.com/in/user');
  });

  it('prepends https:// to www. links', () => {
    const result = normalizeParsedResumePayload({ links: { portfolio: 'www.example.com' } });
    expect(result.links.portfolio).toBe('https://www.example.com');
  });

  it('prepends https:// to bare github.com/ links', () => {
    const result = normalizeParsedResumePayload({ links: { github: 'github.com/user' } });
    expect(result.links.github).toBe('https://github.com/user');
  });

  it('prepends https:// to bare linkedin.com/ links', () => {
    const result = normalizeParsedResumePayload({ links: { linkedin: 'linkedin.com/in/user' } });
    expect(result.links.linkedin).toBe('https://linkedin.com/in/user');
  });

  it('prepends https:// to bare twitter.com/ links', () => {
    const result = normalizeParsedResumePayload({ links: { twitter: 'twitter.com/user' } });
    expect(result.links.twitter).toBe('https://twitter.com/user');
  });

  it('prepends https:// to bare x.com/ links', () => {
    const result = normalizeParsedResumePayload({ links: { twitter: 'x.com/user' } });
    expect(result.links.twitter).toBe('https://x.com/user');
  });

  it('prepends https:// to bare instagram.com/ links', () => {
    const result = normalizeParsedResumePayload({ links: { instagram: 'instagram.com/user' } });
    expect(result.links.instagram).toBe('https://instagram.com/user');
  });

  it('prepends https:// to domain-like strings without protocol', () => {
    const result = normalizeParsedResumePayload({ links: { portfolio: 'mysite.io' } });
    expect(result.links.portfolio).toBe('https://mysite.io');
  });

  it('does NOT prepend https:// to email-like strings', () => {
    const result = normalizeParsedResumePayload({ links: { other: 'user@example.com' } });
    expect(result.links.other).toBe('user@example.com');
  });

  it('does NOT prepend https:// to plain text with a space', () => {
    const result = normalizeParsedResumePayload({ links: { other: 'not a link' } });
    expect(result.links.other).toBe('not a link');
  });

  it('returns empty string for null/missing links', () => {
    const result = normalizeParsedResumePayload({ links: {} });
    expect(result.links.github).toBe('');
    expect(result.links.linkedin).toBe('');
  });

  it('returns empty string when links object is missing entirely', () => {
    const result = normalizeParsedResumePayload({});
    Object.values(result.links).forEach((v) => expect(v).toBe(''));
  });

  it('trims trailing slash from link with protocol', () => {
    // normalizeLink does not strip trailing slashes — normalizeUrl does (for URL env vars).
    // A link like "https://github.com/user/" should remain as-is since normalizeLink
    // short-circuits when it already has a protocol.
    const result = normalizeParsedResumePayload({ links: { github: 'https://github.com/user/' } });
    expect(result.links.github).toBe('https://github.com/user/');
  });

  // --- skills / dedupeStrings ---

  it('returns unique skills (case-insensitive dedup)', () => {
    const result = normalizeParsedResumePayload({ skills: ['React', 'react', 'REACT', 'TypeScript'] });
    expect(result.skills).toEqual(['React', 'TypeScript']);
  });

  it('filters out non-string and empty skill entries', () => {
    const result = normalizeParsedResumePayload({ skills: ['React', null, 42, '', '  ', 'Go'] });
    expect(result.skills).toEqual(['React', 'Go']);
  });

  it('trims skill strings', () => {
    const result = normalizeParsedResumePayload({ skills: ['  React  ', ' Go '] });
    expect(result.skills).toEqual(['React', 'Go']);
  });

  it('caps skills at 30 entries', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Skill${i}`);
    const result = normalizeParsedResumePayload({ skills: many });
    expect(result.skills).toHaveLength(30);
  });

  it('returns [] when skills is not an array', () => {
    expect(normalizeParsedResumePayload({ skills: 'React' }).skills).toEqual([]);
    expect(normalizeParsedResumePayload({ skills: null }).skills).toEqual([]);
  });

  // --- interests / dedupeStrings ---

  it('deduplicates interests case-insensitively', () => {
    const result = normalizeParsedResumePayload({ interests: ['AI', 'ai', 'ML'] });
    expect(result.interests).toEqual(['AI', 'ML']);
  });

  it('caps interests at 20 entries', () => {
    const many = Array.from({ length: 25 }, (_, i) => `Interest${i}`);
    const result = normalizeParsedResumePayload({ interests: many });
    expect(result.interests).toHaveLength(20);
  });

  // --- education ---

  it('maps education entries correctly', () => {
    const result = normalizeParsedResumePayload({
      education: [{ id: 'edu-1', school: 'MIT', degree: 'BSc CS', year: '2024' }],
    });
    expect(result.education).toHaveLength(1);
    expect(result.education[0]).toMatchObject({ id: 'edu-1', school: 'MIT', degree: 'BSc CS', year: '2024' });
  });

  it('generates an id when education entry has no id', () => {
    const result = normalizeParsedResumePayload({
      education: [{ school: 'MIT', degree: 'BSc', year: '2023' }],
    });
    expect(result.education[0].id).toMatch(/^edu-/);
  });

  it('filters out education entries with no school, degree, or year', () => {
    const result = normalizeParsedResumePayload({
      education: [
        { school: '', degree: '', year: '' },
        { school: 'MIT', degree: '', year: '' },
      ],
    });
    expect(result.education).toHaveLength(1);
    expect(result.education[0].school).toBe('MIT');
  });

  it('trims whitespace from education fields', () => {
    const result = normalizeParsedResumePayload({
      education: [{ school: '  MIT  ', degree: '  BSc  ', year: '  2024  ' }],
    });
    expect(result.education[0]).toMatchObject({ school: 'MIT', degree: 'BSc', year: '2024' });
  });

  it('returns [] when education is not an array', () => {
    expect(normalizeParsedResumePayload({ education: null }).education).toEqual([]);
    expect(normalizeParsedResumePayload({ education: 'MIT' }).education).toEqual([]);
  });

  it('handles education entries with only whitespace fields as filtered', () => {
    const result = normalizeParsedResumePayload({
      education: [{ school: '   ', degree: '   ', year: '   ' }],
    });
    expect(result.education).toHaveLength(0);
  });

  // --- experience ---

  it('maps experience entries correctly', () => {
    const result = normalizeParsedResumePayload({
      experience: [{ id: 'exp-1', company: 'Acme', position: 'Engineer', duration: '2yr', description: 'Built stuff' }],
    });
    expect(result.experience[0]).toMatchObject({
      id: 'exp-1',
      company: 'Acme',
      position: 'Engineer',
      duration: '2yr',
      description: 'Built stuff',
    });
  });

  it('generates an id when experience entry has no id', () => {
    const result = normalizeParsedResumePayload({
      experience: [{ company: 'Acme', position: 'Dev', duration: '1yr', description: '' }],
    });
    expect(result.experience[0].id).toMatch(/^exp-/);
  });

  it('filters out experience entries with no meaningful fields', () => {
    const result = normalizeParsedResumePayload({
      experience: [
        { company: '', position: '', duration: '', description: '' },
        { company: 'Acme', position: '', duration: '', description: '' },
      ],
    });
    expect(result.experience).toHaveLength(1);
  });

  it('keeps experience entries that have only a description', () => {
    const result = normalizeParsedResumePayload({
      experience: [{ company: '', position: '', duration: '', description: 'Did things' }],
    });
    expect(result.experience).toHaveLength(1);
  });

  it('returns [] when experience is not an array', () => {
    expect(normalizeParsedResumePayload({ experience: null }).experience).toEqual([]);
  });

  // --- personal_projects ---

  it('maps personal_projects entries correctly', () => {
    const result = normalizeParsedResumePayload({
      personal_projects: [{ id: 'proj-1', name: 'App', description: 'Cool app', link: 'https://app.com' }],
    });
    expect(result.personal_projects[0]).toMatchObject({
      id: 'proj-1',
      name: 'App',
      description: 'Cool app',
      link: 'https://app.com',
    });
  });

  it('generates an id when project entry has no id', () => {
    const result = normalizeParsedResumePayload({
      personal_projects: [{ name: 'App', description: '', link: '' }],
    });
    expect(result.personal_projects[0].id).toMatch(/^proj-/);
  });

  it('normalizes project link', () => {
    const result = normalizeParsedResumePayload({
      personal_projects: [{ name: 'App', description: '', link: 'github.com/user/app' }],
    });
    expect(result.personal_projects[0].link).toBe('https://github.com/user/app');
  });

  it('filters out project entries with no name, description, or link', () => {
    const result = normalizeParsedResumePayload({
      personal_projects: [
        { name: '', description: '', link: '' },
        { name: 'App', description: '', link: '' },
      ],
    });
    expect(result.personal_projects).toHaveLength(1);
  });

  it('returns [] when personal_projects is not an array', () => {
    expect(normalizeParsedResumePayload({ personal_projects: null }).personal_projects).toEqual([]);
  });

  // --- full realistic payload ---

  it('handles a realistic full resume payload', () => {
    const payload = {
      bio: 'Software engineer',
      location: 'Toronto, ON',
      links: {
        github: 'github.com/jdoe',
        linkedin: 'linkedin.com/in/jdoe',
        twitter: '',
        instagram: null,
        portfolio: 'www.jdoe.dev',
        other: '',
      },
      skills: ['TypeScript', 'React', 'Node.js'],
      interests: ['Open Source', 'Machine Learning'],
      education: [{ school: 'University of Toronto', degree: 'BSc Computer Science', year: '2023' }],
      experience: [{ company: 'Acme Corp', position: 'Software Engineer', duration: '2021–2023', description: 'Backend dev' }],
      personal_projects: [{ name: 'MyApp', description: 'A cool app', link: 'myapp.io' }],
    };
    const result = normalizeParsedResumePayload(payload);
    expect(result.bio).toBe('Software engineer');
    expect(result.location).toBe('Toronto, ON');
    expect(result.links.github).toBe('https://github.com/jdoe');
    expect(result.links.linkedin).toBe('https://linkedin.com/in/jdoe');
    expect(result.links.twitter).toBe('');
    expect(result.links.instagram).toBe('');
    expect(result.links.portfolio).toBe('https://www.jdoe.dev');
    expect(result.skills).toEqual(['TypeScript', 'React', 'Node.js']);
    expect(result.interests).toEqual(['Open Source', 'Machine Learning']);
    expect(result.education[0].school).toBe('University of Toronto');
    expect(result.experience[0].company).toBe('Acme Corp');
    expect(result.personal_projects[0].link).toBe('https://myapp.io');
  });

  // --- multiple entries with mixed valid/invalid ---

  it('generates unique ids for multiple entries at the same index across types', () => {
    // IDs are built with Date.now() so they won't collide across types
    const result = normalizeParsedResumePayload({
      education: [{ school: 'A' }, { school: 'B' }],
      experience: [{ company: 'X' }, { company: 'Y' }],
      personal_projects: [{ name: 'P' }, { name: 'Q' }],
    });
    const allIds = [
      ...result.education.map((e) => e.id),
      ...result.experience.map((e) => e.id),
      ...result.personal_projects.map((e) => e.id),
    ];
    // Prefixes should be correct
    expect(result.education[0].id).toMatch(/^edu-/);
    expect(result.experience[0].id).toMatch(/^exp-/);
    expect(result.personal_projects[0].id).toMatch(/^proj-/);
    // All generated ids should be distinct
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

// ─── getResumeParserUrl ───────────────────────────────────────────────────────
//
// getResumeParserUrl reads process.env at call time and reads Constants at
// module-import time. We control Constants via the top-level jest.mock and
// mutate its expoConfig in each test. Env vars are set/deleted per test.

describe('getResumeParserUrl', () => {
  // Save originals
  const savedEdge = process.env.EXPO_PUBLIC_PARSER_EDGE_URL;
  const savedDirect = process.env.EXPO_PUBLIC_PARSER_URL;
  const savedSupabase = process.env.EXPO_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_PARSER_EDGE_URL;
    delete process.env.EXPO_PUBLIC_PARSER_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    // Reset Constants expoConfig to have no parserUrl
    getMockedConstants().expoConfig = { extra: {} };
  });

  afterAll(() => {
    // Restore originals
    if (savedEdge !== undefined) process.env.EXPO_PUBLIC_PARSER_EDGE_URL = savedEdge;
    if (savedDirect !== undefined) process.env.EXPO_PUBLIC_PARSER_URL = savedDirect;
    if (savedSupabase !== undefined) process.env.EXPO_PUBLIC_SUPABASE_URL = savedSupabase;
  });

  it('returns DEFAULT_RESUME_PARSER_URL when no env vars or config are set', () => {
    expect(getResumeParserUrl()).toBe(DEFAULT_RESUME_PARSER_URL);
  });

  it('prefers EXPO_PUBLIC_PARSER_EDGE_URL over all others', () => {
    process.env.EXPO_PUBLIC_PARSER_EDGE_URL = 'https://edge.example.com/';
    process.env.EXPO_PUBLIC_PARSER_URL = 'https://direct.example.com';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://supabase.example.com';
    getMockedConstants().expoConfig = { extra: { parserUrl: 'https://config.example.com' } };
    // normalizeUrl strips trailing slash
    expect(getResumeParserUrl()).toBe('https://edge.example.com');
  });

  it('falls back to expoConfig.extra.parserUrl when edge URL is absent', () => {
    getMockedConstants().expoConfig = { extra: { parserUrl: 'https://config.example.com/' } };
    expect(getResumeParserUrl()).toBe('https://config.example.com');
  });

  it('falls back to EXPO_PUBLIC_PARSER_URL when edge and config are absent', () => {
    process.env.EXPO_PUBLIC_PARSER_URL = 'https://direct.example.com/';
    expect(getResumeParserUrl()).toBe('https://direct.example.com');
  });

  it('constructs URL from EXPO_PUBLIC_SUPABASE_URL as last resort', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://supabase.example.com/';
    expect(getResumeParserUrl()).toBe('https://supabase.example.com/functions/v1/resume-parser');
  });

  it('strips trailing slash from EXPO_PUBLIC_PARSER_EDGE_URL', () => {
    process.env.EXPO_PUBLIC_PARSER_EDGE_URL = 'https://edge.example.com/path/';
    expect(getResumeParserUrl()).toBe('https://edge.example.com/path');
  });

  it('returns DEFAULT_RESUME_PARSER_URL for empty string env vars', () => {
    process.env.EXPO_PUBLIC_PARSER_EDGE_URL = '';
    process.env.EXPO_PUBLIC_PARSER_URL = '';
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
    expect(getResumeParserUrl()).toBe(DEFAULT_RESUME_PARSER_URL);
  });
});
