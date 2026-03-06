# Brief Section - Peer.io Design Document

## Executive Summary

Peer.io is a mobile application designed to connect students and young professionals with collaborative project opportunities. The platform addresses the challenge of finding skilled, motivated teammates for side projects, academic work, and startup ventures through an intelligent matching system that pairs users based on skills, interests, and project requirements.

## Problem Statement

Many students and young professionals struggle to find collaborators for projects outside of their immediate social circles. Traditional networking platforms like LinkedIn focus on professional employment, while social media lacks the structure needed for serious project collaboration. This gap results in:

- **Missed Opportunities**: Talented individuals unable to find projects that match their skills and interests
- **Inefficient Searching**: Manual browsing through countless profiles without quality filtering
- **Skills Mismatch**: Project owners receiving applications from underqualified or overqualified candidates
- **Limited Discovery**: Great projects going unnoticed due to lack of targeted exposure

## Solution Overview

Peer.io provides a **dual-sided matching platform** that serves both project creators and project seekers:

### For Project Creators
- Create detailed project listings with required skills, tags, and intentions
- Receive ranked candidate recommendations based on skill alignment
- Browse candidates tailored to specific project needs
- Manage multiple projects simultaneously
- Track matches and communicate with interested collaborators

### For Project Seekers
- Build comprehensive profiles augmented by resume parsing
- Discover projects ranked by personal fit and relevance
- Filter opportunities by skills, tags, and project type
- Showcase skills and interests to potential project owners
- Connect with like-minded collaborators

### Core Innovation: Intelligent Matching

Our **dual matching algorithm** provides bidirectional recommendations:

1. **Person-to-Project Matching**: Shows users the projects they're most qualified for and interested in
2. **Project-to-Person Matching**: Shows project owners the candidates best suited for their needs

The algorithm considers:
- Semantic similarity between profiles and project descriptions (35%)
- Must-have skills alignment (40%)
- Nice-to-have skills bonus (15%)
- Interest and tag matching (10%)

This ensures both parties find relevant matches, increasing the likelihood of successful collaborations.

## Target Users

### Primary Users
- **University Students** (Years 2-4): Looking for resume-building projects, capstone teammates, or startup co-founders
- **Recent Graduates** (0-3 years post-graduation): Building portfolios, exploring side projects, or launching startups
- **Career Changers**: Learning new skills and seeking practical project experience

### Use Cases
1. **Resume Building**: Find projects that demonstrate practical skills to employers
2. **Academic Projects**: Connect with teammates for capstone, thesis, or course projects
3. **Startup Formation**: Discover co-founders with complementary skills
4. **Skill Development**: Join projects to learn new technologies in real-world contexts
5. **Networking**: Build relationships with peers in similar fields or industries

## Key Features

### 1. Intelligent Resume Parsing
- Upload PDF resumes during account creation or profile editing
- Automatic extraction of skills, experience, education, and projects
- OCR fallback for scanned resumes
- Structured data population of user profiles

### 2. Dual Matching Algorithms
- **Person-to-Project**: Browse projects feed with relevance rankings
- **Project-to-Person**: Browse candidate feed filtered by project fit
- Explainable scoring with skill match breakdowns
- Tunable weights for personalized ranking

### 3. Project Management
- Create and edit multiple projects per user
- Define must-have vs. nice-to-have skills
- Tag projects with categories (AI, mobile, startup, etc.)
- Toggle active/inactive status without deletion
- Track project intention (resume, school, learning, startup)

### 4. Profile Customization
- Rich bio and interest fields
- Skill tagging system
- Link to external portfolios (GitHub, LinkedIn, personal site)
- Visibility toggle for privacy control

### 5. Matching & Messaging
- Mutual interest system (both parties must express interest)
- Match page showing all current connections
- Direct messaging after successful matches
- Conversation history stored in database

### 6. Smart Filtering & Search
- Filter projects by tags, skills, and intention
- Filter candidates by skills and availability
- Tag candidates with specific projects they'd fit

## Technical Architecture

