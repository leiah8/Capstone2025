Design + V&V Document

Version 0
Group 22
COMPSCI 4ZP6

Dr. Mehdi Moradi
January 23, 2026

Andre Menezes

meneza3@mcmaster.ca

400401293

Leiah Nay

nayl@mcmaster.ca

400362166

Martin Matlok

matlokm@mcmaster.ca

400369490

Nicholas Poulidis

poulidin@mcmaster.ca

400380146

Tony Lin

lint50@mcmaster.ca

400388309

Table of Contents

Table of Contents..................................................................................................................................... 2
1. Introduction......................................................................................................................................... 4
1.1 Project Purpose..............................................................................................................................4
1.2 Document Purpose.........................................................................................................................4
2. Project Component Diagram..............................................................................................................4
3. Relationship Between Project Components and Requirements......................................................5
4. Project Components............................................................................................................................ 5
4.1 Resume Parser............................................................................................................................... 5
4.1.1 Normal Behaviour.......................................................................................................... 5
4.1.2 API..................................................................................................................................5
4.1.3 Implementation...............................................................................................................6
4.1.4 Potential Undesired Behaviours..................................................................................... 6
4.2 Project-to-Person Matching Algorithm......................................................................................... 6
4.2.1 Normal Behaviour.......................................................................................................... 6
4.2.2 API..................................................................................................................................6
4.2.3 Implementation...............................................................................................................7
4.2.4 Potential Undesired Behaviours..................................................................................... 7
4.3 Person-to-Project Matching Algorithm......................................................................................... 7
4.3.1 Normal Behaviour.......................................................................................................... 7
4.3.2 API..................................................................................................................................7
4.3.3 Implementation...............................................................................................................8
4.3.4 Potential Undesired Behaviours..................................................................................... 8
4.4 Sign in and Sign up........................................................................................................................8
4.4.1 Normal Behaviour.......................................................................................................... 8
4.4.2 Implementation...............................................................................................................8
4.4.3 Potential Undesired Behaviours..................................................................................... 8
4.5 Project Browsing Feed.................................................................................................................. 9
4.5.1 Normal Behaviour.......................................................................................................... 9
4.5.2 Implementation...............................................................................................................9
4.5.3 Potential Undesired Behaviours..................................................................................... 9
4.6. Candidate Browsing Feed.............................................................................................................9
4.6.1 Normal Behaviour.......................................................................................................... 9
4.6.2 Implementation...............................................................................................................9
4.6.3 Potential Undesired Behaviours..................................................................................... 9
4.7 Matches Page.................................................................................................................................9
4.7.1 Normal Behaviour.......................................................................................................... 9
4.7.2 Implementation.............................................................................................................10
4.7.3 Potential Undesired Behaviours................................................................................... 10
4.8 Messaging System....................................................................................................................... 10

4.8.1 Normal Behaviour........................................................................................................ 10
4.8.2 Implementation.............................................................................................................10
4.8.3 Potential Undesired Behaviours................................................................................... 10
4.9 Profile Page................................................................................................................................. 10
4.9.1 Normal Behaviour........................................................................................................ 10
4.9.2 Implementation.............................................................................................................10
4.9.3 Potential Undesired Behaviours................................................................................... 11
4.10 Project Creation and Editing......................................................................................................11
4.10.1 Normal Behaviour...................................................................................................... 11
4.10.2 Implementation........................................................................................................... 11
4.10.3 Potential Undesired Behaviours................................................................................. 11
5. Backend.............................................................................................................................................. 11
5.1 Intro............................................................................................................................................. 11
5.2 Database Schema......................................................................................................................... 11
5.3 Storage Buckets........................................................................................................................... 12
5.4 Edge Functions............................................................................................................................ 12
6. UI/UX Design..................................................................................................................................... 12
7. Validation & Verification................................................................................................................................. 13
7.1 Matching......................................................................................................................................13
7.1.1 Unit Tests............................................................................................................................13
7.2 Messaging....................................................................................................................................13
7.3 Project Feed................................................................................................................................. 13
7.4 Candidate Feed............................................................................................................................ 13
7.5 Profile Page................................................................................................................................. 14
7.6 Login............................................................................................................................................14
7.7 Backend....................................................................................................................................... 14
7.8 Resume Parser............................................................................................................................. 14
7.8.1 Unit Tests............................................................................................................................14
7.8.2 Performance Test and Metrics............................................................................................ 15
Appendix................................................................................................................................................ 16
Table 1:.............................................................................................................................................. 16
Table 2:.............................................................................................................................................. 17
Table 3:.............................................................................................................................................. 17
Table 4:.............................................................................................................................................. 18
Table 5:.............................................................................................................................................. 18
Table 6:.............................................................................................................................................. 19
Image 1:............................................................................................................................................. 20
Image 2:............................................................................................................................................. 21

