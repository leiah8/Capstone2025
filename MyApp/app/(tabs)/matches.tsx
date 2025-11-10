// import { Platform, StyleSheet } from 'react-native';

import { DbMatch, MatchUI } from '../lib/match';


import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

import { supabase } from '../lib/supabase';

import {
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';


export default function MatchesPage() {
    const { signOut, session } = useAuth();

    /* State */
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);

    const [projectMatches, setProjectMatches] = useState<DbMatch[]>([]);
    const [candidateMatches, setCandidateMatches] = useState<DbMatch[]>([]);

    const [projectMatchesUI, setProjectMatchesUI] = useState<MatchUI[]>([]);
    const [candidateMatchesUI, setCandidateMatchesUI] = useState<MatchUI[]>([]);

    const [projectsPage, setPage] = useState(true);

    const matchesTest : DbMatch[] = [{
        id: "1",
        owner_id: "2",
        project_id : "3",
        candidate_id : "4",
        created_at : "5"
    }, 
    {
        id: "6",
        owner_id: "7",
        project_id : "8",
        candidate_id : "9",
        created_at : "0 "
    } ]

    const candidateInfo : MatchUI[] = [{
        match_id: "1",
        candidate_name: "name1",
        project_name : "project name 1",
        owner_name : "owner name 1",
        
        project_image: "blank",
        candidate_image : "blank2"
    }, 
{
        match_id: "11",
        candidate_name: "name11",
        project_name : "project name 11",
        owner_name : "owner name 11",
        
        project_image: "blank",
        candidate_image : "blank2"
    }]

    const projectInfo : MatchUI[] = [{
        match_id: "6",
        candidate_name: "name2",
        project_name : "project name 2",
        owner_name : "owner name 3",
        
        project_image: "blank",
        candidate_image : "blank2"
    }, 
{
        match_id: "16",
        candidate_name: "name21",
        project_name : "project name 21",
        owner_name : "owner name 31",
        
        project_image: "blank",
        candidate_image : "blank2"
    }]


    /*Load Matches */

    useEffect(() => {
        (async () => {
            //get project matches
          try {
            const { data, error } = await supabase
              .from('matches')
              .select('*')
              .eq('candidate_id', session?.user?.id)
    
            if (error && error.code !== 'PGRST116') {
              console.error('Error loading project matches:', error);
            } else if (data) {


                setProjectMatches(data as DbMatch[])
                            
            }
          } catch (e) {
            console.error('Error loading project matches:', e);
          } finally {
            setLoading(false);
          }

          // get candidate matches
        try {
            const { data, error } = await supabase
              .from('matches')
              .select('*')
              .eq('owner_id', session?.user?.id)
    
            if (error && error.code !== 'PGRST116') {
              console.error('Error loading candidate matches:', error);
            } else if (data) {

                setCandidateMatches(data as DbMatch[])
                            
            }
          } catch (e) {
            console.error('Error loading candidate matches:', e);
          } finally {
            setLoading(false);
          }

          //REMOVE HERE
          setPage(true)
          setProjectMatches(matchesTest)
          setCandidateMatches(matchesTest)

          setProjectMatchesUI(projectInfo)
          setCandidateMatchesUI(candidateInfo)

        projectMatches.forEach((m: DbMatch) => {
            console.log(m);

            //TODO fetch project info 
        });

        candidateMatches.forEach((m: DbMatch) => {
            console.log(m);

            //TODO fetch candidate info 
        });


        })();
      }, [session?.user?.id]);

      //project matches
      if (projectsPage) {
        return (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>  
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                    {/* Header */}
                    <View style={styles.headerContainer}>
                        <Text style={styles.headerTitle}>Matches</Text>
                    
                    {/* Sub Headers */}
                    </View>
                        <TouchableOpacity style={styles.signOutButton} onPress={async () => {
                            setPage(true)} 
                            }>
                            <Text style={styles.sectionTitle}>Projects</Text>
                        </TouchableOpacity>
                         <TouchableOpacity style={styles.signOutButton} onPress={async () => {
                            setPage(false)} 
                            }>
                            <Text style={styles.sectionTitle}>Candidates</Text>
                        </TouchableOpacity>
                    <View>

                    {/* Content */}
                    <View>
                        {projectMatchesUI.map((match, index) => (
                            <View style={styles.match}>
                                <Image source={{ uri: match.project_image }} style={styles.profileImage} />
                                <Text key={index}>{match.project_name}</Text>
                            </View>
                        ))}
                    </View>

                    </View>

                </ScrollView>
                
            </KeyboardAvoidingView>
        );
      }
    else { //candidate matches
        return (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>  
                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                    {/* Header */}
                    <View style={styles.headerContainer}>
                        <Text style={styles.headerTitle}>Matches</Text>
                    
                    {/* Sub Headers */}
                    </View>
                        <TouchableOpacity style={styles.signOutButton} onPress={async () => {
                            setPage(true)} 
                            }>
                            <Text style={styles.sectionTitle}>Projects</Text>
                        </TouchableOpacity>
                         <TouchableOpacity style={styles.signOutButton} onPress={async () => {
                            setPage(false)} 
                            }>
                            <Text style={styles.sectionTitle}>Candidates</Text>
                        </TouchableOpacity>
                    <View>

                    {/* Content */}
                    <View>
                        {candidateMatchesUI.map((match, index) => (
                            <View style={styles.match}>
                                <Image source={{ uri: match.project_image }} style={styles.profileImage} />
                                <Text key={index}>{match.candidate_name}</Text>
                            </View>
                        ))}
                    </View>

                    </View>

                </ScrollView>
                
            </KeyboardAvoidingView>
        );
      
    }
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({

  match : {},
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollView: { flex: 1, padding: 20 },

  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#333' },
  signOutButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FF3B30', gap: 6 },
  signOutText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },

  profileImageContainer: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  profileImageButton: { marginBottom: 10, position: 'relative' },
  profileImage: { width: 120, height: 120, borderRadius: 60 },
  placeholderImage: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' },
  uploadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  changePhotoButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, gap: 6 },
  changePhotoText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },

  section: { marginBottom: 25 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#ddd', marginBottom: 10 },
  disabledInput: { backgroundColor: '#f0f0f0', color: '#666' },
  textArea: { minHeight: 100, paddingTop: 14 },

  socialLinkContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#ddd', marginBottom: 12, gap: 12 },
  socialInput: { flex: 1, fontSize: 16, color: '#333' },

  searchContainer: { flexDirection: 'row', marginBottom: 12 },
  searchInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#ddd', marginRight: 10 },
  addButton: { backgroundColor: '#007AFF', borderRadius: 10, width: 50, justifyContent: 'center', alignItems: 'center' },
  addIconButton: { padding: 4 },

  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingLeft: 14, paddingRight: 10, borderWidth: 1, borderColor: '#ddd', gap: 6 },
  tagText: { fontSize: 14, color: '#333' },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#ddd', position: 'relative' },
  removeButton: { position: 'absolute', top: 12, right: 12, zIndex: 1, padding: 4 },
});
