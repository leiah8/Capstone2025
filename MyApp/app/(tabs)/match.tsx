// import { Platform, StyleSheet } from 'react-native';



import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

import { supabase } from '../lib/supabase';

import { Message } from '../lib/match';



import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';


export default function MatchesPage() {
    const { signOut, session } = useAuth();

    //todo: import project/candidate id 

    /* State */
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);

    const [projectsPage, setPage] = useState(true);


    const[messages, setMessages] = useState<Message[]>([]);

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
            const { data, error } = await supabase
              .from('messages')
              .select('*')
              .eq('conversation_id', session?.user?.id) //TODO HERE, match to person
    
            if (error && error.code !== 'PGRST116') {
              console.error('Error loading project matches:', error);
            } else if (data) {


                setMessages(data as Message[])

                            
            }
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>  
            <ScrollView contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'flex-end', 
      }}
      style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View>
                    <Text style={styles.headerTitle}>Name</Text>
                </View>

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

                

            </ScrollView>            
        </KeyboardAvoidingView>
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
  sectionTitle: { fontSize: 18, fontWeight: 'normal', color: '#333' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  profileImage: { width: 120, height: 120, borderRadius: 60 },
  placeholderImage: { width: 60, height: 60, borderRadius: 60, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' },
  

  list: {
    justifyContent: 'flex-end', // Pushes to bottom
    flexDirection: 'column-reverse', // Renders children from bottom to top
    padding: 20,
  },
  recieveMsg: {
    backgroundColor: '#ddd',
    padding: 10,
    marginVertical: 5,
    borderRadius: 4,
    width : "75%"
  },

  messagesContainer : {
    flex: 1, // makes it take up full screen
    justifyContent: 'flex-end', // pushes content to bottom
  }
    
});


//TODO: change output so only a couple things change per projectPage bool
//TODO: add in images 