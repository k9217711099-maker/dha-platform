import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme } from './theme';
import { api } from './api';

interface Msg {
  role: 'user' | 'ai' | 'staff';
  text: string;
}

const GREETING: Msg = {
  role: 'ai',
  text: 'Здравствуйте! Я AI-администратор D Hotels & Apartments 🙂 Помогу подобрать номер, рассчитать цену и оформить бронь. Чем могу помочь?',
};

/**
 * Плавающая кнопка + модалка чата с гостевым AI-агентом (POST /ai/guest/message).
 * Только core-RN (Expo 56 / RN 0.85). Сложные вопросы агент эскалирует на backend.
 */
export function AiChatFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [convId, setConvId] = useState<string | undefined>();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const scRef = useRef<ScrollView>(null);
  // Сколько ответов оператора (staff) уже показано — курсор опроса.
  const staffShown = useRef(0);

  async function send() {
    const q = text.trim();
    if (!q || busy) return;
    setMessages((s) => [...s, { role: 'user', text: q }]);
    setText('');
    setBusy(true);
    try {
      const res = await api.aiGuestMessage(q, convId);
      setConvId(res.conversationId);
      setMessages((s) => [...s, { role: 'ai', text: res.reply }]);
      if (res.escalated) setEscalated(true);
    } catch {
      setMessages((s) => [...s, { role: 'ai', text: 'Извините, не получилось ответить. Попробуйте ещё раз.' }]);
    } finally {
      setBusy(false);
    }
  }

  // После эскалации опрашиваем тред и подкладываем новые ответы оператора (STAFF).
  useEffect(() => {
    if (!open || !escalated || !convId) return;
    let alive = true;
    async function poll() {
      try {
        const thread = await api.aiGuestConversation(convId!);
        if (!alive) return;
        const staff = thread.filter((m) => m.role === 'staff');
        if (staff.length > staffShown.current) {
          const fresh = staff.slice(staffShown.current).map((m) => ({ role: 'staff' as const, text: m.text }));
          staffShown.current = staff.length;
          setMessages((s) => [...s, ...fresh]);
        }
      } catch {
        /* сеть моргнула — повторим на следующем тике */
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open, escalated, convId]);

  return (
    <>
      <Pressable style={cs.fab} onPress={() => setOpen(true)} accessibilityLabel="Открыть чат с AI-администратором">
        <Text style={cs.fabIcon}>💬</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={cs.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={cs.sheet}
          >
            <View style={cs.head}>
              <Text style={cs.headTitle}>AI-администратор</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={cs.close}>×</Text>
              </Pressable>
            </View>

            {escalated && (
              <View style={cs.escBanner}>
                <Text style={cs.escText}>Вопрос передан администратору — ответит здесь же</Text>
              </View>
            )}

            <ScrollView
              ref={scRef}
              style={cs.list}
              contentContainerStyle={{ padding: 12, gap: 8 }}
              onContentSizeChange={() => scRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((m, i) => (
                <View key={i} style={m.role === 'user' ? cs.rowEnd : cs.rowStart}>
                  {m.role === 'staff' && <Text style={cs.staffLabel}>Администратор</Text>}
                  <View
                    style={[
                      cs.bubble,
                      m.role === 'user' ? cs.bubbleUser : m.role === 'staff' ? cs.bubbleStaff : cs.bubbleAi,
                    ]}
                  >
                    <Text style={m.role === 'user' ? cs.txtUser : cs.txtAi}>{m.text}</Text>
                  </View>
                </View>
              ))}
              {busy && (
                <View style={cs.rowStart}>
                  <View style={[cs.bubble, cs.bubbleAi]}>
                    <ActivityIndicator color={theme.darkGray} />
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={cs.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Сообщение…"
                placeholderTextColor="#999"
                style={cs.input}
                onSubmitEditing={() => void send()}
                returnKeyType="send"
              />
              <Pressable
                style={[cs.sendBtn, (!text.trim() || busy) && { opacity: 0.4 }]}
                onPress={() => void send()}
                disabled={!text.trim() || busy}
              >
                <Text style={cs.sendIcon}>›</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const cs = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 74,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabIcon: { fontSize: 24 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    height: '80%',
    backgroundColor: theme.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.ink,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headTitle: { color: theme.white, fontSize: 15 },
  close: { color: theme.white, fontSize: 24, lineHeight: 24 },
  list: { flex: 1, backgroundColor: theme.white },
  rowStart: { alignItems: 'flex-start' },
  rowEnd: { alignItems: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleUser: { backgroundColor: theme.ink },
  bubbleAi: { backgroundColor: theme.beige },
  bubbleStaff: { backgroundColor: theme.white, borderWidth: 1, borderColor: theme.line },
  staffLabel: { fontSize: 11, color: theme.darkGray, marginBottom: 2, marginLeft: 4 },
  txtUser: { color: theme.white, fontSize: 14 },
  txtAi: { color: theme.ink, fontSize: 14 },
  escBanner: { backgroundColor: theme.beige, paddingVertical: 6, paddingHorizontal: 16 },
  escText: { fontSize: 11, color: theme.darkGray, textAlign: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: theme.line,
    backgroundColor: theme.white,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.ink,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: theme.white, fontSize: 20 },
});
