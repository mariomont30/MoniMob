import React from 'react';
import { Text, View } from 'react-native';
import { Screen, Card, Button, Badge } from '../components/ui.js';
import { monitorAdjustments } from '../domain/review.js';
import { styles } from '../theme/styles.js';

export function Adjustments({
  state,
  user,
  editSession,
  editMaterial,
  reloadData,
  ...props
}) {
  const items = monitorAdjustments(state, user.id);
  return (
    <Screen
      {...props}
      title="Ajustes solicitados"
      subtitle="Leia a orientação, corrija e reenvie ao professor"
    >
      <Button
        label="Atualizar ajustes"
        variant="outline"
        onPress={reloadData}
      />
      {!items.length ? (
        <Card>
          <Text style={styles.cardTitle}>Nenhum ajuste pendente</Text>
          <Text style={styles.cardBody}>
            Os itens reenviados aguardam a nova análise do professor. Acompanhe
            a situação em Monitorias ou Materiais.
          </Text>
        </Card>
      ) : null}
      {items.map(({ kind, item, feedback }) => (
        <Card key={kind + '-' + item.id}>
          <View style={styles.rowBetween}>
            <Badge>{kind === 'session' ? 'Monitoria' : 'Material'}</Badge>
            <Badge tone="warning">
              {item.authorizationInvalid
                ? 'Prazo precisa de correção'
                : 'Ajustes solicitados'}
            </Badge>
          </View>
          <Text style={styles.cardTitle}>{item.topic || item.title}</Text>
          <Text style={styles.meta}>
            {state.disciplines.find((d) => d.id === item.disciplineId)?.name}
          </Text>
          <Text style={styles.cardBody}>
            {feedback?.decision === 'adjustments_requested' && feedback.comment
              ? feedback.comment
              : 'Confira a data, o horário e a duração dentro do período autorizado pelo professor.'}
          </Text>
          <Button
            label="Corrigir e reenviar"
            onPress={() =>
              kind === 'session' ? editSession(item) : editMaterial(item)
            }
          />
        </Card>
      ))}
    </Screen>
  );
}
