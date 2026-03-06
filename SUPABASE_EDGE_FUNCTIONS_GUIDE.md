# Supabase Edge Functions Architecture Guide
## For Backend Implementation (Tony's Reference)

---

## Overview

Currently, the **Resume Parser** and **Matching Algorithm** are running locally (localhost:8000) as Python services. To make them accessible to our Expo mobile app, we need to deploy them as **Supabase Edge Functions**.

### What Are Supabase Edge Functions?

Supabase Edge Functions are serverless functions that run on Deno (TypeScript/JavaScript runtime) at the edge, close to your users. They're similar to AWS Lambda or Vercel Edge Functions.

**Key Benefits:**
- **Serverless**: No server management needed
- **Scalable**: Auto-scales with demand
- **Integrated**: Direct access to Supabase database and auth
- **Fast**: Run globally at the edge (low latency)
- **Secure**: Built-in authentication with Supabase Auth

---

## Architecture Overview

### Current Architecture (Local)
```
┌─────────────┐
│  Expo App   │
│  (Mobile)   │
└──────┬──────┘
       │ ❌ Can't reach localhost
       ▼
┌─────────────────┐
│ localhost:8000  │
│ Python FastAPI  │
│ - Resume Parser │
│ - Matching Algo │
└─────────────────┘
```

### Target Architecture (Supabase Edge Functions)
```
┌─────────────┐
│  Expo App   │
│  (Mobile)   │
└──────┬──────┘
       │ ✅ HTTPS calls
       ▼
┌──────────────────────────────┐
│   Supabase Platform          │
│  ┌────────────────────────┐  │
│  │  Edge Function 1:      │  │
│  │  parse-resume          │  │
│  │  (TypeScript/Deno)     │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  Edge Function 2:      │  │
│  │  match-projects        │  │
│  │  (TypeScript/Deno)     │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │  Edge Function 3:      │  │
│  │  match-candidates      │  │
│  │  (TypeScript/Deno)     │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │  PostgreSQL Database   │  │
│  │  - profiles            │  │
│  │  - projects            │  │
│  │  - matches             │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │  Storage Buckets       │  │
│  │  - resume-uploads      │  │
│  │  - profile-images      │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

---

## Edge Functions We Need

### 1. `parse-resume` Function

**Purpose**: Accept resume upload, extract text, parse into structured profile data

**Input:**
```typescript
{
  "resume_url": "https://supabase.storage/resume.pdf"
  // OR
  "resume_file": "base64_encoded_pdf"
}
```

**Output:**
```typescript
{
  "success": true,
  "data": {
    "text": "Full resume text...",
    "sections": {
      "education": "...",
      "experience": "...",
      "projects": "...",
      "skills": "..."
    },
    "skills": ["Python", "React", "PostgreSQL"],
    "parsing_method": "digital" // or "ocr"
  }
}
```

**Implementation Approach:**
Since the current parser is in Python, we have two options:

**Option A: Rewrite in TypeScript/Deno**
- Use Deno libraries like `pdf-parse` or `pdfjs-dist`
- Implement OCR with `tesseract.js` or external API (Google Vision)
- Pro: Native Supabase integration
- Con: Significant rewrite effort

**Option B: Hybrid - External Service + Edge Function Wrapper**
- Deploy Python parser to Railway/Render/Fly.io
- Edge function calls external API
- Pro: Keep existing Python code
- Con: Extra dependency, potential latency

**Recommended: Option A** (Long-term maintainability)

---

### 2. `match-projects` Function

**Purpose**: Find best project matches for a user (Person-to-Project)

**Input:**
```typescript
{
  "user_id": "uuid",
  "limit": 20,  // optional, default 20
  "weights": {  // optional custom weights
    "semantic": 0.35,
    "must_have_skills": 0.40,
    "nice_to_have_skills": 0.15,
    "interests": 0.10
  }
}
```

**Process Flow:**
1. Fetch user profile from `profiles` table
2. Fetch all active projects from `projects` table
3. Filter out projects user already interacted with (`tb_project_likes`)
4. Run matching algorithm on remaining projects
5. Return top N ranked projects

**Output:**
```typescript
{
  "matches": [
    {
      "project_id": "123",
      "project_title": "AI Chatbot Startup",
      "project_description": "...",
      "owner_id": "uuid",
      "total_score": 0.8523,
      "breakdown": {
        "semantic_similarity": 0.78,
        "must_have_skills": 0.83,
        "nice_to_have_skills": 0.50,
        "interest_alignment": 1.0
      },
      "explanation": {
        "matched_must_have_skills": ["Python", "React"],
        "missing_must_have_skills": ["PostgreSQL"],
        "matched_interests": ["AI"]
      }
    }
    // ... more matches
  ],
  "count": 15
}
```

**Key Implementation Details:**

**Semantic Similarity:**
- Use `@supabase/ai` or external embedding API (OpenAI, Cohere)
- Pre-compute embeddings and store in database (new column: `embedding vector`)
- Use pgvector extension for fast similarity search

```typescript
// Example using Supabase AI
import { Supabase } from '@supabase/supabase-js'