### Frontend
- **Framework**: React Native (Expo)
- **Language**: TypeScript
- **UI Design**: Minimalist, mobile-first interface inspired by Hinge and Instagram
- **Color Palette**: Calm blues and greens with grayscale accents
- **Navigation**: Bottom tab bar for intuitive access to key features

### Backend
- **Platform**: Supabase (PostgreSQL database, Auth, Storage, Edge Functions)
- **Authentication**: Email/password via Supabase Auth
- **Database**: PostgreSQL with Row Level Security (RLS)
- **Storage**: Supabase Storage for resumes and profile images
- **Serverless Functions**: Supabase Edge Functions (Deno/TypeScript) for:
  - Resume parsing
  - Matching algorithm execution
  - Real-time recommendations

### Core Components
1. **Database Tables**:
   - `profiles`: User profile data (skills, interests, bio)
   - `projects`: Project listings (title, description, skills_needed)
   - `matches`: Successful mutual connections
   - `candidate_likes`: User interest in projects
   - `project_likes`: Project owner interest in candidates
   - `conversations` & `messages`: Messaging system
   - `embeddings`: Pre-computed semantic embeddings for fast matching

2. **Resume Parser**:
   - PDF text extraction (digital and OCR)
   - Section detection (Education, Experience, Projects, Skills)
   - Skill normalization and deduplication
   - Exposed via Supabase Edge Function

3. **Matching Engine**:
   - Sentence transformer embeddings for semantic similarity
   - Weighted scoring across multiple dimensions
   - Efficient filtering of previous matches
   - Explainable results with skill breakdowns

4. **Mobile App Screens**:
   - Sign In / Sign Up
   - Project Browsing Feed
   - Candidate Browsing Feed (for project owners)
   - Matches & Messaging
   - Profile View & Edit
   - Project Creation & Management

## Success Metrics

### User Engagement
- Number of profiles created
- Resume upload completion rate
- Daily/weekly active users
- Average session duration

### Matching Quality
- Percentage of matches that lead to conversations
- User satisfaction with match relevance (feedback surveys)
- Time to first match for new users
- Percentage of projects that find suitable collaborators

### Platform Health
- User retention rate (30-day, 90-day)
- Projects created per user
- Messages sent per match
- Inactive project cleanup rate

## Development Priorities

### P0: Core Functionality (Must-Have)
- User authentication and profile creation
- Resume parsing to initialize profiles
- Project creation and management
- Person-to-project matching algorithm
- Project-to-person matching algorithm
- Matching system with mutual interest
- Basic messaging after matches
- Database setup with RLS

### P1: Enhanced Features
- Profile and project customization
- Filtering on projects and candidates
- Multiple projects per user
- Pause/delete projects and profiles
- Messaging system improvements

### P2: Quality of Life
- Tag candidates with specific projects they fit
- Enhanced search and filtering
- Notification system

### P3: Advanced Features
- Incorporate match history into algorithm
- User inactivity weighting
- Project archive (past collaborations)
- Auto-fill profile from resume re-upload
- Elo-based matching refinement

## Design Philosophy

Peer.io prioritizes **simplicity, clarity, and efficiency** in both user experience and technical implementation:

- **User-Centric**: Interfaces are intuitive, requiring minimal learning curve
- **Transparent**: Matching scores include explanations so users understand why they see specific recommendations
- **Privacy-Aware**: Users control profile visibility and can pause/delete at any time
- **Scalable**: Supabase Edge Functions auto-scale with user growth
- **Maintainable**: Clean separation between frontend, backend, and matching logic

## Project Timeline

- **January 2026**: Requirements finalization, design document completion
- **February 2026**: Core feature implementation (auth, profiles, projects, matching)
- **March 2026**: UI polish, testing, bug fixes
- **April 2026**: Beta testing with target user group, iterative improvements
- **April 23, 2026**: Final presentation and demonstration

## Conclusion

Peer.io fills a critical gap in the collaborative project ecosystem by providing intelligent, bidirectional matching between project creators and skilled collaborators. By combining resume parsing, semantic analysis, and explainable scoring, the platform ensures both parties find relevant, high-quality matches. The mobile-first design and integrated messaging system streamline the entire process from discovery to collaboration, making it easier than ever for students and young professionals to find their next great project opportunity.