1. Introduction

1.1 Project Purpose

Students and early professionals often seek opportunities to collaborate on projects outside of their
coursework or workplace. However, finding reliable teammates or opportunities is often limited to
personal networks, scattered online forums, and LinkedIn, making collaboration difficult. Without a
central hub, individuals struggle to match their skills and interests with the right opportunities, leading
to missed chances for learning, innovation, and community building. Peer.io is a mobile-based
application where users can browse two interactive feeds: one for project ideas and one for potential
collaborators. Using a like-dislike style interface, users can match with projects and peers. Once a
mutual interest is established, contact information is exchanged to facilitate collaboration. Over time,
the platform’s matching algorithm will adapt to user preferences in combination with the user's skills
and experience, making it easier to find meaningful and relevant opportunities.

1.2 Document Purpose

The purpose of this document is to describe, in detail, the components of our application and explain
the relationship between each component, other component(s) and the requirements as defined in our
Software Requirements Specification (SRS) document. We also provide an overview of our testing
plan for each component to ensure we meet these requirements and provide a smooth and consistent
user experience.

2. Project Component Diagram

1.  Upon sign-up, the user is prompted to upload a resume. This resume is then parsed by the

Resume Parser to initialize a user’s profile.

2.  The Project Browsing Feed displays possible projects in order of compatibility, as decided by

the Project-to-Person Matching Algorithm.

3.  While editing their profile, the user can choose to upload a new resume and have it parsed by

the Resume Parser.

4.  The Candidate Browsing Feed displays possible candidates to a project owner in order of

compatibility, as decided by the Person-to-Project Matching Algorithm.

5.  The matches page stores previous matches between candidates and projects as saved in the

Database.

6.  The Person-to-Project Matching Algorithm finds people that match a user’s project(s). These

possible candidates are chosen from the Database.

7.  The Project-to-Person Matching Algorithm finds projects that match a user’s profile. These

possible projects are chosen from the Database.

8.  A user can view and edit their profile. Any changes they make, will be updated in the Database.
9.  A user can view and edit the projects they own. Any changes they make will be updated in the

Database.

10. Whenever a user sends a message, that message will be stored in the Database.
11. When opening a previous chat, the user pulls previous messages from the Database.
12. Messaging chats can begin once a project and a candidate have a Match.

3. Relationship Between Project Components and Requirements

See Appendix, Table 1.

4. Project Components

4.1 Resume Parser

4.1.1 Normal Behaviour
The resume parser component is responsible for accepting a resume file (uploaded at account creation
or under profile) and converting it into a structured representation that is used to populate the user’s
profile. Under normal conditions, the parser first tries to read the resume as a digital PDF by extracting
selectable text directly from the document. It then organizes that text into a single combined resume
text and splits it into Education, Experience, Projects, and Skills using common resume headings. In
addition, the parser attempts to detect and extract simple table-like structures when present. Lastly, it
produces a cleaned list of skills by scanning the Skills section first and otherwise searching the full
resume text, returning a deduplicated list of skill keywords.

4.1.2 API
The parser is exposed through two API endpoints. The first endpoint accepts the resume file upload,
and the second endpoint accepts a URL pointing to a valid resume in PDF format. In both cases, the
input is ultimately a PDF resume provided by the user, and the output is a JSON response containing
the parsed results. When it comes to the response content, it includes basic metadata (e.g., number of
pages), parsing method (digital text extraction versus OCR fallback), the extracted plain text, a
dictionary of detected sections (mapping the previously mentioned sections to their content), any

extracted tables (if available), and a final list of skills. If parsing fails (e.g., unsupported file or
unreadable PDF), the API returns an error response indicating the parse was not successful.

4.1.3 Implementation
The Resume Parser is implemented as a multi-stage parsing workflow, where each stage performs a
specific role in transforming the resume into structured data. The API layer handles receiving the file
or downloading it from the provided URL, then passes the saved PDF into the parsing pipeline. The
parsing pipeline begins with a text-extraction stage that pulls readable data from the PDF while
preserving layout order to improve readability for multi-column resumes. In cases where the extracted
text is too short, the pipeline falls back to an OCR stage that renders each page as an image and runs
OCR to recover text. Once the text is available, a sectioning stage groups content under standard
headings (Education, Experience, Projects, and Skills). After the extracted text is categorized, a table
extraction stage attempts to capture any structured tables, and a skill extraction stage builds a
normalized list of skills. The final output combines all these results into one structured JSON object
returned by the API.

