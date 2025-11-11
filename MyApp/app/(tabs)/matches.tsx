// import { Platform, StyleSheet } from 'react-native';

import { DbMatch, MatchUI } from '../lib/match';


import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

import { supabase } from '../lib/supabase';

import { Ionicons } from '@expo/vector-icons';


import {
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
                    <View>
                        <Text style={styles.headerTitle}>Matches</Text>
                    </View>
                    {/* Sub Headers */}
                    
                    <View style={styles.tabsContainer}>
                        <TouchableOpacity style={styles.tabButton} onPress={async () => {
                            setPage(true)} 
                            }>
                            <Text style={styles.sectionTitle && styles.activeTab}>Projects</Text>
                        </TouchableOpacity>
                         <TouchableOpacity style={styles.tabButton} onPress={async () => {
                            setPage(false)} 
                            }>
                            <Text style={styles.sectionTitle}>Candidates</Text>
                        </TouchableOpacity>
                    
                    </View>

                    {/* Content */}
                    <View style={styles.list}>
                        {projectMatchesUI.map((match, index) => (
                            <View style={styles.match}>
                                {/* <Image source={{ uri: match.project_image }} style={styles.profileImage} /> */}
                                <View style={styles.placeholderImage}>
                                    <Ionicons name="person" size={30} color="#999" />
                                </View>
                                <Text key={index}>{match.project_name}</Text>
                            </View>
                        ))}
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
                    <View>
                        <Text style={styles.headerTitle}>Matches</Text>
                    </View>
                    
                    {/* Sub Headers */}
                    <View style={styles.tabsContainer}>
                        <TouchableOpacity style={styles.tabButton} onPress={async () => {
                            setPage(true)} 
                            }>
                            <Text style={styles.sectionTitle}>Projects</Text>
                        </TouchableOpacity>
                         <TouchableOpacity style={styles.tabButton} onPress={async () => {
                            setPage(false)} 
                            }>
                            <Text style={styles.sectionTitle && styles.activeTab}>Candidates</Text>
                        </TouchableOpacity>

                    </View>
                    

                    {/* Content */}
                    <View style={styles.list}>
                        {candidateMatchesUI.map((match, index) => (
                            <View style={styles.match}>
                                {/* <Image source={{ uri: match.project_image }} style={styles.profileImage} /> */}
                                <View style={styles.placeholderImage}>
                                    <Ionicons name="person" size={40} color="#999" /> 
                                </View>
                                <Text key={index}>{match.candidate_name}</Text>
                            </View>
                        ))}
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

  match : {flexDirection: 'row', justifyContent: 'flex-start', alignItems : "center", gap : 10},

  list : {marginTop :  10, gap : 10},

  container: { flex: 1, backgroundColor: '#ffffff' },
  scrollView: { flex: 1, padding: 20 },

  headerTitle: { fontSize: 28, fontWeight: '700', color: '#333' },

  section: { marginBottom: 25 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'normal', color: '#333' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  profileImage: { width: 120, height: 120, borderRadius: 60 },



tabButton: { flex : 1, alignItems : "center", paddingVertical: 8, 
  paddingHorizontal: 16, borderRadius: 8,backgroundColor: '#f5f5f5', justifyContent :"center"
},

tabsContainer: {
  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch', marginTop: 12, gap: 10, 
},


placeholderImage: { width: 60, height: 60, borderRadius: 60, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' },
  
activeTab : {fontWeight : "bold", fontSize : 18, justifyContent :"center"}
    
});


//TODO: change output so only a couple things change per projectPage bool
//TODO: add in images 