const embedUserProfile = async (profile: Profile) => {
  const text = `${profile.bio} ${profile.skills.join(' ')} ${profile.interests.join(' ')}`
  const embedding = await supabase.functions.invoke('generate-embedding', {
    body: { text }
  })
  return embedding
}
```

**Skill Matching:**
```typescript
const calculateSkillMatch = (
  userSkills: string[],
  requiredSkills: string[]
): number => {
  const normalizedUser = userSkills.map(s => s.toLowerCase())
  const normalizedRequired = requiredSkills.map(s => s.toLowerCase())
  
  const matched = normalizedRequired.filter(skill =>
    normalizedUser.includes(skill)
  )
  
  if (normalizedRequired.length === 0) return 1.0
  return matched.length / normalizedRequired.length
}
```

---

### 3. `match-candidates` Function

**Purpose**: Find best candidate matches for a project (Project-to-Person)

**Input:**
```typescript
{
  "project_id": "123",
  "limit": 20,
  "weights": {  // Adjusted weights for project perspective
    "semantic": 0.30,
    "must_have_skills": 0.50,
    "nice_to_have_skills": 0.15,
    "interests": 0.05
  }
}
```

**Process Flow:**
1. Fetch project details from `projects` table
2. Fetch all visible user profiles from `profiles` table
3. Filter out users already matched/rejected (`tb_candidate_likes`, `tb_matches`)
4. Run matching algorithm (inverse of person-to-project)
5. Return top N ranked candidates

**Output:**
```typescript
{
  "candidates": [
    {
      "user_id": "uuid",
      "name": "John Doe",
      "bio": "...",
      "skills": ["Python", "React", "PostgreSQL"],
      "total_score": 0.9012,
      "breakdown": { /* same structure */ },
      "explanation": { /* same structure */ }
    }
    // ... more candidates
  ],
  "count": 18
}
```

---

## Database Schema Additions

### New Table: `embeddings`
Store pre-computed embeddings for fast matching

```sql
CREATE TABLE embeddings (
  id bigserial PRIMARY KEY,
  entity_type text NOT NULL,  -- 'profile' | 'project'
  entity_id bigint NOT NULL,  -- profile.id or project.id
  embedding vector(384),      -- Sentence transformer dimension
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Index for fast similarity search
CREATE INDEX embeddings_vector_idx ON embeddings 
USING ivfflat (embedding vector_cosine_ops);
```

### Update Existing Tables

**profiles table:**
```sql
-- Add embedding_id reference (optional, can query embeddings table)
ALTER TABLE profiles ADD COLUMN embedding_id bigint REFERENCES embeddings(id);

-- Add index for matching queries
CREATE INDEX profiles_visible_idx ON profiles(visible) WHERE visible = true;
```

**projects table:**
```sql
-- Add embedding_id reference
ALTER TABLE projects ADD COLUMN embedding_id bigint REFERENCES embeddings(id);

-- Add index for active projects
CREATE INDEX projects_active_idx ON projects(is_active) WHERE is_active = true;
```

---

## Edge Function Development Workflow

### 1. Setup Supabase CLI

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Login
supabase login

# Link to your project
cd /Users/nicholaspoulidis/Code/Capstone2025
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Create Edge Functions

```bash
# Create function scaffolds
supabase functions new parse-resume
supabase functions new match-projects
supabase functions new match-candidates
```

This creates:
```
supabase/
└── functions/
    ├── parse-resume/
    │   └── index.ts
    ├── match-projects/
    │   └── index.ts
    └── match-candidates/
        └── index.ts
```

### 3. Basic Edge Function Template

```typescript
// supabase/functions/match-projects/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase client with user's auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get request body
    const { user_id, limit = 20, weights } = await req.json()

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user_id)
      .single()

    if (profileError) throw profileError

    // Fetch active projects
    const { data: projects, error: projectsError } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('is_active', true)

    if (projectsError) throw projectsError

    // Run matching algorithm (implement your logic here)
    const rankedProjects = await rankProjects(profile, projects, weights)

    return new Response(
      JSON.stringify({ matches: rankedProjects.slice(0, limit) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
```

### 4. Local Testing

```bash
# Start local Supabase (includes Edge Functions runtime)
supabase start

# Test function locally
supabase functions serve match-projects --env-file .env.local

# Call from another terminal
curl -i --location --request POST 'http://localhost:54321/functions/v1/match-projects' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"user_id": "test-uuid", "limit": 10}'
```

### 5. Deploy to Production

```bash
# Deploy all functions
supabase functions deploy

# Or deploy specific function
supabase functions deploy match-projects

# Set secrets (if needed)
supabase secrets set OPENAI_API_KEY=your-key
```

---

## Calling Edge Functions from Expo App

### Setup in Expo

```typescript
// lib/supabase.ts (already exists)
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
)
```

### Example: Call Match Projects Function

```typescript
// lib/matching-api.ts (update existing file)

export async function getMatchedProjects(
  userId: string,
  limit: number = 20
): Promise<MatchedProject[]> {
  try {
    const { data, error } = await supabase.functions.invoke('match-projects', {
      body: {
        user_id: userId,
        limit,
      },
    })

    if (error) throw error
    return data.matches
  } catch (error) {
    console.error('Error fetching matched projects:', error)
    throw error
  }
}

export async function getMatchedCandidates(
  projectId: string,
  limit: number = 20
): Promise<MatchedCandidate[]> {
  try {
    const { data, error } = await supabase.functions.invoke('match-candidates', {
      body: {
        project_id: projectId,
        limit,
      },
    })

    if (error) throw error
    return data.candidates
  } catch (error) {
    console.error('Error fetching matched candidates:', error)
    throw error
  }
}
```

### Example: Call Parse Resume Function

```typescript
// lib/resume-parser.ts (new file)

export async function parseResume(
  resumeFile: File | Blob
): Promise<ParsedResume> {
  try {
    // Option 1: Upload to Storage first, then parse
    const fileName = `${Date.now()}_resume.pdf`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('resume-uploads')
      .upload(fileName, resumeFile)

    if (uploadError) throw uploadError

    const { data: publicURL } = supabase.storage
      .from('resume-uploads')
      .getPublicUrl(fileName)

    // Call parse function with URL
    const { data, error } = await supabase.functions.invoke('parse-resume', {
      body: {
        resume_url: publicURL.publicUrl,
      },
    })

    if (error) throw error
    return data

  } catch (error) {
    console.error('Error parsing resume:', error)
    throw error
  }
}
```

---

## Performance Optimization Strategies

### 1. Caching Embeddings
Instead of computing embeddings on every request, pre-compute and store them:

```typescript
// Trigger function when profile/project is created/updated
// supabase/functions/update-embedding/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { entity_type, entity_id, text } = await req.json()
  
  // Generate embedding (using OpenAI, Cohere, or local model)
  const embedding = await generateEmbedding(text)
  
  // Upsert to embeddings table
  await supabaseClient
    .from('embeddings')
    .upsert({
      entity_type,
      entity_id,
      embedding,
      updated_at: new Date().toISOString(),
    })
  
  return new Response(JSON.stringify({ success: true }))
})
```

**Database Trigger (Auto-update embeddings):**
```sql
CREATE OR REPLACE FUNCTION update_profile_embedding()
RETURNS TRIGGER AS $$
BEGIN
  -- Call edge function to regenerate embedding
  PERFORM net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/update-embedding',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb,
    body := json_build_object(
      'entity_type', 'profile',
      'entity_id', NEW.id,
      'text', concat(NEW.bio, ' ', array_to_string(NEW.skills, ' '))
    )::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profile_embedding_trigger
