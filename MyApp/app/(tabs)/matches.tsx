// import { Platform, StyleSheet } from 'react-native';

import { DbMatch, MatchUI } from '../../lib/match';


import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

import { useNotifications } from '../../contexts/NotificationContext';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';


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
import { SafeAreaView } from 'react-native-safe-area-context';


export default function MatchesPage() {
    const { signOut, session } = useAuth();
    const { matchNotifs, newMatchIds } = useNotifications();

    /* State */
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);

    const [projectMatches, setProjectMatches] = useState<DbMatch[]>([]);
    const [candidateMatches, setCandidateMatches] = useState<DbMatch[]>([]);

    const [projectMatchesUI, setProjectMatchesUI] = useState<MatchUI[]>([]);
    const [candidateMatchesUI, setCandidateMatchesUI] = useState<MatchUI[]>([]);

    const [projectsPage, setPage] = useState(true);

    const projectNewCount = projectMatchesUI.reduce(
        (sum, m) => sum + (matchNotifs.get(String(m.match_id)) ?? 0), 0
    );
    const candidateNewCount = candidateMatchesUI.reduce(
        (sum, m) => sum + (matchNotifs.get(String(m.match_id)) ?? 0), 0
    );

    const gotoMatch = (pid : string | number) => {
        router.push(`/match/${pid}`)
    }

      useEffect(() => {
        let pMatches : MatchUI[] = [];
        let cMatches : MatchUI[] = [];

        (async () => {
            //get project matches

          try {
            const { data : m1, error : e1} = await supabase
              .from('matches')
              .select('*')
              .eq('candidate_id', session?.user?.id)
    
            if (e1 && e1.code !== 'PGRST116') {
              console.error('Error loading project matches', e1);
            } else if (m1) {


                setProjectMatches(m1 as DbMatch[])

                for(let i = 0; i < m1.length; i++) {
                    let obj : MatchUI = {
                        match_id: "0",
                        candidate_name: "0",
                        project_name : "0",
                        owner_name : "0",

                        owner_id : "0", 
                        candidate_id : "0", 
                        created_at: "",
                        
                        project_image: "0",
                        candidate_image : "0",
                        owner_image : "0"
                    }

                    obj.match_id = m1[i].id;
                    obj.owner_id = m1[i].owner_id;
                    obj.candidate_id = m1[i].candidate_id;
                    obj.created_at = m1[i].created_at;

                    const { data : d1, error : e11 } = await supabase
                        .from('projects')
                        .select('*')
                        .eq('id', m1[i].project_id)
                        .single()
            
                    if (e11 && e11.code !== 'PGRST116') {
                        console.error('Error loading project data:', e11);
                    } else if (d1) {

                        obj.project_name = d1.title
                        obj.project_image = d1.image
                                    
                    }
                    
                    
                    const { data : d2, error : e12 } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', m1[i].owner_id)
                        .single()
            
                    if (e12 && e12.code !== 'PGRST116') {
                    console.error('Error loading candidate data:', e12);
                    } else if (d2) {


                        obj.owner_name = d2.name
                        obj.owner_image = d2.profile_image
                                    
                    }
                    

                    
                    const { data : d3, error : e13} = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', m1[i].candidate_id)
                        .single()
            
                    if (e13 && e13.code !== 'PGRST116') {
                    console.error('Error loading owner data:', e13);
                    } else if (d3) {


                        obj.candidate_name = d3.name
                        obj.candidate_image = d3.profile_image
                                    
                    }
                    

                    // console.log("OBJ")
                    // console.log(obj)
                    pMatches.push(obj)
                }

            setProjectMatchesUI(pMatches)
                            
            }

            const { data : m2, error : e2 } = await supabase
              .from('matches')
              .select('*')
              .eq('owner_id', session?.user?.id)
    
            if (e2 && e2.code !== 'PGRST116') {
              console.error('Error loading candidate matches:', e2);
            } else if (m2) {

                setCandidateMatches(m2 as DbMatch[])

                for(let i = 0; i < m2.length; i++) {
                    let obj : MatchUI = {
                        match_id: "0",
                        candidate_name: "0",
                        project_name : "0",
                        owner_name : "0",

                        owner_id : "0", 
                        candidate_id : "0",
                        created_at: "",
                        
                        project_image: "0",
                        candidate_image : "0",
                        owner_image : "0"
                    }

                    obj.match_id = m2[i].id;
                    obj.owner_id = m2[i].owner_id;
                    obj.candidate_id = m2[i].candidate_id;
                    obj.created_at = m2[i].created_at;

                    const { data : d1, error : e11 } = await supabase
                        .from('projects')
                        .select('*')
                        .eq('id', m2[i].project_id)
                        .single()
            
                    if (e11 && e11.code !== 'PGRST116') {
                        console.error('Error loading project data:', e11);
                    } else if (d1) {

                        obj.project_name = d1.title
                        obj.project_image = d1.image
                                    
                    }
                    
                    
                    const { data : d2, error : e12 } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', m2[i].owner_id)
                        .single()
            
                    if (e12 && e12.code !== 'PGRST116') {
                    console.error('Error loading candidate data:', e12);
                    } else if (d2) {


                        obj.owner_name = d2.name
                        obj.owner_image = d2.profile_image
                                    
                    }
                    

                    
                    const { data : d3, error : e13} = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', m2[i].candidate_id)
                        .single()
            
                    if (e13 && e13.code !== 'PGRST116') {
                    console.error('Error loading owner data:', e13);
                    } else if (d3) {


                        obj.candidate_name = d3.name
                        obj.candidate_image = d3.profile_image
                                    
                    }
                    

                    // console.log("OBJ")
                    // console.log(obj)
                    cMatches.push(obj)
                }

            setCandidateMatchesUI(cMatches)
                            
            }

            


          } catch (e) {
            console.error('Error loading data', e);
          } finally {
            setLoading(false);
          }
 
          setPage(true)


        })();
      }, [session?.user?.id]);


      //project matches
      if (projectsPage) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.sectionTitle && styles.activeTab}>Projects</Text>
                                {projectNewCount > 0 && (
                                    <View style={styles.tabBadge}>
                                        <Text style={styles.tabBadgeText}>{projectNewCount}</Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                         <TouchableOpacity style={styles.tabButton} onPress={async () => {
                            setPage(false)} 
                            }>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.sectionTitle}>Candidates</Text>
                                {candidateNewCount > 0 && (
                                    <View style={styles.tabBadge}>
                                        <Text style={styles.tabBadgeText}>{candidateNewCount}</Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                     
                    </View>

                    {/* Content */}
                    <View style={styles.list}>
                        {projectMatchesUI.map((match, index) => {
                            const notifCount = matchNotifs.get(String(match.match_id)) ?? 0;
                            const isNewMatch = newMatchIds.has(String(match.match_id));
                            return (
                            <TouchableOpacity key={index} onPress={async() => {gotoMatch(match.match_id)}}>
                                <View style={styles.match}>
                                    <Image source={{ uri: match.project_image }} style={styles.profileImage} />
                                    <Text>{match.project_name}</Text>
                                    {isNewMatch && (
                                        <View style={styles.newMatchPill}>
                                            <Text style={styles.newMatchPillText}>new</Text>
                                        </View>
                                    )}
                                    {notifCount > 0 && (
                                        <View style={styles.newBadge}>
                                            <Text style={styles.newBadgeText}>{notifCount}</Text>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                            );
                        })}
                    </View>


                </ScrollView>

            </KeyboardAvoidingView>
            </SafeAreaView>
        );
      }
    else { //candidate matches
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
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
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.sectionTitle}>Projects</Text>
                                {projectNewCount > 0 && (
                                    <View style={styles.tabBadge}>
                                        <Text style={styles.tabBadgeText}>{projectNewCount}</Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                         <TouchableOpacity style={styles.tabButton} onPress={async () => {
                            setPage(false)}
                            }>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.sectionTitle && styles.activeTab}>Candidates</Text>
                                {candidateNewCount > 0 && (
                                    <View style={styles.tabBadge}>
                                        <Text style={styles.tabBadgeText}>{candidateNewCount}</Text>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>

                    </View>


                    {/* Content */}
                    <View style={styles.list}>
                        {candidateMatchesUI.map((match, index) => {
                            const notifCount = matchNotifs.get(String(match.match_id)) ?? 0;
                            const isNewMatch = newMatchIds.has(String(match.match_id));
                            return (
                            <TouchableOpacity key={index} onPress={async() => {gotoMatch(match.match_id)}}>
                                <View style={styles.match}>
                                    <Image source={{ uri: match.project_image }} style={styles.profileImage} />
                                    <Text>{match.candidate_name}</Text>
                                    {isNewMatch && (
                                        <View style={styles.newMatchPill}>
                                            <Text style={styles.newMatchPillText}>new</Text>
                                        </View>
                                    )}
                                    {notifCount > 0 && (
                                        <View style={styles.newBadge}>
                                            <Text style={styles.newBadgeText}>{notifCount}</Text>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                            );
                        })}
                    </View>


                </ScrollView>

            </KeyboardAvoidingView>
            </SafeAreaView>
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

  profileImage: { width: 60, height: 60, borderRadius: 60 },



tabButton: { flex : 1, alignItems : "center", paddingVertical: 8, 
  paddingHorizontal: 16, borderRadius: 8,backgroundColor: '#f5f5f5', justifyContent :"center"
},

tabsContainer: {
  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch', marginTop: 12, gap: 10, 
},


placeholderImage: { width: 60, height: 60, borderRadius: 60, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' },
  
activeTab : {fontWeight : "bold", fontSize : 18, justifyContent :"center"},

newBadge: {
    backgroundColor: 'red',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 6,
},
newBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
},
newMatchPill: {
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
},
newMatchPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
},
tabBadge: {
    backgroundColor: 'red',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
},
tabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
},
    
});


//TODO: change output so only a couple things change per projectPage bool
//TODO: add in images 