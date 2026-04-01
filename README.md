# peer.io
Project Matching IOS App

# Video Demo
https://www.macvideo.ca/media/Peer.io%20-%20Computing%20and%20Software/1_ed8536am

# Directories
## peerio_app 
Primary mobile application / frontend code
## match_edge_function
Local copy of edge function responsible for creating matches (working copy is stored on Supabase)
## Meeting Notes
Rough meeting notes, some meetings not recorded
## resume_parser
Code responsible for backend Resume Parsing functionality
## supabase
TODO BY NIC
## web-app
Sub-repo for our website

# Test Credentials
TODO

# How to Run (iOS / macOS ONLY)
1. Ensure XCode is installed on Mac device (This allows for iOS device simulation)
2. cd peerio_app
3. In peerio_app, create a file named .env and put in the following two lines:
    EXPO_PUBLIC_SUPABASE_URL=https://lrstnbamnilrjpevdjlm.supabase.co
    EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyc3RuYmFtbmlscmpwZXZkamxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDQ5NzUsImV4cCI6MjA3NTQ4MDk3NX0.rEOXSe49rI7IGfnDK_9RDgNbM7DRs7PVd8fzZooYBvA
4. npm install expo
5. npx expo prebuild --platform ios --clean
6. npx expo start
7. 
