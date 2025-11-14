// import { Platform, StyleSheet } from 'react-native';

import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

import { supabase } from '../../lib/supabase';

import { Message } from '../../lib/match';

import { Stack } from 'expo-router';




import { useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { PersonUI } from '../../lib/profile';


export default function MatchesPage() {
    const { pid } = useLocalSearchParams(); //the id of the person you are talking to 
    const { signOut, session } = useAuth();

    //todo: import project/candidate id 

    /* State */
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);

    const [projectsPage, setPage] = useState(true);


    const[messages, setMessages] = useState<Message[]>([]);

    const[person, setPerson] = useState<PersonUI>({id : "", name : "", image : ""});

     const messageTest : Message[] = [{
            id: "1",
            conversation_id: "2",
            sender_id : "3",
            body : "Hi!",
            created_at : "5"
        }]

    /*Load Matches */

    useEffect(() => {
        (async () => {
            //get project matches
          try {
            //TODO: get conversation using pid and session_user_id
            //then get messages 

            //getting profile of person you are talking to 
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', pid)
              .single()
    
            if (error && error.code !== 'PGRST116') {
              console.error('Error loading project matches:', error);
            } else if (data) {

                setPerson(data as PersonUI)
                            
            }

            //getting all the projects they matched on 
            /*
            const { data : d2, error : e2 } = await supabase
              .from('matches')
              .select('*')
              .eq('id', pid)
              .single()
    
            if (e2 && e2.code !== 'PGRST116') {
              console.error('Error loading project matches:', e2);
            } else if (d2) {

                //TODO here
                            
            } */



          } catch (e) {
            console.error('Error loading project matches:', e);
          } finally {
            setLoading(false);
          }

          //REMOVE HERE
          setMessages(messageTest)

          //TODO order messages by time

        
        })();
      }, [session?.user?.id]);
      
    return (
      <>
      <Stack.Screen options={{
          headerShown: true, title: person?.name || '',  headerTitle: () => (
              <View style={{}}>
                    <Text style={styles.headerTitle}>{person?.name || ""}</Text>
                    <Text style={styles.sectionTitle}>Project Name(s)</Text>
                </View>
          ),
        }}/>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>  
            <ScrollView contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'flex-end', 
      }}
      style={styles.scrollView} showsVerticalScrollIndicator={false}>
                

                {/* Content */}
                <View style={styles.messagesContainer}>
                  <View style={styles.list}>
                      {messages.map((m, index) => (
                          <View style={styles.recieveMsg}>
                              <Text key={index}>{m.body}</Text>
                          </View>
                      ))}
                </View>
                </View>

                {/*Message Box */}

                <View style={styles.typeMessageBox}> 
                  <Text style={styles.typeMessageText}>Message...</Text>
                </View>

                

            </ScrollView>            
        </KeyboardAvoidingView>
        </>
    );
      
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({


  // recieveMsg : {justifyContent: 'flex-start', flex : 0.5, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8,backgroundColor: '#f5f5f5'},

  container: { flex: 1, backgroundColor: '#ffffff' },
  scrollView: { flex: 1, padding: 20 },

  headerTitle: { fontSize: 28, fontWeight: '700', color: '#333' },

  section: { marginBottom: 25 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: 'normal', color: '#333' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  profileImage: { width: 120, height: 120, borderRadius: 60 },
  placeholderImage: { width: 60, height: 60, borderRadius: 60, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' },
  

  list: {
    justifyContent: 'flex-end', 
    flexDirection: 'column-reverse', 
    padding: 20,
  },
  recieveMsg: {
    backgroundColor: '#ddd',
    padding: 10,
    marginVertical: 5,
    borderRadius: 10,
    width : "75%"
  },

  messagesContainer : {
    flex: 1, 
    justifyContent: 'flex-end', 
  },

  typeMessageBox : {
    borderWidth : 1, 
    borderRadius : 10, 
    borderColor : "#ddd", 
  },

  typeMessageText : {
    margin : 10, 
    color : "#aaa"
  }
    
});


//TODO: change output so only a couple things change per projectPage bool
//TODO: add in images 