4.1.4 Potential Undesired Behaviours
Most of the identified possible issues could arise from the user providing invalid or unconventional
resumes. Some resumes are scanned images or low-quality PDFs, which may cause digital extraction
to return little or even no text and OCR to produce noisy or incorrect results. Multi-column layouts and
unusual formatting can lead to text being read in the wrong order, which may reduce categorization
accuracy. Section headers may be missed if the resume uses uncommon labels, causing the content to
be grouped incorrectly or left unclassified. Table extraction may fail when tables are visually implied
rather than embedded. Skill extraction can also produce false positives (when a word is tagged as a
skill but is part of a normal sentence) or miss skills as a result of abbreviations. Lastly, very large PDFs
or highly graphical resumes could increase processing time.

4.2 Project-to-Person Matching Algorithm

4.2.1 Normal Behaviour
The project-to-person matching algorithm is the key factor in helping facilitate high-quality
collaborative connections by ranking potential matches based on a weighted system. This algorithm
helps enable project owners to find the most qualified candidates for their specific needs. Under
normal operation, the algorithm computes a composite score for each potential candidate a project
owner might want to invite to collaborate on their project with them. The score is calculated using five
weighted components: semantic similarity, must-have skills, nice-to-have skills, interest alignment, and
an Elo-based quality score. The semantic similarity, skills, and interest alignment for a given user will
be calculated by leveraging our resume parsing tool (Resume Parser, 4.1). The elo score acts as a
dynamic reputation indicator, ensuring that high-quality users are prioritized in the project owners'
feed.

4.2.2 API
The matching engine is exposed via Supabase Edge Functions, providing high-performance,
authenticated endpoints for the client application. Both endpoints require a valid Supabase JWT for
authorization and allow for the dynamic tuning of weights to refine results. The request call for the
project-to-person matching API will take the current user’s ID and return a ranked list of projects. The
request body allows for optional weight customization and a limit on the number of results returned.

The standard response includes a matches array, where each entry contains the target entity’s details,
the total score calculated, and an explanation object. The explanation field explicitly lists matched and
missing “must-have” skills to provide immediate feedback.

4.2.3 Implementation
The matching algorithm is implemented as a multi-stage pipeline in Python. It begins by computing
semantic similarity between a user’s profile text and project descriptions, which uses a pre-trained
sentence transformer model (all-MiniLM-L6-v2) from the sentence-transformers library. It then
calculates the number of matched and missing skills required for the project from a user's skill set.
Additionally, the interest alignment is determined by measuring overlap between a user's interests and
project tags. These components, along with the stored Elo of a given user, are multiplied by their
respective weights and added to determine the total match score for a given user. The final ranked list
is then returned via the API, ensuring an explainable breakdown of matched skills and interests.

4.2.4 Potential Undesired Behaviours
The integration of an Elo-based reputation system, while beneficial for ensuring high-quality
individuals are recommended first, includes the structural risk of “Cold Start” feedback loops. That is,
new users will begin with a baseline Elo score, which inherently places them at a lower rank than
established entities with a history of high engagement. If the weight assigned to the Elo score is too
high, it may create a cycle where high-Elo users receive the vast majority of visibility in feeds and
subsequent views further inflate their scores while new, high-quality individuals remain undiscovered.
To prevent this, the system must be validated to ensure the Elo acts as a quality indicator rather than a
primary barrier to entry, allowing the semantic and skill-based components to be the greater driver for
discovery by the algorithm. Profile sparsity could also potentially serve as an undesired behaviour if a
user provides limited biographical information or incomplete skill lists. In these cases, the semantic
similarity component may lack sufficient context, forcing the algorithm to rely primarily on explicit
skill overlap, which can reduce recommendation quality.

4.3 Person-to-Project Matching Algorithm

4.3.1 Normal Behaviour
Similar to the project-to-person matching algorithm, the person-to-project matching algorithm is
responsible for helping users discover projects that align with their skills, interests, and experience.
This algorithm operates from the perspective of a candidate user and prioritizes projects that are both
technically suitable and contextually relevant to a given user.

