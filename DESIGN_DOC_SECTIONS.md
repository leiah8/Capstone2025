# Design Doc - Nicholas's Sections

## Project Tab Component

### Overview
The Project Tab is the primary interface for project owners to create, manage, and edit their project listings. This component enables users to define what they're building and what kind of collaborators they need.

### Key Features

#### 1. Project Creation
Users can create new projects with the following fields:
- **Title**: Concise project name (required)
- **Description**: Detailed explanation of the project goals, scope, and vision (required)
- **Skills Needed**: Array of technical/soft skills required from collaborators
  - Must-have skills (critical for project success)
  - Nice-to-have skills (beneficial but not required)
- **Tags**: Categorization for project discovery (e.g., "AI", "startup", "mobile app")
- **Intention**: Purpose of the project (e.g., "resume building", "school project", "startup", "learning")
- **Active Status**: Toggle to activate/deactivate project visibility

#### 2. Project Management Interface
- **View All Owned Projects**: List of all projects created by the user
- **Edit Projects**: Modify any project field post-creation
- **Toggle Active Status**: Pause/resume accepting applications without deleting
- **Delete Projects**: Remove projects permanently (with confirmation)

#### 3. Data Model
```typescript
interface Project {
  id: number;
  owner_id: string; // UUID reference to profile
  title: string;
  description: string;
  skills_needed: string[]; // e.g., ["Python", "React", "UI/UX"]
  tags: string[]; // e.g., ["AI", "startup", "mobile"]
  intention: string; // "resume" | "school" | "startup" | custom
  is_active: boolean;
  created_at: timestamp;
}
```

#### 4. User Flows

**Create Project Flow:**
1. User navigates to Projects tab
2. Clicks "Create New Project" button
3. Fills out form with title, description, skills, tags, intention
4. Submits → Project appears in "My Projects" list
5. Project becomes searchable/matchable by other users

**Edit Project Flow:**
1. User views their projects list
2. Selects project to edit
3. Modifies fields in edit form
4. Saves changes → Updates propagate to matching algorithm

**Toggle Active Status:**
1. User views project card
2. Toggles "Active" switch
3. Inactive projects don't appear in searches/matches

### Technical Implementation

**Frontend (React Native/Expo):**
- Form validation for required fields
- Multi-select for skills/tags
- Rich text editor for description
- Real-time preview of project card

**Backend (Supabase):**
- PostgreSQL table: `projects`
- Row Level Security: Users can only edit their own projects
- Triggers: Update `updated_at` timestamp on modifications
- Indexes: On `owner_id`, `is_active`, `tags` for efficient queries

### Validation & Error Handling
- Title: 5-100 characters
- Description: 50-2000 characters
- Skills: 1-20 skills per project
- Tags: 1-10 tags
- Duplicate title check for same owner
- Graceful error messages for network failures

---

## Matching Algorithm

### Normal Behaviour

The matching algorithm component is responsible for ranking potential matches between users and projects to facilitate high-quality collaboration connections. Under normal conditions, the algorithm operates bidirectionally: it can rank projects for a given user (Person-to-Project matching) or rank candidates for a given project (Project-to-Person matching). In both cases, the algorithm computes a weighted score based on four key components: semantic similarity, must-have skills match, nice-to-have skills match, and interest alignment. The weights are tunable but default to emphasizing must-have skills (40% for person-to-project, 50% for project-to-person) as the most critical factor. The algorithm returns a ranked list of matches sorted by total score in descending order, with each match including both the final score and a detailed breakdown explaining which skills matched, which skills are missing, and how interests aligned.