AFTER INSERT OR UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION update_profile_embedding();
```

### 2. Pagination & Lazy Loading
Don't fetch all projects/users at once:

```typescript
// Fetch in batches
const { data: projects } = await supabaseClient
  .from('projects')
  .select('*')
  .eq('is_active', true)
  .range(0, 99)  // First 100 only
```

### 3. Use Database Views
Pre-join common queries:

```sql
CREATE VIEW active_projects_with_owner AS
SELECT 
  p.*,
  pr.name as owner_name,
  pr.bio as owner_bio
FROM projects p
JOIN profiles pr ON p.owner_id = pr.id
WHERE p.is_active = true;
```

---

## Security Considerations

### Row Level Security (RLS)
Your database already has RLS, ensure it's compatible with Edge Functions:

```sql
-- Profiles: Users can read all visible profiles, edit only their own
CREATE POLICY "Public profiles are viewable by everyone"
ON profiles FOR SELECT
USING (visible = true);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- Projects: All active projects viewable, only owners can edit
CREATE POLICY "Active projects are viewable by everyone"
ON projects FOR SELECT
USING (is_active = true);

CREATE POLICY "Users can update own projects"
ON projects FOR UPDATE
USING (auth.uid() = owner_id);
```

### Authentication in Edge Functions
Edge functions automatically receive user auth from request headers:

```typescript
// Verify user is authenticated
const authHeader = req.headers.get('Authorization')
if (!authHeader) {
  return new Response('Unauthorized', { status: 401 })
}