4.3.2 API
The person-to-project matching functionality is exposed through a Supabase Edge Function and
requires authentication via a valid Supabase JWT. This endpoint is called by the client application
whenever a user accesses the project browsing feed. The request for the person-to-project matching
API includes the authenticated user’s ID and optionally allows customization of weights and the
number of results to return. The API will then respond with a ranked list of projects ordered by
descending total match score. Each response entry includes the project’s metadata, the computed total
match score, and an explanation object. The explanation object explicitly identifies the matched and
missing skills, matched interests, and the contribution of each scoring component, allowing developers
working on the matching algorithm to understand why a project was recommended.

4.3.3 Implementation
This matching algorithm is implemented as a multi-stage pipeline in Python. For each project, the
algorithm computes the semantic similarity between the users’ profile text and the project description
using a pre-trained sentence transformer model in which vector embeddings are generated for both
inputs and compared using cosine similarity. It then calculates the number of matched and missing
skills required for the project from a user's skill set. Additionally, the interest alignment is determined
by measuring overlap between a user's interests and project tags. These components, along with the
stored Elo of a given user, are multiplied by their respective weights and added to determine the total
match score for a given user. The final ranked list is then returned via the API, ensuring an explainable
breakdown of matched skills and interests.

4.3.4 Potential Undesired Behaviours
Similar to the project-to-person matching algorithm, a “cold start” feedback loop due to a high
weighting of the elo-based reputation system is also possible with this algorithm. Additionally, the
aforementioned profile sparsity issue could also be applied to this algorithm (Potential Undesired
Behaviours, 4.2.4).

4.4 Sign in and Sign up

4.4.1 Normal Behaviour

The authentication system in Peer.io is responsible for allowing users to create accounts, sign in, and
securely access the application. Under normal behaviour, a new user provides an email address and
password to sign up, receives a verification email, and gains access only after confirming their email.
Returning users can log in using their existing credentials. This ensures that only verified users are able
to use the platform.

The system communicates with Supabase Auth through an API that exchanges data in JSON format
over HTTPS. The primary inputs are the user’s email and password, while the outputs include an
authentication session token and a user object containing basic account information. During sign-up,
Supabase also triggers an email confirmation process, and the client receives either a success response
or an error message depending on the result of the request.

4.4.2 Implementation

The implementation consists of simple frontend sign-in and sign-up screens that call Supabase Auth
methods to handle authentication. These components are responsible for collecting user input and
forwarding it to the authentication service, while Supabase manages user records, sessions, and email
verification internally.

4.4.3 Potential Undesired Behaviours

Potential undesired behaviours include users entering invalid credentials, failing to receive the
verification email, attempting to log in before confirming their email, or encountering network-related
errors during authentication. These cases are handled through error messages and restricted access.

4.5 Project Browsing Feed

4.5.1 Normal Behaviour
The Project Browsing Feed allows users who want to join new projects to find projects best suited to
them. Filters will be present to allow for filtering of location, interests, skills required, and more. A
project will appear on the screen, providing a brief description, the key skills required, and an image
representing the project. Users browse through projects by either liking or disliking the project. This
can be done through swiping or clicking the ‘✘’ and ‘✓’ buttons. If the user has scrolled through
every project on the platform, a “reset” button will be present instead of a project, prompting the user
with the choice of going through the projects again.

4.5.2 Implementation
The Project Browsing Feed will directly call the Project-to-Person API, displaying the projects
recommended to the user by the algorithm in the order the algorithm provides. Liking a project will be
tracked in the database, so matches can be made if the like is reciprocal.

4.5.3 Potential Undesired Behaviours
Projects must not be duplicated or seen multiple times unless the user has clicked the reset button.
Liking a project must successfully send the like to the backend, as we do not want users' likes to get
“lost”.

4.6. Candidate Browsing Feed

4.6.1 Normal Behaviour
This page allows project owners to browse through potential candidates with skills suited to their
project(s). In the top right, there is an option for users to add filters. These filters can include specific
projects for which they want candidates, minimum skill level, location of candidates and more. Users
browse through candidates by either liking or disliking their profiles. This can be done through swiping
or clicking the ‘✘’ and ‘✓’ buttons. Only one candidate is shown at a time.

4.6.2 Implementation
The Project Browsing Feed will directly call the Person-to-Project API, displaying the candidates
recommended to the project owner by the algorithm in the order the algorithm provides. Liking a
candidate will be tracked in the database so matches can be made if the like is reciprocal.

4.6.3 Potential Undesired Behaviours
Candidate profiles must not be duplicated or seen multiple times unless the user has clicked the reset
button. Liking a candidate must successfully send the like to the backend, as we do not want users’
likes to get “lost”.

