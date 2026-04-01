import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

import { supabase } from '../../lib/supabase';

import { Message, DbMatch } from '../../lib/match';

import { Stack, router } from 'expo-router';

import { useLocalSearchParams } from 'expo-router';
import {
  Image,
  ImageBackground,
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
import { Ionicons } from '@expo/vector-icons';
import { PersonUI, resolveProfileImageUrl } from '../../lib/profile';
import { formatMessageTime } from '../../lib/format-time';

/* ── Module-level cache (survives navigation, cleared on app restart) ── */
type CacheEntry = {
  conversationId: string | number;
  messages: Message[];
  person: PersonUI;
  projectName: string;
  projectImage: string;
};
const chatCache = new Map<string, CacheEntry>();


export default function MatchesPage() {
    const { pid } = useLocalSearchParams(); // match_id
    const { session } = useAuth();
    const { setActiveMatchId } = useNotifications();

    /* State */
    const cached = chatCache.get(String(pid));
    const [loading, setLoading] = useState(!cached);
    const [conversationId, setConversationId] = useState<string | number | null>(cached?.conversationId ?? null);
    const [messages, setMessages] = useState<Message[]>(cached?.messages ?? []);
    const [person, setPerson] = useState<PersonUI>(cached?.person ?? { id: '', name: '', image: '' });
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [projectName, setProjectName] = useState<string>(cached?.projectName ?? '');
    const [projectImage, setProjectImage] = useState<string>(cached?.projectImage ?? '');

    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollView>(null);

    /* ── 1. Load match, profile, conversation, initial messages ── */
    useEffect(() => {
        setActiveMatchId(String(pid)); // suppress + clear notifications while in chat

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
              .select('title, image')
              .eq('id', match.project_id)
              .single();
            if (projectData) {
              setProjectName(projectData.title);
              setProjectImage(projectData.image ?? '');
            }

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
              setPerson({
                id: profileData.id,
                name: profileData.name,
                image: resolveProfileImageUrl(profileData.profile_image ?? null, profileData.id),
              });
            }

            // Find the conversation shared between both participants
            // Step 1: get all conversation_ids the current user is in
            const { data: myParts } = await supabase
              .from('conversation_participants')
              .select('conversation_id')
              .eq('user_id', session!.user.id);
            const myConvIds = (myParts ?? []).map((r) => r.conversation_id);

            // Step 2: find which of those also has the other person
            let convData = null;
            if (myConvIds.length > 0) {
              const { data: shared } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', otherPersonId)
                .in('conversation_id', myConvIds)
                .limit(1)
                .maybeSingle();
              if (shared) {
                const { data: conv } = await supabase
                  .from('conversations')
                  .select('*')
                  .eq('id', shared.conversation_id)
                  .single();
                convData = conv;
              }
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
                person: profileData ? {
                  id: profileData.id,
                  name: profileData.name,
                  image: resolveProfileImageUrl(profileData.profile_image ?? null, profileData.id),
                } : person,
                projectName: projectData?.title ?? projectName,
                projectImage: projectData?.image ?? projectImage,
              });
            }

          } catch (e) {
            console.error('Error loading match data:', e);
          } finally {
            setLoading(false);
          }
        })();

        return () => setActiveMatchId(null); // re-enable notifications on leave
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
          contentStyle: { backgroundColor: '#fff' },
          header: () => (
            <View style={styles.customHeader}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="chevron-back" size={32} color="#79BE58" />
              </TouchableOpacity>
              <View style={styles.headerRow}>
                {person?.image ? (
                  <Image source={{ uri: person.image }} style={styles.headerAvatar} />
                ) : (
                  <View style={styles.headerAvatarPlaceholder}>
                    <Ionicons name="person" size={18} color="#999" />
                  </View>
                )}
                <Text style={styles.headerName} numberOfLines={1}>{person?.name || ''}</Text>
              </View>
            </View>
          ),
        }}/>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 130 : 0}
        >

            <ImageBackground
              source={projectImage ? { uri: projectImage } : undefined}
              style={{ flex: 1 }}
              imageStyle={{ opacity: 0.06 }}
              resizeMode="cover"
            >
              <ScrollView
                ref={scrollRef}
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                  {projectName ? (
                    <Text style={styles.projectBanner}>{projectName}</Text>
                  ) : null}
                  {/* Messages */}
                  <View style={styles.messagesContainer}>
                    <View style={styles.list}>
                        {messages.map((m, index) => {
                          const isSent = m.sender_id === session?.user?.id;
                          return (
                            <View key={m.id ?? index} style={{ alignSelf: isSent ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                              <View style={[styles.bubble, isSent ? styles.sentBubble : styles.receivedBubble]}>
                                <Text style={isSent ? styles.sentText : styles.receivedText}>
                                  {m.body}
                                </Text>
                              </View>
                              <Text style={[styles.timestamp, { alignSelf: isSent ? 'flex-end' : 'flex-start' }]}>
                                {formatMessageTime(m.created_at)}
                              </Text>
                            </View>
                          );
                        })}
                    </View>
                  </View>
              </ScrollView>
            </ImageBackground>

            {/* Input bar */}
            <View style={[styles.inputBar, { paddingBottom: (insets.bottom || 0) + 20 }]}>
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

  customHeader: {
    backgroundColor: '#fff',
    paddingTop: 54,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 8,
    top: 54,
    bottom: 0,
    justifyContent: 'center',
    padding: 8,
  },
  backText: {
    color: '#007AFF',
    fontSize: 17,
  },
  headerRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#79BE58',
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8e8e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginTop: 4,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  projectBanner: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    paddingVertical: 10,
  },

  section: { marginBottom: 25 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
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
    marginTop: 4,
    borderRadius: 16,
  },
  sentBubble: {
    backgroundColor: '#1A1A1A',
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: '#e8e8e8',
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
  timestamp: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    marginBottom: 4,
    marginHorizontal: 4,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 14,
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
    backgroundColor: '#79BE58',
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