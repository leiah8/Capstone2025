import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

import { supabase } from '../../lib/supabase';

import { Message, DbMatch } from '../../lib/match';

import { Stack } from 'expo-router';

import { useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PersonUI } from '../../lib/profile';

/* ── Module-level cache (survives navigation, cleared on app restart) ── */
type CacheEntry = {
  conversationId: string | number;
  messages: Message[];
  person: PersonUI;
  projectName: string;
};
const chatCache = new Map<string, CacheEntry>();


export default function MatchesPage() {
    const { pid } = useLocalSearchParams(); // match_id
    const { session } = useAuth();
    const { markMatchSeen } = useNotifications();

    /* State */
    const cached = chatCache.get(String(pid));
    const [loading, setLoading] = useState(!cached);
    const [conversationId, setConversationId] = useState<string | number | null>(cached?.conversationId ?? null);
    const [messages, setMessages] = useState<Message[]>(cached?.messages ?? []);
    const [person, setPerson] = useState<PersonUI>(cached?.person ?? { id: '', name: '', image: '' });
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [projectName, setProjectName] = useState<string>(cached?.projectName ?? '');

    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollView>(null);

    /* ── 1. Load match, profile, conversation, initial messages ── */
    useEffect(() => {
        markMatchSeen(String(pid)); // clear "(new)" badge for this match
        (async () => {
          try {
            // Load the match (pid is match_id)
            const { data: matchData, error: matchError } = await supabase
              .from('matches')
              .select('*')
              .eq('id', pid)
              .single();

            if (matchError) {
              console.error('Error loading match:', matchError);
              return;
            }

            const match = matchData as DbMatch;

            // Load the project name
            const { data: projectData } = await supabase
              .from('projects')
              .select('title')
              .eq('id', match.project_id)
              .single();
            if (projectData) setProjectName(projectData.title);

            // Determine the other person
            const otherPersonId = match.owner_id === session?.user?.id
              ? match.candidate_id
              : match.owner_id;

            // Load the other person's profile
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', otherPersonId)
              .single();

            if (profileError && profileError.code !== 'PGRST116') {
              console.error('Error loading profile:', profileError);
            } else if (profileData) {
              setPerson(profileData as PersonUI);
            }

            // Find the conversation for this project
            const { data: convData, error: convError } = await supabase
              .from('conversations')
              .select('*')
              .eq('project_id', match.project_id)
              .single();

            if (convError && convError.code !== 'PGRST116') {
              console.error('Error loading conversation:', convError);
              return;
            }

            if (!convData) {
              setMessages([]);
              return;
            }

            setConversationId(convData.id);

            // Fetch existing messages ordered by time
            const { data: messagesData, error: messagesError } = await supabase
              .from('messages')
              .select('*')
              .eq('conversation_id', convData.id)
              .order('created_at', { ascending: true });

            if (messagesError) {
              console.error('Error loading messages:', messagesError);
            } else if (messagesData) {
              const freshMessages = messagesData as Message[];
              setMessages(freshMessages);
              // Update cache
              chatCache.set(String(pid), {
                conversationId: convData.id,
                messages: freshMessages,
                person: profileData as PersonUI ?? person,
                projectName: projectData?.title ?? projectName,
              });
            }

          } catch (e) {
            console.error('Error loading match data:', e);
          } finally {
            setLoading(false);
          }
        })();
      }, [session?.user?.id]);

    /* ── 2. Realtime subscription ── */
    useEffect(() => {
        if (!conversationId) return;

        const channel = supabase
          .channel(`conversation-${conversationId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter: `conversation_id=eq.${conversationId}`,
            },
            (payload) => {
              const newMessage = payload.new as Message;
              if (!newMessage) return;
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMessage.id)) return prev;
                const updated = [...prev, newMessage];
                const entry = chatCache.get(String(pid));
                if (entry) chatCache.set(String(pid), { ...entry, messages: updated });
                return updated;
              });
            }
          )
          .subscribe((status) => console.log('Realtime status:', status));

        return () => {
          supabase.removeChannel(channel);
        };
      }, [conversationId]);

    /* ── 3. Auto-scroll to bottom when messages update ── */
    useEffect(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, [messages]);

    /* ── 4. Send a message ── */
    const sendMessage = async () => {
        const body = input.trim();
        if (!body || !conversationId || !session?.user?.id) return;

        setSending(true);
        setInput('');

        // Optimistically show the message immediately
        const optimistic: Message = {
          id: `pending-${Date.now()}`,
          conversation_id: String(conversationId),
          sender_id: session.user.id,
          body,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimistic]);

        const { data: inserted, error } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: session.user.id,
          body,
        }).select().single();

        if (error) {
          console.error('Error sending message:', error);
          setInput(body);
          // Remove the optimistic message on failure
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        } else if (inserted) {
          // Replace optimistic message with the real one (gives it the real DB id)
          setMessages((prev) => prev.map((m) => m.id === optimistic.id ? inserted as Message : m));
        }

        setSending(false);
      };

    return (
      <>
      <Stack.Screen options={{
          headerShown: true,
          headerBackTitle: 'Back',
          headerTitle: () => (
              <View>
                    <Text style={styles.headerTitle}>{person?.name || ''}</Text>
                    {projectName ? <Text style={styles.sectionTitle}>{projectName}</Text> : null}
                </View>
          ),
        }}/>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
                {/* Messages */}
                <View style={styles.messagesContainer}>
                  <View style={styles.list}>
                      {messages.map((m, index) => (
                          <View
                            key={m.id ?? index}
                            style={[
                              styles.bubble,
                              m.sender_id === session?.user?.id ? styles.sentBubble : styles.receivedBubble,
                            ]}
                          >
                              <Text style={m.sender_id === session?.user?.id ? styles.sentText : styles.receivedText}>
                                {m.body}
                              </Text>
                          </View>
                      ))}
                  </View>
                </View>
            </ScrollView>

            {/* Input bar */}
            <View style={[styles.inputBar, { paddingBottom: (insets.bottom || 0) + 8 }]}>
              <TextInput
                style={styles.textInput}
                placeholder="Message..."
                placeholderTextColor="#aaa"
                value={input}
                onChangeText={setInput}
                onSubmitEditing={sendMessage}
                returnKeyType="send"
                editable={!sending}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendButton, (!input.trim() || sending) && styles.sendButtonDisabled]}
                onPress={sendMessage}
                disabled={!input.trim() || sending}
              >
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>

        </KeyboardAvoidingView>
        </>
    );
}

/* =========================
   Styles
   ========================= */
const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: '#ffffff' },
  scrollView: { flex: 1, paddingHorizontal: 20 },

  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },

  section: { marginBottom: 25 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: 'normal', color: '#333' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },

  profileImage: { width: 120, height: 120, borderRadius: 60 },
  placeholderImage: { width: 60, height: 60, borderRadius: 60, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' },

  list: {
    flexDirection: 'column',
    paddingVertical: 10,
  },

  messagesContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  bubble: {
    padding: 10,
    marginVertical: 4,
    borderRadius: 16,
    maxWidth: '75%',
  },
  sentBubble: {
    backgroundColor: '#1A1A1A',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: '#e8e8e8',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  sentText: {
    color: '#fff',
    fontSize: 15,
  },
  receivedText: {
    color: '#333',
    fontSize: 15,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    backgroundColor: '#fff',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 100,
    backgroundColor: '#fafafa',
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});