4.7 Matches Page

4.7.1 Normal Behaviour
The matches page displays all active matches available to the current user. It is split into two selectable
tabs: Projects and Candidates. These feeds will populate when “Matches” occur. A match occurs when
two conditions have been met: Firstly, the candidate user has clicked the ‘✓’ button on the project

upon seeing it in the Project Browsing Feed. Secondly, the project owner user has clicked the  ‘✓’
button on the candidate user upon seeing them in the Candidate Browsing Feed. Once both conditions
are met, the candidate user will see the project's name and picture under the project tab, and the project
owner user will see the candidate's name and picture (as well as the applied project if the project owner
owns more than one project) under the candidates tab. Tapping the project will enter the messaging
system with the project owner, and tapping the candidate will enter the messaging system with the
candidate user. Once a project is completed and has been closed by the project owner, the match will
disappear, removing it from the matches page.

4.7.2 Implementation
On opening the matches page, the matches table in the database will be checked to determine profiles
and projects to display.

4.7.3 Potential Undesired Behaviours
Under no circumstances should projects or users appear on the matches page that have not properly
matched to avoid user confusion. For the same reason, once a project is closed, the respective project
and candidates should not remain on the matches page.

4.8 Messaging System

4.8.1 Normal Behaviour
Users who have matched and appeared on the matches page will have a simple messaging window,
where text can be exchanged between the users to facilitate project completion. The window will
contain a text box, a fully scrollable history of the user's conversation, and the user's name and
associated project in the top.

4.8.2 Implementation
Each conversation has a respective table in the database, and each message sent will add to a messages
table associated with that table. Supabase Realtime will be utilized to ensure all updates to the
messaging table are instantly relayed to the users in the chat, resulting in a seamless instant messaging
experience.

4.8.3 Potential Undesired Behaviours
Messages must remain private and only be visible between the two users present in the conversation,
as lack of privacy is undesirable.

4.9 Profile Page

4.9.1 Normal Behaviour
Users can edit their profile and account details. This includes updating their skills, skill level, bio,
interests, education, work experience, and portfolio or changing account details such as displayed
name, and location. This page also has access to the resume parsing functionality, allowing users to
upload their resume and create an initial profile or add to their current profile.

4.9.2 Implementation
Every field in the profile page corresponds to an attribute in the profiles table. When a user edits these
fields those changes are updated in the database and this new information will be used in following
iterations of the matching algorithm. In addition, through this page, users can access the resume parser
through an API endpoint as explained above.

4.9.3 Potential Undesired Behaviours
Changes made by the user must be reflected in the database immediately after editing. Delayed
information changes would result in discrepancies between the profiles shown to project owners and
the profile the user wishes to display. Ensuring the changes take effect immediately means other users
only see the profile this user wishes to display. In addition, we want project suggestions to be made
based on the most accurate and recent user data.

4.10 Project Creation and Editing

4.10.1 Normal Behaviour

The project components of the application are the interface through which project owners can create,
manage, and edit their project listings. This component enables defining what their building is and
what kind of collaborators they’ll be looking for.

4.10.2 Implementation

Users are able to create new projects with the following fields: title, description, skills needed, tags,
intention, and active status. The skills needed will refer to the skills desired in collaborators, and will
be utilized by our matching algorithm to pair them with individuals who suit the project's needs. The
tags field under the project will help the application categorize projects so that the matching algorithm
can suggest users who have mutual interests in the projects.

4.10.3 Potential Undesired Behaviours

The changes made to a project by the user must be reflected in the database immediately after editing.
Delayed information changes can result in confusion during communication about projects. In
addition, the project management interface should allow users to view all owned projects, edit projects,
toggle the active status of their projects, and delete projects to ensure users feel in control of their
projects. Lack of these features would result in lack of user control, an undesired outcome.

5. Backend

5.1 Intro

Supabase is used as the primary backend platform for Peer.io and provides a PostgreSQL-based
database. In addition to database services, Supabase is used for authentication, edge functions, and
object storage for files such as profile images and resumes.

5.2 Database Schema

The database schema shown in Appendix, Image 1 illustrates the relationships between the core tables,
including profiles, projects, conversations, conversation_participants, matches, candidate_likes,
project_likes, messages, and resume_files.

In the schema diagram, primary keys are indicated by the key icon at the very left of the column name.
Column nullability is represented by the diamond icon preceding the column name: a white diamond
indicates a non-nullable column, while a black diamond indicates a nullable column. Each column’s
data type is shown right-adjacent to its name. Lines connecting columns across tables represent foreign
key relationships and define the links between entities.