// User's JWT is automatically validated by Supabase
```

---

## Migration Checklist for Tony

### Phase 1: Database Preparation
- [ ] Install pgvector extension: `CREATE EXTENSION vector;`
- [ ] Create `embeddings` table
- [ ] Add embedding columns to `profiles` and `projects`
- [ ] Create indexes for performance
- [ ] Test RLS policies with Edge Functions access patterns

### Phase 2: Edge Function Development
- [ ] Set up Supabase CLI locally
- [ ] Create `parse-resume` function scaffold
- [ ] Create `match-projects` function scaffold
- [ ] Create `match-candidates` function scaffold
- [ ] Implement semantic similarity logic (choose embedding provider)
- [ ] Implement skill matching logic
- [ ] Test locally with `supabase functions serve`

### Phase 3: Resume Parser Migration
- [ ] Decide: Rewrite in TypeScript or keep Python external?
- [ ] If TypeScript: Research Deno PDF parsing libraries
- [ ] If external: Deploy Python service to Railway/Render
- [ ] Implement OCR fallback (Tesseract.js or API)
- [ ] Test with various resume formats

### Phase 4: Deployment & Testing
- [ ] Deploy Edge Functions to production
- [ ] Update Expo app to call Edge Functions instead of localhost
- [ ] Test end-to-end: Sign up → Upload resume → Browse matches
- [ ] Monitor function performance (Supabase dashboard)
- [ ] Set up error logging (Sentry or Supabase logs)

### Phase 5: Optimization
- [ ] Implement embedding caching
- [ ] Add database triggers for auto-updating embeddings
- [ ] Implement pagination for large result sets
- [ ] Add rate limiting if needed
- [ ] Document API for frontend team

---

## Common Pitfalls & Solutions

### Pitfall 1: Cold Starts
**Problem**: First request to Edge Function is slow (2-3s)
**Solution**: 
- Use lightweight dependencies
- Keep functions warm with scheduled pings
- Pre-compute heavy operations (embeddings)

### Pitfall 2: Timeout Limits
**Problem**: Edge Functions have 120s timeout
**Solution**:
- For resume parsing: Process asynchronously, return job ID
- For matching: Limit candidate pool, use indexed queries

### Pitfall 3: CORS Errors
**Problem**: Mobile app can't call Edge Functions
**Solution**: 
- Always include CORS headers in responses
- Handle OPTIONS preflight requests

### Pitfall 4: Secret Management
**Problem**: API keys exposed in code
**Solution**:
- Use `supabase secrets set KEY=value`
- Access via `Deno.env.get('KEY')` in functions

---

## Additional Resources

- **Supabase Edge Functions Docs**: https://supabase.com/docs/guides/functions
- **Deno Documentation**: https://deno.land/manual
- **pgvector GitHub**: https://github.com/pgvector/pgvector
- **Sentence Transformers**: https://www.sbert.net/
- **Our Matching Algorithm**: `/matching_algorithm/matching.py`

---

## Questions to Discuss with Team

1. **Embedding Provider**: Use OpenAI, Cohere, or self-hosted model?
2. **Resume Parser**: Rewrite in TypeScript or deploy Python externally?
3. **Caching Strategy**: Pre-compute all embeddings or generate on-demand?
4. **Matching Frequency**: Real-time or periodic batch updates?
5. **Error Handling**: How to gracefully fail when parsing/matching fails?

---

*This guide should give Tony everything he needs to implement the Supabase Edge Functions architecture. The key is migrating from localhost Python services to cloud-based TypeScript/Deno functions that integrate directly with Supabase.*
