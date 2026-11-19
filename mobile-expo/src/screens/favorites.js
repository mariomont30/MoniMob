import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, Card, Button, Badge, Choice } from '../components/ui.js';
import { favoriteItems, favoriteLabels } from '../domain/favorites.js';
import { displayDate, availabilityLabel } from '../services/presentation.js';
import { styles } from '../theme/styles.js';

export function Favorites({
  state,
  user,
  openSession,
  removeFavorite,
  reloadData,
  go,
  ...props
}) {
  const [filter, setFilter] = useState('');
  const all = favoriteItems(state, user.id);
  const items = all.filter(
    (item) =>
      !filter ||
      (filter === 'upcoming'
        ? item.availability === 'upcoming'
        : item.availability !== 'upcoming'),
  );
  return (
    <Screen
      {...props}
      title="Meus favoritos"
      subtitle="Monitorias salvas para consultar depois"
    >
      <Button
        label="Atualizar favoritos"
        variant="outline"
        onPress={reloadData}
      />
      <View style={styles.choiceRow}>
        {[
          ['', 'Todos'],
          ['upcoming', 'Próximas'],
          ['history', 'Encerradas e indisponíveis'],
        ].map(([value, label]) => (
          <Choice
            key={value}
            label={label}
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </View>
      <Text style={styles.meta}>
        {items.length} favorito(s). Salvar uma monitoria não reserva uma vaga.
      </Text>
      {!items.length ? (
        <Card>
          <Text style={styles.cardTitle}>Nenhum favorito nesta seleção</Text>
          <Text style={styles.cardBody}>
            Use Adicionar aos favoritos nos detalhes de uma monitoria. Sua lista
            fica salva na sua conta.
          </Text>
          <Button label="Explorar monitorias" onPress={() => go('catalog')} />
        </Card>
      ) : null}
      {items.map((item) => {
        const session = item.session;
        const course = state.disciplines.find(
          (d) => d.id === session?.disciplineId,
        );
        const live = state.sessions.find((s) => s.id === item.sessionId);
        const reserved =
          live?.reservedCount ??
          state.reservations.filter(
            (r) => r.sessionId === item.sessionId && r.status === 'confirmed',
          ).length;
        return (
          <Card
            key={item.id}
            onPress={item.canOpen ? () => openSession(live) : undefined}
          >
            <Badge
              tone={item.availability === 'upcoming' ? 'success' : 'warning'}
            >
              {favoriteLabels[item.availability]}
            </Badge>
            <Text style={styles.cardTitle}>
              {session?.topic || 'Monitoria indisponível'}
            </Text>
            {course ? (
              <Text style={styles.cardBody}>
                {course.code} · {course.name}
              </Text>
            ) : null}
            {session?.date ? (
              <Text style={styles.meta}>
                {displayDate(session.date)} · {session.time}
              </Text>
            ) : null}
            {live && item.availability === 'upcoming' ? (
              <Text style={styles.meta}>
                {availabilityLabel(live.capacity, reserved)}
              </Text>
            ) : null}
            {item.canOpen ? (
              <Button
                label="Ver detalhes da monitoria"
                variant="outline"
                onPress={() => openSession(live)}
              />
            ) : null}
            <Button
              label="Remover dos favoritos"
              variant="outline"
              onPress={() => removeFavorite(item.sessionId)}
            />
          </Card>
        );
      })}
    </Screen>
  );
}