The schema includes a unique entity, auth.users.id, which is managed by Supabase Auth. The
profiles table is keyed by auth.users.id, linking authenticated users to their application-specific
profile data. This allows profile information to evolve independently of authentication concerns.

5.3 Storage Buckets

We use Supabase Storage Buckets to store profile images and resumes. The profiles table
includes profile_image and resume_url columns (type text), which store the storage paths to the
corresponding files in Supabase Storage. These paths are used to generate public or signed URLs
at runtime based on access permissions.

5.4 Edge Functions

We use Supabase Edge Functions to run backend logic close to the user without managing
servers. These functions are deployed on Supabase’s edge infrastructure and can securely access
Supabase Auth, Storage, and Postgres using server-side credentials. Peer.io uses three Edge
Functions: parse-resume, match-projects, and match-candidates.

Parse-resume (section 4.1):
Endpoint: https://lrstnbamnilrjpevdjlm.supabase.co/functions/v1/parse-resume
Input: Digital or scanned PDF resume file or resume URL
Output: Structured resume data including extracted text, detected sections (Education,
Experience, Projects, Skills), and normalized skill list

Match-candidates (section 4.2):
Endpoint: https://lrstnbamnilrjpevdjlm.supabase.co/functions/v1/match-candidates
Input: project id, project details, match limit, weights
Output: matches, number of matches

Match-projects (section 4.3):
Endpoint: https://lrstnbamnilrjpevdjlm.supabase.co/functions/v1/match-projects
Input: user id, user profile, match limit, weights
Output: matches, number of matches

6. UI/UX Design

We chose a simplistic and intuitive design inspired by apps such as Hinge and Instagram. This includes
a plain interface with few colours and simple fonts, allowing the candidate profiles and projects to take
the spotlight.

The colours we include in our interface will be muted and calm, not bright and distracting, ensuring the
app itself does not capture the user’s attention. Our main palette will consist of calm blues and greens.
Colour will be used to draw a user’s attention; however, backgrounds and non-crucial icons will be in
grey-scale. This allows for users’ attention to be drawn to the projects and profiles, not our interface.
For our font, we prioritized simplicity and readability, allowing for increased accessibility. Therefore,
we chose the font Inter for both titles and paragraph text.

Every page includes the bottom navigation bar, similar to Instagram, to access the project feed,
candidate feed, matches and account details. This allows for intuitive and familiar navigation to key
pages. The initial draft can be found below. Our Figma prototype displaying user interactions and key
pages is also accessible here.

See Appendix, Image 2.

7. Validation & Verification

7.1 Matching

Tests will be implemented to ensure that a user can match to a project, a user can match to multiple
projects, and that a user cannot match to closed projects. This will include a combination of basic unit
tests, as well as end-to-end manual testing.

See Appendix, Table 2.

7.1.1 Unit Tests
Test cases will include simulating matches for a project and user, ensuring that all of the outputs of the matching
algorithm are valid matches and in a logical order. These tests will include ensuring the weighted summation
works, the must-have skills are considered correctly, the elo rating doesn’t prevent discoverability for a given
project or user, and users and projects that lack a sufficient amount of description are still able to be matched to
some extent.

7.2 Messaging

Basic unit tests will be done, including sending and receiving both simple and long messages. Tests
will ensure that messages are only enabled between matched users. This will also be tested for privacy,
ensuring users external to the match cannot view other users' conversations. Messages should be near
instant, so manual testing to validate messages received within 200ms will be done.

7.3 Project Feed

Rigorous testing will be done to ensure that users’ likes and dislikes are properly recorded in the
backend. UI elements will be tested manually, ensuring no visual or usability issues with the swiping

or buttons for liking a project. Basic unit tests will ensure the project feed is properly attached to the
API, receiving and displaying the project recommendations in the order provided by the algorithm.

7.4 Candidate Feed

Thorough testing will be done to ensure that project owners’ likes and dislikes are properly recorded in
the backend. UI elements will be tested manually, ensuring no visual or usability issues with the
swiping or buttons for liking a candidate. Basic unit tests will ensure the candidate feed is properly
attached to the API, receiving and displaying the candidate profile recommendations in the order
provided by the algorithm.

7.5 Profile Page