**Person-to-Project Matching:** This mode helps users discover projects they're qualified for and interested in. The algorithm fetches the user's profile (bio, skills, interests) and all active projects from the database. It then computes four component scores for each project. First, semantic similarity (35% weight) uses sentence transformers to measure the overall textual alignment between the user's profile and project description, capturing nuanced fit that structured fields might miss. Second, must-have skills match (40% weight) compares the user's skills against the project's required skills, calculating the intersection ratio. Third, nice-to-have skills (15% weight) provides bonus points for additional desirable skills. Fourth, interest alignment (10% weight) matches user interests against project tags to indicate cultural fit. The final score is a weighted sum of these components. Projects are sorted by this score, and the top N (default 20) are returned to the user's project browsing feed.

**Project-to-Person Matching:** This mode helps project owners find suitable candidates for their projects. The algorithm operates similarly but with adjusted weights that emphasize skills even more heavily. The must-have skills component increases to 50% weight since project owners prioritize technical competency. Semantic similarity reduces to 30%, nice-to-have skills remains at 15%, and interest alignment reduces to 5%. Additionally, the algorithm filters out users who have already been matched, users who declined or were rejected previously, and inactive profiles before scoring. This ensures project owners only see viable, available candidates. The algorithm then scores each remaining user against the project's requirements and returns the top-ranked candidates for the project owner's candidate browsing feed.

### API

The matching algorithm is exposed through two Supabase Edge Function endpoints hosted at `https://[PROJECT_REF].supabase.co/functions/v1/`. Both endpoints require authentication via the `Authorization` header containing the user's JWT token from Supabase Auth.

**POST /match-projects** - Ranks projects for a specific user (Person-to-Project)

Request body:
```json
{
  "user_id": "uuid",
  "limit": 20,
  "weights": {
    "semantic": 0.35,
    "must_have_skills": 0.40,
    "nice_to_have_skills": 0.15,
    "interests": 0.10
  }
}
```

The `user_id` field is required and references the user's profile. The `limit` field is optional (defaults to 20) and controls how many top matches to return. The `weights` object is optional and allows custom weight tuning; if omitted, default weights are used.

Response (200 OK):
```json
{
  "matches": [
    {
      "project_id": "123",
      "project_title": "AI Chatbot Startup",
      "project_description": "Building an AI-powered customer service bot...",
      "owner_id": "uuid",
      "total_score": 0.8523,
      "breakdown": {
        "semantic_similarity": 0.7834,
        "must_have_skills": 0.8333,
        "nice_to_have_skills": 0.5000,
        "interest_alignment": 1.0000
      },
      "explanation": {
        "matched_must_have_skills": ["Python", "React"],
        "missing_must_have_skills": ["PostgreSQL"],
        "matched_nice_to_have_skills": ["Docker"],
        "matched_interests": ["AI"]
      }
    }
  ],
  "count": 15
}
```

**POST /match-candidates** - Ranks candidates for a specific project (Project-to-Person)

Request body:
```json
{
  "project_id": "123",
  "limit": 20,
  "weights": {
    "semantic": 0.30,
    "must_have_skills": 0.50,
    "nice_to_have_skills": 0.15,
    "interests": 0.05
  }
}
```

The response structure mirrors the `/match-projects` endpoint but returns candidate profiles instead of projects. Each candidate includes `user_id`, `name`, `bio`, `skills`, and the same scoring breakdown structure.

### Implementation

The matching algorithm is implemented as a multi-stage pipeline deployed as Supabase Edge Functions written in TypeScript/Deno. The API layer handles authentication, request validation, and response formatting, then delegates to the core matching engine. The matching engine begins by fetching relevant data from the Supabase PostgreSQL database: user profiles from the `profiles` table and project listings from the `projects` table. For Person-to-Project matching, the engine also queries `tb_project_likes` to filter out projects the user has already interacted with. For Project-to-Person matching, it queries `tb_candidate_likes` and `tb_matches` to exclude users who have already been matched or rejected.

Once the data is loaded, the engine computes each of the four scoring components. **Semantic similarity** is calculated using pre-computed sentence embeddings stored in an `embeddings` table. When a profile or project is created or updated, a separate Edge Function generates a 384-dimensional embedding vector using a sentence transformer model (such as `all-MiniLM-L6-v2`) and stores it in the database. During matching, the engine retrieves these embeddings and computes the cosine similarity between the user's profile embedding and each project's embedding using the pgvector extension's similarity functions. This approach avoids expensive real-time embedding generation.

