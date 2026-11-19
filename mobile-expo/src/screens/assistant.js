import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, Badge, Field, Button } from '../components/ui.js';
import { assistantBlocks } from '../services/presentation.js';
import { styles } from '../theme/styles.js';
import { userErrorMessage } from '../services/userErrors.js';
import { askMoniBot } from '../services/monibotApi.js';
import { buildMoniBotHistory } from '../services/monibotHistory.js';
import { MoniBotThinking } from '../components/monibotThinking.js';

function AssistantMessage({ text }) {
  return (
    <View accessible accessibilityLiveRegion="polite" style={{ gap: 8 }}>
      {assistantBlocks(text).map((line, index) => (
        <Text key={index} style={[styles.cardBody, line.heading && { fontWeight: '700' }]}>
          {line.parts.map((part, i) => (
            <Text
              key={i}
              style={[
                part.strong && { fontWeight: '700' },
                part.code && { fontFamily: 'monospace' },
              ]}
            >
              {part.text}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  );
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
    sending.current = true;
    setBusy(true);
    setFailedQuestion(null);
    setMessage((current) => (current.trim() === text ? '' : current));
    setMessages((previous) =>
      retry
        ? previous.filter((item) => item.from !== 'error')
        : [...previous, { id: `u-${Date.now()}`, from: 'user', text }],
    );
    try {
      const token = await getToken();
      const history = buildMoniBotHistory(messages);
      const answer = await askMoniBot({
        token,
        role: activeRole,
        message: text,
        history,
        context: { screen: 'bot', sessionId: selectedSession?.id },
      });
      setMessages((previous) => [
        ...previous,
        { id: `b-${Date.now()}`, from: 'bot', text: answer },
      ]);
    } catch (error) {
      setFailedQuestion(text);
      setMessage((current) => current || text);
      setMessages((previous) => [
        ...previous,
        { id: `e-${Date.now()}`, from: 'error', text: userErrorMessage(error) },
      ]);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen {...props} title="MoniBot" subtitle="Seu assistente de monitorias">
      <Badge>Assistente com inteligência artificial</Badge>
      {!messages.length ? (
        <View style={styles.assistantWelcome}>
          <Text style={styles.heroTitle}>Olá! Como posso ajudar?</Text>
          <Text style={styles.cardBody}>
            Tire dúvidas de Ciências da Computação, organize seus estudos ou
            consulte suas monitorias e o funcionamento do MoniMob.
          </Text>
        </View>
      ) : null}
      {messages.map((item) => (
        <View
          key={item.id}
          style={[styles.chat, item.from === 'user' ? styles.chatUser : styles.chatBot]}
        >
          {item.from === 'user' ? (
            <Text style={styles.chatUserText}>{item.text}</Text>
          ) : item.from === 'error' ? (
            <>
              <Badge tone="error">Resposta não recebida</Badge>
              <Text style={styles.cardBody}>{item.text}</Text>
            </>
          ) : (
            <AssistantMessage text={item.text} />
          )}
        </View>
      ))}
      {busy ? <MoniBotThinking /> : null}
      <Field
        label="Mensagem"
        value={message}
        onChangeText={setMessage}
        placeholder="Como posso encontrar uma monitoria?"
        multiline
        maxLength={800}
      />
      <Button label={busy ? 'Consultando…' : 'Enviar'} disabled={busy} onPress={() => send()} />
      {failedQuestion ? (
        <Button
          label="Tentar novamente"
          variant="outline"
          disabled={busy}
          onPress={() => send(true)}
        />
      ) : null}
      <Text style={styles.caption}>
        Não envie senhas, documentos ou dados pessoais. Respostas de IA podem conter
        erros: confirme decisões acadêmicas com o professor. O MoniBot orienta os
        estudos e não fornece gabaritos de avaliações nem executa ações na sua conta.
      </Text>
    </Screen>
  );
}