Testing will ensure that changes are saved to the database immediately after being entered by the user.
This will be done through a combination of basic unit tests and end-to-end manual testing. Tests will
also ensure that following uses of both the project-to-person and person-to-project matching algorithms
will use this new information, again through basic unit tests and end-to-end manual testing.
Specifically, we will be focusing on the edge cases where the algorithm is run while the user is editing
their profile, and within milliseconds directly after. Finally, the UI will be manually tested to ensure a
clear interface with no disruptions while inputting information and switching between fields.

7.6 Login

We will check the following manually to verify that our login system works as intended:

See Appendix, Table 3.

Pass criteria: For each case, the observed UI behaviour matches expected output from the specified
actions/input, and no crashes occur.

7.7 Backend

We will check the following manually to verify that our backend system works as intended.

See Appendix, Table 4.

These 3 tests in the table mentioned above cover the majority of every aspect of our backend system,
Authentication, Database, Buckets, and Edge Functions.

Pass criteria: For each case, the observed UI behaviour matches expected output from the specified
actions/input, and no crashes occur.

7.8 Resume Parser

7.8.1 Unit Tests

The main goal of the resume parser is to ensure reliable extraction of structured information from
user-uploaded resumes. As such, we design a series of unit and integration tests to ensure expected
behaviour under common and edge-case situations. The primary focus is verifying that resumes can be

uploaded/fetched (when using URL) correctly, and the parsing pipeline returns valid structured JSON
output without crashing, promptly.

Test cases include simulating uploads of valid digital PDF resumes and ensuring that the output
contains all required fields, such as extracted text, detected categories, and a list of skills. In addition to
that, additional test cases will verify that missing or invalid inputs (e.g., corrupted files or missing
URLs) return appropriate error responses rather than causing system collapse. For scanned resumes,
tests confirm that the OCR fallback mechanism is triggered and produces non-empty extracted text.

Since resumes often contain sensitive information, access control and file handling are also tested to
ensure unauthorized requests are rejected. These tests are implemented using Python scripting and the
FastAPI testing utilities together with the unittest framework.

See Appendix, Table 5.

7.8.2 Performance Test and Metrics

For the resume parser, the most important performance metric is end-to-end parsing latency. For
typical digital PDF resumes, the system should return parsed results within 2 seconds under normal
network conditions. Alternatively, for resumes requiring OCR, a maximum acceptable latency of 15
seconds is defined due to the higher computational cost of image processing.

In addition to latency metrics, reliability is measured as the fraction of resumes that return structured
output without crashing, with a target success rate of at least 95% on a mixed dataset (both digital and
scanned resumes). Extraction quality is evaluated using a small, labelled test set by measuring the
accuracy of section detection and the F1-score of skill extraction, with minimum targets of 0.85 for
section detection accuracy and 0.70 for the skill extraction F1-score.

These metrics provide quantitative evidence that the Resume Parser meets both functional correctness
and performance requirements for deployment.

See Appendix, Table 6.

Appendix

Table 1:

System Component

Requirement(s) Covered

Resume Parser

●  P0: User can upload their resume which will be parsed to fill in

their initial profile

Project-to-Person
Matching Algorithm
+
Project-to-Person
Matching Algorithm

●  P0: Matching projects/profiles based on the highest relevance

score using an NLP-based semantic similarity, with explainable
scoring and tunable weights

●  P0: Elo matching system for profiles and projects
●  P0: The client will reach out to the server for profile/project

recommendations, the server will compute these recommendations
using the matching algorithm and available profiles/projects from
the database.

●  P3: Incorporating previous matches, posts, inactivity and more

into the matching algorithm

UI: Sign In and Sign Up

●  P0: Account sign-up and sign-in pages
●  P0: Resume parsing page for users to upload their resume
●  P3: Upload your resume to auto-fill your profile

UI: Project Browsing
Feed

UI: Candidate
Browsing Feed

●  P0: Project browsing feed to look through the various projects

available for collaboration

●  P0: Post and profile interactions
●  P1: Filtering on projects and people

●  P0: People browsing feed to look through people who want to

collaborate

●  P0:Post and profile interactions
●  P1: Filtering on projects and people
●  P2: Tag candidates with which of your projects they would best fit

UI: Matches

●  P0: Matches page to see the people and projects you have matched

with, and their contact information

UI: Profile and Editing

●  P1: Profile and project customization
●  P1: Ability to delete or pause (temporarily remove from matching

feeds) your project or profile

UI: Project Creation
and Editing

●  P0: Project creation page to post a short description of your project

idea

●  P1: Profile and project customization
●  P1: Allow multiple projects per person
●  P1: Ability to delete or pause (temporarily remove from matching

feeds) your project or profile