**Skill matching** is implemented using set intersection logic. The engine normalizes all skills to lowercase and removes whitespace for case-insensitive matching. For must-have skills, it calculates the ratio of matched skills to total required skills. For nice-to-have skills, it uses a similar calculation but applies a lower weight. **Interest alignment** matches user interests against project tags using the same intersection approach. Finally, the engine computes the weighted total score for each candidate match, sorts the results in descending order by score, and returns the top N results along with detailed explanations of which skills matched and which are missing.

The implementation uses efficient database queries with indexes on `profiles(visible)`, `projects(is_active)`, `embeddings(entity_type, entity_id)`, and a pgvector index on the embedding column for fast similarity search. For large user bases, the engine may limit the candidate pool to recently active users or implement pagination to maintain sub-second response times.

### Potential Undesired Behaviours

Several issues could arise from edge cases or unusual input data. Users with empty or minimal profiles (no bio, few skills, no interests) may receive poor match quality because the semantic similarity and interest alignment components will score near zero, leaving only skill matching as the primary signal. Similarly, projects with vague descriptions or no required skills may be difficult to match accurately. The algorithm handles the no-required-skills case by defaulting the must-have score to 1.0, but this may result in overly optimistic scores for underspecified projects.

Skill normalization helps with case sensitivity, but abbreviations and synonyms (e.g., "JS" vs "JavaScript", "ML" vs "Machine Learning") can cause false negatives where skills actually match but aren't recognized. A more sophisticated implementation could use a skill taxonomy or fuzzy matching to address this. Users with very long skill lists may also game the system by listing many tangentially related skills to boost their match scores, creating a bias toward quantity over quality. The algorithm could mitigate this by capping the skill list length or using skill confidence scores.

The semantic similarity component relies on pre-computed embeddings, which may become stale if profiles or projects are updated frequently without triggering re-embedding. Database triggers are in place to handle updates, but network failures or race conditions could lead to embeddings being out of sync with the actual text. Cold start problems can also occur for new users or projects with no interaction history, as the algorithm has no behavioral data to refine recommendations. Over time, incorporating user feedback (likes, matches, rejections) into the algorithm could improve personalization.

Performance degradation is possible when the number of active projects or users grows very large. Computing scores for thousands of matches in real-time may exceed the 120-second timeout limit of Supabase Edge Functions. The implementation addresses this by using indexed queries and pgvector's optimized similarity search, but extremely large datasets may require additional strategies such as pre-filtering candidates based on a coarse similarity threshold, implementing result pagination, or moving to a batch processing model where matches are pre-computed periodically and stored in a `match_cache` table. Lastly, bias in the training data of the sentence transformer model could lead to systematic biases in semantic similarity scores, favoring certain writing styles or terminology over others.

---

## Integration Points

### Mobile App (Expo/React Native)
```typescript
// Example API call from app
const getMatchedProjects = async (userId: string) => {
  const { data: userProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  const { data: activeProjects } = await supabase
    .from('projects')
    .select('*')
    .eq('is_active', true);
  
  // Call matching Edge Function
  const response = await supabase.functions.invoke('match-projects', {
    body: { user_profile: userProfile, projects: activeProjects }
  });
  
  return response.data.ranked_projects;
};
```

### Database Schema Dependencies
- **profiles**: Source of user skills/interests
- **projects**: Source of project requirements
- **tb_project_likes**: Track existing connections to filter duplicates
- **tb_matches**: Store successful matches for analytics

### Performance Optimization
- Cache sentence embeddings (pre-compute for all users/projects)
- Batch processing for multiple users
- Limit candidate pool to recently active users
- Use database indexes on frequently queried fields
