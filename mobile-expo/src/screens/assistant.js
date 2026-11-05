import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, Badge, Field, Button } from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { userErrorMessage } from '../services/userErrors.js';
import { askMoniBot } from '../services/monibotApi.js';
import { buildMoniBotHistory } from '../services/monibotHistory.js';

function AssistantMessage({ text }) {
  const parts = String(text).replace(/^\s*\*\s+/gm, '• ').split(/(\*\*[^*]+\*\*)/g);
  return <Text accessibilityLiveRegion="polite" style={styles.cardBody}>{parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <Text key={index} style={{ fontWeight: '700' }}>{part.slice(2, -2)}</Text>
    : part)}</Text>;
}

export function MoniBot({ getToken, activeRole, selectedSession, ...props }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [failedQuestion, setFailedQuestion] = useState(null);
  const sending = useRef(false);
  const send = async (retry = false) => {
    const text = (retry ? failedQuestion || '' : message).trim();
    if (!text || sending.current) return;
    sending.current = true; setBusy(true); setFailedQuestion(null);
    setMessage(current => current.trim() === text ? '' : current);
    setMessages(previous => retry ? previous.filter(item => item.from !== 'error')
      : [...previous, { id: `u-${Date.now()}`, from: 'user', text }]);
    try {
      const token = await getToken();
      const history = buildMoniBotHistory(messages);
      const answer = await askMoniBot({ token, role: activeRole, message: text, history, context: { screen: 'bot', sessionId: selectedSession?.id } });
      setMessages(previous => [...previous, { id: `b-${Date.now()}`, from: 'bot', text: answer }]);
    } catch (error) {
      setFailedQuestion(text); setMessage(current => current || text);
      setMessages(previous => [...previous, { id: `e-${Date.now()}`, from: 'error', text: userErrorMessage(error) }]);
    } finally { sending.current = false; setBusy(false); }
  };
  return <Screen {...props} title="MoniBot" subtitle="Ajuda sobre suas monitorias">{messages.map(item => <View key={item.id} style={[styles.chat, item.from === 'user' ? styles.chatUser : styles.chatBot]}>{item.from === 'user' ? <Text style={styles.chatUserText}>{item.text}</Text> : item.from === 'error' ? <><Badge tone="error">Resposta não recebida</Badge><Text style={styles.cardBody}>{item.text}</Text></> : <AssistantMessage text={item.text} />}</View>)}<Field label="Mensagem" value={message} onChangeText={setMessage} placeholder="Como posso encontrar uma monitoria?" multiline /><Button label={busy ? 'Consultando…' : 'Enviar'} disabled={busy} onPress={() => send()} />{failedQuestion ? <Button label="Tentar novamente" variant="outline" disabled={busy} onPress={() => send(true)} /> : null}<Text style={styles.caption}>O MoniBot não acessa senhas, tokens, notas ou dados pessoais de terceiros.</Text></Screen>;
}