●  P3: Ability to add a project to your archive, a set of projects a user

has previously worked on and found through Peer.io

●  P1: Messaging system to communicate after matching

●  P0: Database setup to store project and user profile data
●  P0: APIs for the client-side application to retrieve and edit their

profiles and projects

●  P0: APIs for the server to access profiles and projects

Messaging

Database

Table 2:

Test Case

Actions/Input

Expected Output

1.  Provided a user and a small array
of projects, run the matching
algorithm to determine the total
match score for each

2.  Cross-reference the matches list,
ordered by match score, to ensure
the matching algorithm worked
correctly.

1.  Create two identical profiles, and a
different profile that provides a
better match for the given project.
Assign one of the identical profiles
a higher Elo rating than the others,
and assign the different profile a
lower Elo rating.

2.  Run the matching algorithm

1.  Create a profile that doesn’t

contain a sufficient amount of
information for the number of
interests, and a project that doesn’t
have a sufficient description
2.  Run the matching algorithm

The matching algorithm
calculates the weighted
summation of match scores to
follow the desired logic.

The identical profiles are
ranked according to Elo, while
the better-suited profile is
ranked highest despite the low
Elo.

The algorithm handles the
empty information fields
without returning any errors
and provides matches
accordingly.

Weighted
summation

Elo reputation

Insufficient
descriptions

Table 3:

Test Case

Actions/Input

Expected Output

Valid sign-in

3.  Enter valid email and valid

User is redirected to the

password

4.  Click the Sign In button

app/home screen and session
persists after app/refresh/reopen

Invalid credentials

3.  Enter valid email and wrong

password

4.  Click the Sign In button

Show error message and remain
on login screen

Invalid email format

1.  Enter “abc” as email
2.  Click the Sign In button

Show error message and remain
on login screen

Unverified email

1.  Sign up for a new account with an

email and password

2.  Before verifying the confirmation
email, click the Sign In button

The app blocks sign in due to
unverified email, show error
message and remain on login
screen

Table 4:

Test Case

Actions/Input

Expected Output

Authentication + Profile
Creation

(Create a new user
account and verify that
authentication and
database linkage work
correctly)

File Upload + Storage
Integration

(Verify that file storage
and database references
are correctly handled)

Project Matching via
Feed

(Verify that the project
matching Edge Function
is executed correctly and
returns relevant results)

1.  Sign up with a new email and

password.

2.  Verify the email and sign in.
3.  Check that a corresponding

row exists in the profiles table
with profiles.id =
auth.users.id.

1.  Upload a profile image or

resume.

2.  Confirm the file appears in

the correct Supabase Storage
bucket.

3.  Verify that profile_image or
resume_url in the profiles
table stores the correct storage
path.

1.  Log in as a user with defined
skills and interests stored in
their profile.

2.  Navigate to the projects feed

screen.

3.  Observe the list of projects

returned.

The user can authenticate
successfully, and profile data is
correctly linked to the
authenticated user.

The file is accessible through a
generated URL, and the
database reference correctly
points to the stored file.

The feed displays projects that
align with the user’s skills and
interests, confirming that the
match-projects Edge Function
executes successfully and
returns relevant matches.

Table 5:

Test case

Actions/Input

Expected Output

Valid digital resume upload

Upload a well-formatted PDF

HTTP 200 response + JSON
containing all expected fields

Missing URL parameter

Enter PDF using an invalid
URL field

Appropriate HTTP 400
response

Corrupted PDF file

Upload corrupted PDF

Digital extraction method

Upload a digital PDF

OCR fallback activation

Upload scanned PDF

Appropriate HTTP 500 error,
no server crash

Valid JSON response, method
used = digital

Valid JSON response, method
used = ocr

Section detection

Unauthorized access

Upload a resume with
education, experience, and
skills category

Corresponding keys appear in
sections with non-empty
content

Attempt to fetch a resume
without valid authentication
credentials

HTTP 401/403 response
returned and access to the file is
denied

Table 6:

Test case

Actions/Input

Expected Output

Digital resume latency

Parse 30 digital PDF resumes

latency ≤ 2 seconds

OCR resume latency

Parse 30 scanned resumes

latency ≤ 15 seconds

System reliability

Parse mixed dataset

Section detection accuracy

Evaluate on labeled test set

Large PDF handling

Upload high-page-count PDF

≥ 95% of inputs return
structured output successfully

Section detection accuracy ≥
0.85

Completes within timeout or
returns controlled error (slightly
higher latency accepted under
this circumstance)

Image 1:

Image 2:

