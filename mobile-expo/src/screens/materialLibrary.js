import { latestReview } from '../domain/review.js';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Screen,
  Card,
  Button,
  Choice,
  Field,
  Badge,
} from '../components/ui.js';
import {
  canReadMaterial,
  canDeleteMaterial,
  canEditMaterial,
  materialOwner,
} from '../domain/materialAccess.js';
import { styles } from '../theme/styles.js';

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
const labels = {
  approved: 'Publicado',
  pending: 'Aguardando aprovação',
  rejected: 'Recusado',
  adjustments_requested: 'Ajustes solicitados',
};

export function MaterialLibrary({
  state,
  user,
  role,
  create,
  edit,
  remove,
  review,
  openMaterial,
  reloadData,
  ...props
}) {
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('');
  const [authorRole, setAuthorRole] = useState('');
  const [scope, setScope] = useState('');
  const visible = state.materials.filter(
    (item) =>
      item.status !== 'deleted' && canReadMaterial(state, user, role, item),
  );
  const courses = state.disciplines.filter((item) =>
    visible.some((material) => material.disciplineId === item.id),
  );
  const ownerRole = (item) =>
    item.ownerRole || (item.monitorId ? 'monitor' : 'professor');
  const authorName = (item) =>
    state.users.find((person) => person.id === materialOwner(item))?.name ||
    'Conta desativada';
  const items = visible
    .filter(
      (item) =>
        (!course || course === item.disciplineId) &&
        (!authorRole || ownerRole(item) === authorRole) &&
        (!scope ||
          (scope === 'mine'
            ? materialOwner(item) === user.id
            : item.professorId === user.id && item.status === 'pending')) &&
        normalize(
          [
            item.title,
            item.fileName,
            authorName(item),
            state.disciplines.find((d) => d.id === item.disciplineId)?.name,
          ].join(' '),
        ).includes(normalize(query.trim())),
    )
    .sort(
      (a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(
          String(a.updatedAt || a.createdAt || ''),
        ) || String(a.title || '').localeCompare(String(b.title || '')),
    );
  const subtitle =
    role === 'student'
      ? 'Conteúdos publicados pelo professor e aprovados do monitor'
      : role === 'monitor'
        ? 'Seus envios e os conteúdos publicados das suas disciplinas'
        : 'Publique conteúdos e acompanhe a aprovação dos envios';
  return (
    <Screen
      {...props}
      role={role}
      title={role === 'student' ? 'Materiais' : 'Materiais da disciplina'}
      subtitle={subtitle}
    >
      {create ? <Button label="Cadastrar material" onPress={create} /> : null}
      <Button
        label="Atualizar materiais"
        variant="outline"
        onPress={reloadData}
      />
      <Field
        label="Pesquisar materiais"
        placeholder="Título, arquivo, autor ou disciplina"
        value={query}
        onChangeText={setQuery}
      />
      <View style={styles.choiceRow}>
        <Choice
          label="Todas as disciplinas"
          selected={!course}
          onPress={() => setCourse('')}
        />
        {courses.map((item) => (
          <Choice
            key={item.id}
            label={`${item.code} · ${item.name}`}
            selected={course === item.id}
            onPress={() => setCourse(item.id)}
          />
        ))}
      </View>
      <View style={styles.choiceRow}>
        {[
          ['', 'Todos os autores'],
          ['professor', 'Professor'],
          ['monitor', 'Monitor'],
        ].map(([value, label]) => (
          <Choice
            key={value}
            label={label}
            selected={authorRole === value}
            onPress={() => setAuthorRole(value)}
          />
        ))}
      </View>
      {role !== 'student' ? (
        <View style={styles.choiceRow}>
          <Choice
            label="Biblioteca completa"
            selected={!scope}
            onPress={() => setScope('')}
          />
          <Choice
            label="Meus envios"
            selected={scope === 'mine'}
            onPress={() => setScope('mine')}
          />
          {role === 'professor' ? (
            <Choice
              label="Aguardando minha aprovação"
              selected={scope === 'pending'}
              onPress={() => setScope('pending')}
            />
          ) : null}
        </View>
      ) : null}
      <Text style={styles.meta}>{items.length} material(is) encontrado(s)</Text>
      {!items.length ? (
        <Card>
          <Text style={styles.cardTitle}>Nenhum material nesta seleção</Text>
          <Text style={styles.cardBody}>
            {role === 'student'
              ? 'Os conteúdos aparecerão após a publicação do professor ou a aprovação do material do monitor.'
              : 'Atualize a lista ou ajuste os filtros. Seus envios pendentes continuam disponíveis para acompanhamento.'}
          </Text>
        </Card>
      ) : null}
      {items.map((item) => {
        const course = state.disciplines.find(
          (d) => d.id === item.disciplineId,
        );
        const approval = latestReview(state, 'material', item.id);
        return (
          <Card key={item.id}>
            <View style={styles.rowBetween}>
              <Badge>{course?.code}</Badge>
              <Badge
                tone={
                  item.status === 'approved' && !item.archived
                    ? 'success'
                    : 'warning'
                }
              >
                {item.archived
                  ? 'Arquivado'
                  : labels[item.status] || item.status}
              </Badge>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>{course?.name}</Text>
            <Text style={styles.meta}>
              Autor: {authorName(item)} ·{' '}
              {ownerRole(item) === 'professor' ? 'Professor' : 'Monitor'}
            </Text>
            <Text style={styles.meta}>
              {item.fileName
                ? `${item.fileName} · ${(item.fileSize / 1024).toFixed(0)} KB`
                : 'Link HTTPS'}
            </Text>
            {item.status === 'pending' ? (
              <Text style={styles.cardBody}>
                Enviado ao professor responsável. Os alunos terão acesso após a
                aprovação.
              </Text>
            ) : null}
            {item.status !== 'pending' && approval?.comment ? (
              <Text style={styles.cardBody}>
                Observação do professor: {approval.comment}
              </Text>
            ) : null}
            <View style={styles.actionWrap}>
              {!item.archived ? (
                <Button
                  compact
                  variant="outline"
                  label={
                    role === 'student'
                      ? 'Abrir material'
                      : item.fileId
                        ? 'Abrir arquivo'
                        : 'Abrir link'
                  }
                  onPress={() => openMaterial(item)}
                />
              ) : null}
              {role === 'professor' &&
              item.professorId === user.id &&
              item.status === 'pending' &&
              review ? (
                <Button
                  compact
                  label="Analisar material"
                  onPress={() => review(item)}
                />
              ) : null}
              {canEditMaterial(state, user, role, item) ? (
                <Button
                  compact
                  variant="outline"
                  label={
                    item.status === 'adjustments_requested'
                      ? 'Corrigir e reenviar'
                      : 'Editar'
                  }
                  onPress={() => edit(item)}
                />
              ) : null}
              {canDeleteMaterial(state, user, role, item) ? (
                <Button
                  compact
                  variant="delete"
                  label="Excluir material"
                  onPress={() => remove(item)}
                />
              ) : null}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
